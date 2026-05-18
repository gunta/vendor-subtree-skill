import { describe, expect, test } from "bun:test"

import { Option } from "effect"

import type { OrgRepository } from "../src/services/local-state.ts"
import { handleAddOrgKey } from "../src/tui/add-org/keyboard.ts"
import { addOrgRepoParams } from "../src/tui/add-org/runner.ts"
import {
  AddOrgAction,
  createAddOrgState,
  dispatchAddOrg,
  filteredRepos
} from "../src/tui/add-org/state.ts"

const repo = (overrides: Partial<OrgRepository>): OrgRepository => ({
  name: "demo",
  owner: "gunta",
  defaultBranch: "main",
  pushedAt: "2026-05-01T00:00:00Z",
  primaryLanguage: "TypeScript",
  isArchived: false,
  isFork: false,
  visibility: "public",
  description: null,
  url: "https://github.com/gunta/demo.git",
  ...overrides
})

const repos = [
  repo({ name: "alpha" }),
  repo({ name: "beta", isArchived: true }),
  repo({ name: "gamma", primaryLanguage: "Python" })
]

const initial = createAddOrgState({ owner: "gunta", repos, vendored: new Set() })

describe("dispatchAddOrg", () => {
  test("MoveDown / MoveUp wrap focus", () => {
    let state = dispatchAddOrg(initial, AddOrgAction.MoveDown())
    expect(state.focusedIndex).toBe(1)
    state = dispatchAddOrg(state, AddOrgAction.MoveDown())
    expect(state.focusedIndex).toBe(2)
    state = dispatchAddOrg(state, AddOrgAction.MoveDown())
    expect(state.focusedIndex).toBe(0)
    state = dispatchAddOrg(state, AddOrgAction.MoveUp())
    expect(state.focusedIndex).toBe(2)
  })

  test("ToggleSelected toggles the focused row by name", () => {
    const state = dispatchAddOrg(initial, AddOrgAction.ToggleSelected())
    expect(state.selected.has("gunta/alpha")).toBe(true)
    const next = dispatchAddOrg(state, AddOrgAction.ToggleSelected())
    expect(next.selected.has("gunta/alpha")).toBe(false)
  })

  test("SetLanguage filters list and clamps focus", () => {
    const state = dispatchAddOrg(initial, AddOrgAction.SetLanguage({ values: ["python"] }))
    expect(filteredRepos(state).map((r) => r.name)).toEqual(["gamma"])
    expect(state.focusedIndex).toBe(0)
  })

  test("SetSearch matches name OR description", () => {
    const state = dispatchAddOrg(initial, AddOrgAction.SetSearch({ value: "alpha" }))
    expect(filteredRepos(state).map((r) => r.name)).toEqual(["alpha"])
  })

  test("ToggleArchived hides archived rows", () => {
    const archivedHidden = dispatchAddOrg(initial, AddOrgAction.ToggleArchived())
    expect(filteredRepos(archivedHidden).find((r) => r.name === "beta")).toBeUndefined()
  })

  test("SelectAllFiltered selects every visible row", () => {
    const state = dispatchAddOrg(initial, AddOrgAction.SetLanguage({ values: ["typescript"] }))
    const selectedAll = dispatchAddOrg(state, AddOrgAction.SelectAllFiltered())
    expect(selectedAll.selected.has("gunta/alpha")).toBe(true)
    expect(selectedAll.selected.has("gunta/gamma")).toBe(false)
  })

  test("vendored repos are not selected by default", () => {
    const state = createAddOrgState({
      owner: "gunta",
      repos,
      vendored: new Set(["gunta/alpha"])
    })
    const selectedAll = dispatchAddOrg(state, AddOrgAction.SelectAllFiltered())
    expect(selectedAll.selected.has("gunta/alpha")).toBe(false)
  })

  test("Confirm + StartRun mode transition", () => {
    const selected = dispatchAddOrg(initial, AddOrgAction.ToggleSelected())
    const confirmed = dispatchAddOrg(selected, AddOrgAction.Confirm())
    expect(confirmed.mode).toBe("confirming-run")
    const running = dispatchAddOrg(confirmed, AddOrgAction.StartRun())
    expect(running.mode).toBe("running")
    const done = dispatchAddOrg(running, AddOrgAction.FinishRun())
    expect(done.mode).toBe("done")
  })

  test("ignores lifecycle actions that are illegal for the current mode", () => {
    const browsing = initial
    expect(dispatchAddOrg(browsing, AddOrgAction.StartRun()).mode).toBe("browsing")
    expect(dispatchAddOrg(browsing, AddOrgAction.FinishRun()).mode).toBe("browsing")

    const selected = dispatchAddOrg(browsing, AddOrgAction.ToggleSelected())
    const confirming = dispatchAddOrg(selected, AddOrgAction.Confirm())
    expect(dispatchAddOrg(confirming, AddOrgAction.ToggleSelected())).toBe(confirming)

    const running = dispatchAddOrg(confirming, AddOrgAction.StartRun())
    expect(dispatchAddOrg(running, AddOrgAction.MoveDown())).toBe(running)
    expect(dispatchAddOrg(running, AddOrgAction.Confirm())).toBe(running)

    const done = dispatchAddOrg(running, AddOrgAction.FinishRun())
    expect(dispatchAddOrg(done, AddOrgAction.MoveDown())).toBe(done)
  })

  test("does not confirm or start a run with no selected repositories", () => {
    const confirmed = dispatchAddOrg(initial, AddOrgAction.Confirm())
    expect(confirmed.mode).toBe("browsing")

    const selected = dispatchAddOrg(initial, AddOrgAction.ToggleSelected())
    const confirming = dispatchAddOrg(selected, AddOrgAction.Confirm())
    const cleared = dispatchAddOrg(confirming, AddOrgAction.ClearSelection())
    expect(cleared).toBe(confirming)
    expect(dispatchAddOrg(cleared, AddOrgAction.StartRun()).mode).toBe("running")

    const forgedEmptyConfirmation = { ...initial, mode: "confirming-run" as const }
    expect(dispatchAddOrg(forgedEmptyConfirmation, AddOrgAction.StartRun())).toBe(
      forgedEmptyConfirmation
    )
  })

  test("Cancel exits the TUI loop", () => {
    const canceled = dispatchAddOrg(initial, AddOrgAction.Cancel())
    expect(canceled.mode).toBe("done")
  })

  test("TickProgress updates runProgress", () => {
    const selected = dispatchAddOrg(initial, AddOrgAction.ToggleSelected())
    const running = dispatchAddOrg(
      dispatchAddOrg(selected, AddOrgAction.Confirm()),
      AddOrgAction.StartRun()
    )
    const ticked = dispatchAddOrg(
      running,
      AddOrgAction.TickProgress({ id: "gunta/alpha", status: "success" })
    )
    expect(ticked.runProgress.get("gunta/alpha")).toBe("success")
  })

  test("TickProgress ignores repositories outside the selected run", () => {
    const selected = dispatchAddOrg(initial, AddOrgAction.ToggleSelected())
    const running = dispatchAddOrg(
      dispatchAddOrg(selected, AddOrgAction.Confirm()),
      AddOrgAction.StartRun()
    )
    const ticked = dispatchAddOrg(
      running,
      AddOrgAction.TickProgress({ id: "gunta/beta", status: "success" })
    )

    expect(ticked).toBe(running)
  })
})

describe("handleAddOrgKey", () => {
  const browsing = initial

  test.each([
    ["j", "MoveDown"],
    ["k", "MoveUp"],
    [" ", "ToggleSelected"],
    ["a", "SelectAllFiltered"],
    ["c", "ClearSelection"],
    ["A", "ToggleArchived"],
    ["F", "ToggleForks"],
    ["q", "Cancel"]
  ] as const)("maps %s to %s", (key, tag) => {
    const action = handleAddOrgKey(key, browsing)
    expect(action?._tag).toBe(tag)
  })

  test("Enter confirms when in browsing mode", () => {
    const action = handleAddOrgKey("\r", browsing)
    expect(action?._tag).toBe("Confirm")
  })

  test("only accepts run or cancel keys while confirming", () => {
    const selected = dispatchAddOrg(browsing, AddOrgAction.ToggleSelected())
    const confirming = dispatchAddOrg(selected, AddOrgAction.Confirm())

    expect(handleAddOrgKey("j", confirming)).toBeNull()
    expect(handleAddOrgKey("\r", confirming)?._tag).toBe("StartRun")
    expect(handleAddOrgKey("q", confirming)?._tag).toBe("Cancel")
  })

  test("ignores keys in running mode", () => {
    const selected = dispatchAddOrg(browsing, AddOrgAction.ToggleSelected())
    const confirming = dispatchAddOrg(selected, AddOrgAction.Confirm())
    const running = dispatchAddOrg(confirming, AddOrgAction.StartRun())

    expect(handleAddOrgKey("j", running)).toBeNull()
  })

  test("ignores keys in done mode", () => {
    const selected = dispatchAddOrg(browsing, AddOrgAction.ToggleSelected())
    const confirming = dispatchAddOrg(selected, AddOrgAction.Confirm())
    const running = dispatchAddOrg(confirming, AddOrgAction.StartRun())
    const done = dispatchAddOrg(running, AddOrgAction.FinishRun())
    expect(handleAddOrgKey("j", done)).toBeNull()
  })
})

describe("addOrgRepoParams", () => {
  test("preserves command version selectors for the TUI runner", () => {
    const state = createAddOrgState({
      owner: "gunta",
      repos,
      vendored: new Set(),
      strategy: "clone-ignore"
    })
    const params = addOrgRepoParams({
      repo: repos[0]!,
      state,
      ref: Option.some("release"),
      tag: Option.none(),
      release: Option.none()
    })

    expect(params.ref).toEqual(Option.some("release"))
    expect(params.tag).toEqual(Option.none())
    expect(params.release).toEqual(Option.none())
    expect(params.repo).toBe("https://github.com/gunta/demo.git")
    expect(params.name).toEqual(Option.some("alpha"))
    expect(params.strategy).toBe("clone-ignore")
  })
})
