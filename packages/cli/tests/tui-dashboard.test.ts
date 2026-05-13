import { describe, expect, test } from "bun:test"

import {
  commandPlanForSelection,
  createDashboardState,
  dashboardTabs,
  dispatchDashboard,
  visibleRepositoryRows,
  visibleTaskRows
} from "../src/tui/dashboard.ts"
import { handleDashboardKey, type DashboardController } from "../src/tui/keyboard.ts"
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

describe("ingraft tui dashboard", () => {
  test("includes a vendored repositories tab", () => {
    expect(dashboardTabs).toContain("repositories")
    expect(visibleRepositoryRows(snapshot)).toEqual([
      "effect                       subtree      effect                       effect@3.21.2 (bun-lock)         effect@3.21.2 (vendored source)  effect@3.21.3 (npm latest)       remote-drift"
    ])
  })

  test("tracks focus and selected task rows independently", () => {
    const selected = dispatchDashboard(
      dispatchDashboard(createDashboardState(snapshot), { type: "move-down" }),
      { type: "toggle-selected" }
    )

    expect(selected.focusedTaskIndex).toBe(1)
    expect(selected.selectedTaskIndexes).toEqual([1])
    expect(visibleTaskRows(selected)).toEqual([
      "  [ ] ADD    effect, @effect/platform -> effect [not-vendored]",
      "> [x] UPDATE convex -> convex [remote-drift]"
    ])
  })

  test("keeps task focus in range when moving through the list", () => {
    const state = dispatchDashboard(createDashboardState(snapshot), {
      type: "move-up"
    })

    expect(state.focusedTaskIndex).toBe(1)
  })

  test("builds safe command plans for selected add and update tasks", () => {
    const selected = dispatchDashboard(
      dispatchDashboard(createDashboardState(snapshot), { type: "select-all" }),
      { type: "set-strategy", strategy: "clone-ignore" }
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
      dispatchDashboard(createDashboardState(snapshot), { type: "select-all" }),
      { type: "confirm-run" }
    )

    expect(state.mode).toBe("confirming-run")
  })

  test("maps keyboard input onto dashboard actions", () => {
    let state = createDashboardState(snapshot)
    let didRun = false
    const controller = {
      quit: () => {},
      refreshSnapshot: () => {},
      runSelected: () => {
        didRun = true
      },
      state: () => state,
      updateState: (next) => {
        state = next
      }
    } satisfies DashboardController

    handleDashboardKey(
      { name: "j", sequence: "j" } as Parameters<typeof handleDashboardKey>[0],
      controller
    )
    handleDashboardKey(
      { name: "2", sequence: "2" } as Parameters<typeof handleDashboardKey>[0],
      controller
    )
    handleDashboardKey(
      { name: "return", sequence: "\r" } as Parameters<typeof handleDashboardKey>[0],
      controller
    )
    handleDashboardKey(
      { name: "y", sequence: "y" } as Parameters<typeof handleDashboardKey>[0],
      controller
    )

    expect(state.focusedTaskIndex).toBe(1)
    expect(state.strategy).toBe("submodule")
    expect(didRun).toBe(true)
  })
})
