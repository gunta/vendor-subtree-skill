import { describe, expect, test } from "bun:test"

import type { OrgRepository } from "../src/services/local-state.ts"
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
    const confirmed = dispatchAddOrg(initial, AddOrgAction.Confirm())
    expect(confirmed.mode).toBe("confirming-run")
    const running = dispatchAddOrg(confirmed, AddOrgAction.StartRun())
    expect(running.mode).toBe("running")
    const done = dispatchAddOrg(running, AddOrgAction.FinishRun())
    expect(done.mode).toBe("done")
  })

  test("TickProgress updates runProgress", () => {
    const running = dispatchAddOrg(
      dispatchAddOrg(initial, AddOrgAction.Confirm()),
      AddOrgAction.StartRun()
    )
    const ticked = dispatchAddOrg(
      running,
      AddOrgAction.TickProgress({ id: "gunta/alpha", status: "success" })
    )
    expect(ticked.runProgress.get("gunta/alpha")).toBe("success")
  })
})
