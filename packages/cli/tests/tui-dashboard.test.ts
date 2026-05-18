import { describe, expect, test } from "bun:test"

import { Effect, Option } from "effect"

import {
  commandPlanForSelection,
  createDashboardState,
  DashboardAction,
  dashboardTabs,
  dispatchDashboard,
  visibleRepositoryRows,
  visibleTaskRows,
  type DashboardState
} from "../src/tui/dashboard.ts"
import { handleDashboardKey } from "../src/tui/keyboard.ts"
import type { VendorTuiSnapshot } from "../src/tui/status.ts"

const snapshot = {
  candidates: [
    {
      packageName: "effect",
      repositoryUrl: "https://github.com/Effect-TS/effect.git",
      status: "matched"
    },
    {
      packageName: "left-pad",
      status: "missing-repository"
    }
  ],
  repos: [
    {
      name: "effect",
      packageNames: ["effect"],
      path: "vendor/effect",
      ref: "main",
      source: "https://github.com/Effect-TS/effect.git",
      strategy: "subtree",
      versions: {
        local: "effect@3.21.2 (bun-lock)",
        remote: "effect@3.21.3 (npm latest)",
        status: "remote-drift",
        vendor: "effect@3.21.2 (vendored source)"
      }
    }
  ],
  tasks: [
    {
      action: "add",
      existingName: null,
      packageNames: ["effect", "@effect/platform"],
      primaryPackageName: "effect",
      repositoryUrl: "https://github.com/Effect-TS/effect.git",
      suggestedName: "effect",
      versions: {
        local: "effect@3.21.2 (bun-lock)",
        remote: "effect@3.21.2 (npm latest)",
        status: "not-vendored",
        vendor: "not vendored"
      }
    },
    {
      action: "update",
      existingName: "convex",
      packageNames: ["convex"],
      primaryPackageName: "convex",
      repositoryUrl: "https://github.com/get-convex/convex-js.git",
      suggestedName: "convex",
      versions: {
        local: "convex@1.29.0 (node_modules)",
        remote: "convex@1.30.0 (npm latest)",
        status: "remote-drift",
        vendor: "convex@1.29.0 (vendored source)"
      }
    }
  ]
} satisfies VendorTuiSnapshot

describe("tui dashboard", () => {
  test("includes a repositories tab", () => {
    expect(dashboardTabs).toContain("repositories")
    expect(visibleRepositoryRows(snapshot)).toEqual([
      "effect                       subtree      effect                       effect@3.21.2 (bun-lock)         effect@3.21.2 (vendored source)  effect@3.21.3 (npm latest)       remote-drift"
    ])
  })

  test("tracks focus and selected task rows independently", () => {
    const selected = dispatchDashboard(
      dispatchDashboard(createDashboardState(snapshot), DashboardAction.MoveDown()),
      DashboardAction.ToggleSelected()
    )

    expect(selected.focusedTaskIndex).toBe(1)
    expect(selected.selectedTaskIndexes).toEqual([1])
    expect(visibleTaskRows(selected)).toEqual([
      "  [ ] ADD    effect, @effect/platform -> effect [not-vendored]",
      "> [x] UPDATE convex -> convex [remote-drift]"
    ])
  })

  test("keeps task focus in range when moving through the list", () => {
    const state = dispatchDashboard(createDashboardState(snapshot), DashboardAction.MoveUp())

    expect(state.focusedTaskIndex).toBe(1)
  })

  test("builds safe command plans for selected add and update tasks", () => {
    const selected = dispatchDashboard(
      dispatchDashboard(createDashboardState(snapshot), DashboardAction.SelectAll()),
      DashboardAction.SetStrategy({ strategy: "clone-ignore" })
    )

    expect(commandPlanForSelection(selected)).toEqual([
      {
        action: "add",
        args: [
          "add",
          "https://github.com/Effect-TS/effect.git",
          "--sync-package",
          "effect",
          "--strategy",
          "clone-ignore"
        ],
        label: "add effect"
      },
      {
        action: "update",
        args: ["update", "convex"],
        label: "update convex"
      }
    ])
  })

  test("opens a confirmation state before running selected tasks", () => {
    const state = dispatchDashboard(
      dispatchDashboard(createDashboardState(snapshot), DashboardAction.SelectAll()),
      DashboardAction.ConfirmRun()
    )

    expect(state.mode).toBe("confirming-run")
  })

  test("ignores dashboard lifecycle actions that are illegal for the current mode", () => {
    const browsing = createDashboardState(snapshot)
    expect(dispatchDashboard(browsing, DashboardAction.StartRun()).mode).toBe("browsing")
    expect(dispatchDashboard(browsing, DashboardAction.FinishRun({ message: "done" })).mode).toBe(
      "browsing"
    )

    const confirming = dispatchDashboard(
      dispatchDashboard(browsing, DashboardAction.SelectAll()),
      DashboardAction.ConfirmRun()
    )
    expect(dispatchDashboard(confirming, DashboardAction.MoveDown())).toBe(confirming)

    const running = dispatchDashboard(confirming, DashboardAction.StartRun())
    expect(dispatchDashboard(running, DashboardAction.MoveDown())).toBe(running)
    expect(dispatchDashboard(running, DashboardAction.ConfirmRun())).toBe(running)
    expect(
      dispatchDashboard(
        confirming,
        DashboardAction.Refresh({ snapshot, message: "background refresh" })
      )
    ).toBe(confirming)

    const finished = dispatchDashboard(running, DashboardAction.FinishRun({ message: "done" }))
    expect(finished.mode).toBe("browsing")
  })

  test("maps keyboard input onto dashboard actions", () => {
    const key = (name: string, sequence = name) =>
      ({ name, sequence }) as Parameters<typeof handleDashboardKey>[0]

    const applyKey = (state: DashboardState, name: string, sequence?: string): DashboardState => {
      const result = Effect.runSync(handleDashboardKey(key(name, sequence ?? name), state))
      return Option.match(result, {
        onNone: () => state,
        onSome: (keyAction) =>
          keyAction._tag === "Dispatch" ? dispatchDashboard(state, keyAction.action) : state
      })
    }

    let state = createDashboardState(snapshot)
    state = applyKey(state, "j")
    state = applyKey(state, "4")
    state = applyKey(state, "return", "\r")
    // After "return" we should be in confirming-run mode
    expect(state.mode).toBe("confirming-run")
    // "y" in confirming mode returns the synthetic Run action; the app loop runs the commands.
    const yResult = Effect.runSync(handleDashboardKey(key("y"), state))
    expect(Option.isSome(yResult)).toBe(true)
    expect(Option.getOrUndefined(yResult)?._tag).toBe("Run")
    expect(state.focusedTaskIndex).toBe(1)
    expect(state.strategy).toBe("cache-link")
  })
})
