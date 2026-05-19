import { describe, expect, test } from "bun:test"

import { Effect, Option } from "effect"

import {
  commandPlanForSelection,
  commandPreviewLines,
  createDashboardState,
  DashboardAction,
  dashboardTabs,
  dispatchDashboard,
  visibleSuggestionRows,
  visibleRepositoryRows,
  visibleTaskIndexes,
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

  const typeText = (state: DashboardState, value: string): DashboardState =>
    [...value].reduce((next, character) => applyKey(next, character, character), state)

  const startAddInput = (state: DashboardState): DashboardState => applyKey(state, "+", "+")

  test("includes a repositories tab", () => {
    expect(dashboardTabs).toContain("repositories")
    expect(visibleRepositoryRows(snapshot)).toEqual([
      "effect                       subtree      effect                       effect@3.21.2 (bun-lock)         effect@3.21.2 (vendored source)  effect@3.21.3 (npm latest)       remote-drift"
    ])
  })

  test("starts in shortcut mode so global keys work immediately", () => {
    const state = createDashboardState(snapshot)

    expect(state.inputMode).toBe("normal")
    expect(state.addInput).toBe("")
    expect(state.searchQuery).toBe("")

    const result = Effect.runSync(handleDashboardKey(key("q"), state))
    expect(Option.getOrUndefined(result)?._tag).toBe("Quit")
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

  test("filters tasks and repository rows by typed search query", () => {
    const state = dispatchDashboard(
      createDashboardState(snapshot),
      DashboardAction.SetSearch({ value: "convex" })
    )

    expect(state.focusedTaskIndex).toBe(1)
    expect(visibleTaskIndexes(state)).toEqual([1])
    expect(visibleTaskRows(state)).toEqual(["> [ ] UPDATE convex -> convex [remote-drift]"])
    expect(visibleRepositoryRows(snapshot, "effect")).toEqual([
      "effect                       subtree      effect                       effect@3.21.2 (bun-lock)         effect@3.21.2 (vendored source)  effect@3.21.3 (npm latest)       remote-drift"
    ])
    expect(visibleRepositoryRows(snapshot, "convex")).toEqual([
      "No durable source routes detected."
    ])
  })

  test("plain typing in the focused input searches existing tasks first", () => {
    const state = typeText(startAddInput(createDashboardState(snapshot)), "convex")

    expect(state.addInput).toBe("convex")
    expect(state.searchQuery).toBe("convex")
    expect(visibleTaskIndexes(state)).toEqual([1])
    expect(commandPreviewLines(state)).toEqual(["ingraft update convex"])
  })

  test("plain typing in the focused input can add a new target when no task matches", () => {
    const state = typeText(startAddInput(createDashboardState(snapshot)), "zod")

    expect(state.addInput).toBe("zod")
    expect(state.searchQuery).toBe("zod")
    expect(visibleTaskIndexes(state)).toEqual([])
    expect(commandPreviewLines(state)).toEqual(["ingraft add zod --strategy subtree"])
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

  test("builds command plans from the dashboard add input", () => {
    const repo = dispatchDashboard(
      createDashboardState(snapshot),
      DashboardAction.SetAddInput({ value: "gunta/confect@effect4" })
    )

    expect(commandPlanForSelection(repo)).toEqual([
      {
        action: "add",
        args: ["add", "gunta/confect@effect4", "--strategy", "subtree"],
        label: "add gunta/confect@effect4"
      }
    ])
    expect(commandPreviewLines(repo)).toEqual([
      "ingraft add gunta/confect@effect4 --strategy subtree"
    ])

    const org = dispatchDashboard(
      createDashboardState(snapshot),
      DashboardAction.SetAddInput({ value: "org:get-convex" })
    )

    expect(commandPlanForSelection(org)).toEqual([
      {
        action: "add-org",
        args: ["add-org", "get-convex", "--strategy", "subtree"],
        label: "add org get-convex"
      }
    ])
  })

  test("accepts GitHub autocomplete suggestions into the same add input", () => {
    let state = dispatchDashboard(
      createDashboardState(snapshot),
      DashboardAction.SetAddInput({ value: "conv" })
    )
    state = dispatchDashboard(
      state,
      DashboardAction.SetSuggestions({
        query: "conv",
        suggestions: [
          {
            detail: "12,300 stars public - reactive backend",
            kind: "repo",
            label: "get-convex/convex-js",
            value: "get-convex/convex-js"
          },
          {
            detail: "organization",
            kind: "org",
            label: "get-convex",
            value: "org:get-convex"
          }
        ]
      })
    )

    expect(visibleSuggestionRows(state)).toEqual([
      "> repo get-convex/convex-js  12,300 stars public - reactive backend",
      "  org  get-convex            organization"
    ])

    state = dispatchDashboard(state, DashboardAction.MoveSuggestionDown())
    state = dispatchDashboard(state, DashboardAction.AcceptSuggestion())

    expect(state.addInput).toBe("org:get-convex")
    expect(state.searchQuery).toBe("org:get-convex")
    expect(commandPreviewLines(state)).toEqual(["ingraft add-org get-convex --strategy subtree"])
  })

  test("keyboard arrows choose autocomplete suggestions and tab accepts one", () => {
    let state = dispatchDashboard(
      startAddInput(createDashboardState(snapshot)),
      DashboardAction.SetAddInput({ value: "conf" })
    )
    state = dispatchDashboard(
      state,
      DashboardAction.SetSuggestions({
        query: "conf",
        suggestions: [
          {
            detail: "9 stars public",
            kind: "repo",
            label: "gunta/confect",
            value: "gunta/confect"
          },
          {
            detail: "organization",
            kind: "org",
            label: "get-convex",
            value: "org:get-convex"
          }
        ]
      })
    )

    state = applyKey(state, "down")
    expect(state.selectedSuggestionIndex).toBe(1)

    state = applyKey(state, "tab", "\t")
    expect(state.addInput).toBe("org:get-convex")
    expect(commandPreviewLines(state)).toEqual(["ingraft add-org get-convex --strategy subtree"])
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
    expect(finished.inputMode).toBe("normal")
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

  test("keyboard search mode edits the live filter", () => {
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
    state = applyKey(state, "escape", "\u001b")
    state = applyKey(state, "/", "/")
    expect(state.inputMode).toBe("search")

    for (const character of "conv") state = applyKey(state, character, character)
    expect(state.addInput).toBe("conv")
    expect(state.searchQuery).toBe("conv")
    expect(visibleTaskIndexes(state)).toEqual([1])

    state = applyKey(state, "backspace", "\u007f")
    expect(state.addInput).toBe("con")
    expect(state.searchQuery).toBe("con")

    state = applyKey(state, "escape", "\u001b")
    expect(state.inputMode).toBe("normal")
  })

  test("keyboard add mode edits the manual add input and confirms it", () => {
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
    state = applyKey(state, "escape", "\u001b")
    state = applyKey(state, "+", "+")
    expect(state.inputMode).toBe("add")

    for (const character of "zod") state = applyKey(state, character, character)
    expect(state.addInput).toBe("zod")
    expect(commandPreviewLines(state)).toEqual(["ingraft add zod --strategy subtree"])

    state = applyKey(state, "backspace", "\u007f")
    expect(state.addInput).toBe("zo")

    state = applyKey(state, "return", "\r")
    expect(state.mode).toBe("confirming-run")
    expect(state.inputMode).toBe("normal")
  })
})
