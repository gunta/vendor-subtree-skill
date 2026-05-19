import { describe, expect, test } from "bun:test"

import { Option } from "effect"

import { EMPTY_VENDOR_FILTER } from "../src/domain/vendor-filter.ts"
import type { VendoredRepo } from "../src/domain/vendor-state.ts"
import type { OrgRepository } from "../src/services/local-state.ts"
import { handleAddOrgKey } from "../src/tui/add-org/keyboard.ts"
import { addOrgRepoParams } from "../src/tui/add-org/runner.ts"
import {
  AddOrgAction,
  createAddOrgState,
  dispatchAddOrg,
  filteredRepos,
  vendoredOrgRepoIds
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
  stars: 0,
  url: "https://github.com/gunta/demo.git",
  ...overrides
})

const repos = [
  repo({ name: "alpha" }),
  repo({ name: "beta", isArchived: true }),
  repo({ name: "gamma", primaryLanguage: "Python" })
]

const vendoredRepo = (overrides: Partial<VendoredRepo>): VendoredRepo => ({
  name: "alpha",
  prefix: "vendor/gunta/alpha",
  url: "https://github.com/gunta/alpha.git",
  ref: "main",
  strategy: "clone-ignore",
  filter: EMPTY_VENDOR_FILTER,
  sha: "abc123",
  date: "2026-05-01T00:00:00Z",
  ...overrides
})

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

  test("SetSort changes the visible repository order", () => {
    const state = createAddOrgState({
      owner: "gunta",
      repos: [
        repo({ name: "zeta", stars: 100 }),
        repo({ name: "alpha", stars: 1 }),
        repo({ name: "beta", stars: 25 })
      ],
      vendored: new Set()
    })

    expect(filteredRepos(state).map((r) => r.name)).toEqual(["zeta", "beta", "alpha"])

    const alphabetical = dispatchAddOrg(state, AddOrgAction.SetSort({ value: "name" }))
    expect(alphabetical.focusedIndex).toBe(0)
    expect(filteredRepos(alphabetical).map((r) => r.name)).toEqual(["alpha", "beta", "zeta"])
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

  test("vendored repos cannot be toggled into the run selection", () => {
    const state = createAddOrgState({
      owner: "gunta",
      repos,
      vendored: new Set(["gunta/alpha"])
    })
    const selected = dispatchAddOrg(state, AddOrgAction.ToggleSelected())
    expect(selected).toBe(state)
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
    ["\u001b[B", "MoveDown"],
    ["\u001b[A", "MoveUp"],
    ["\u001b[6~", "PageDown"],
    ["\u001b[5~", "PageUp"],
    [" ", "ToggleSelected"],
    ["a", "SelectAllFiltered"],
    ["c", "ClearSelection"],
    ["A", "ToggleArchived"],
    ["F", "ToggleForks"],
    ["l", "SetLanguage"],
    ["s", "SetSince"],
    ["v", "SetVisibility"],
    ["o", "SetSort"],
    ["/", "SetSearchActive"],
    ["q", "Cancel"]
  ] as const)("maps %s to %s", (key, tag) => {
    const action = handleAddOrgKey(key, browsing)
    expect(action?._tag).toBe(tag)
  })

  test("language key cycles through repository languages and then clears the filter", () => {
    let state = browsing

    let action = handleAddOrgKey("l", state)
    expect(action).toEqual(AddOrgAction.SetLanguage({ values: ["TypeScript"] }))
    state = dispatchAddOrg(state, action!)
    expect(filteredRepos(state).map((r) => r.name)).toEqual(["alpha", "beta"])

    action = handleAddOrgKey("l", state)
    expect(action).toEqual(AddOrgAction.SetLanguage({ values: ["Python"] }))
    state = dispatchAddOrg(state, action!)
    expect(filteredRepos(state).map((r) => r.name)).toEqual(["gamma"])

    action = handleAddOrgKey("l", state)
    expect(action).toEqual(AddOrgAction.SetLanguage({ values: [] }))
  })

  test("since and visibility keys cycle through common filters", () => {
    let state = browsing

    let action = handleAddOrgKey("s", state)
    expect(action).toEqual(AddOrgAction.SetSince({ value: "30d" }))
    state = dispatchAddOrg(state, action!)
    expect(handleAddOrgKey("s", state)).toEqual(AddOrgAction.SetSince({ value: "90d" }))

    action = handleAddOrgKey("v", browsing)
    expect(action).toEqual(AddOrgAction.SetVisibility({ value: "public" }))
    state = dispatchAddOrg(browsing, action!)
    expect(handleAddOrgKey("v", state)).toEqual(AddOrgAction.SetVisibility({ value: "private" }))
  })

  test("order key cycles through repository sort modes", () => {
    let state = browsing

    let action = handleAddOrgKey("o", state)
    expect(action).toEqual(AddOrgAction.SetSort({ value: "name" }))
    state = dispatchAddOrg(state, action!)

    action = handleAddOrgKey("o", state)
    expect(action).toEqual(AddOrgAction.SetSort({ value: "pushed" }))
    state = dispatchAddOrg(state, action!)

    action = handleAddOrgKey("o", state)
    expect(action).toEqual(AddOrgAction.SetSort({ value: "stars" }))
  })

  test("search mode types and filters repositories in realtime", () => {
    let state = dispatchAddOrg(browsing, AddOrgAction.SetSearchActive({ active: true }))

    let action = handleAddOrgKey("g", state)
    expect(action).toEqual(AddOrgAction.SetSearch({ value: "g" }))
    state = dispatchAddOrg(state, action!)

    action = handleAddOrgKey("a", state)
    expect(action).toEqual(AddOrgAction.SetSearch({ value: "ga" }))
    state = dispatchAddOrg(state, action!)
    expect(filteredRepos(state).map((r) => r.name)).toEqual(["gamma"])

    action = handleAddOrgKey("\u007f", state)
    expect(action).toEqual(AddOrgAction.SetSearch({ value: "g" }))
    state = dispatchAddOrg(state, action!)

    action = handleAddOrgKey("\r", state)
    expect(action).toEqual(AddOrgAction.SetSearchActive({ active: false }))
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

describe("vendoredOrgRepoIds", () => {
  test("maps existing vendored URLs to org repo ids", () => {
    const ids = vendoredOrgRepoIds({
      repos: [repo({ name: "alpha", url: "https://github.com/gunta/alpha" })],
      vendored: [vendoredRepo({ url: "https://github.com/gunta/alpha.git" })]
    })

    expect(ids.has("gunta/alpha")).toBe(true)
  })

  test("does not mark same-name repositories with different URLs as vendored", () => {
    const ids = vendoredOrgRepoIds({
      repos: [repo({ name: "alpha", url: "https://github.com/gunta/alpha" })],
      vendored: [vendoredRepo({ url: "https://github.com/other/alpha.git" })]
    })

    expect(ids.has("gunta/alpha")).toBe(false)
  })
})
