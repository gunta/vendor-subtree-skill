import { Data } from "effect"

import { filterOrgRepos, type OrgFilter } from "../../domain/org-filter.ts"
import type { VendorStrategy } from "../../domain/vendor-strategy.ts"
import type { OrgRepository } from "../../services/local-state.ts"

export type AddOrgMode = "filtering" | "browsing" | "confirming-run" | "running" | "done"

export type RunStatus = "queued" | "running" | "success" | "error"

export interface AddOrgState {
  readonly owner: string
  readonly mode: AddOrgMode
  readonly repos: ReadonlyArray<OrgRepository>
  readonly filters: OrgFilter
  readonly focusedIndex: number
  readonly selected: ReadonlySet<string>
  readonly vendored: ReadonlySet<string>
  readonly strategy: VendorStrategy
  readonly concurrency: number
  readonly runProgress: ReadonlyMap<string, RunStatus>
  readonly logLines: ReadonlyArray<string>
}

export type AddOrgAction = Data.TaggedEnum<{
  MoveUp: {}
  MoveDown: {}
  PageUp: {}
  PageDown: {}
  ToggleSelected: {}
  SelectAllFiltered: {}
  ClearSelection: {}
  SetLanguage: { readonly values: ReadonlyArray<string> }
  SetSince: { readonly value: string | null }
  SetVisibility: { readonly value: OrgFilter["visibility"] }
  ToggleArchived: {}
  ToggleForks: {}
  SetSearch: { readonly value: string }
  SetStrategy: { readonly value: VendorStrategy }
  SetConcurrency: { readonly value: number }
  Confirm: {}
  Cancel: {}
  StartRun: {}
  TickProgress: { readonly id: string; readonly status: RunStatus }
  AppendLog: { readonly line: string }
  FinishRun: {}
}>

export const AddOrgAction = Data.taggedEnum<AddOrgAction>()

const idOf = (repo: OrgRepository): string => `${repo.owner}/${repo.name}`

const DEFAULT_FILTERS: OrgFilter = {
  language: [],
  since: null,
  excludeArchived: false,
  excludeForks: false,
  visibility: "all",
  search: ""
}

export const createAddOrgState = (input: {
  readonly owner: string
  readonly repos: ReadonlyArray<OrgRepository>
  readonly vendored: ReadonlySet<string>
  readonly filters?: OrgFilter
  readonly strategy?: VendorStrategy
  readonly concurrency?: number
}): AddOrgState => ({
  owner: input.owner,
  mode: "browsing",
  repos: input.repos,
  filters: input.filters ?? DEFAULT_FILTERS,
  focusedIndex: 0,
  selected: new Set(),
  vendored: input.vendored,
  strategy: input.strategy ?? "clone-ignore",
  concurrency: input.concurrency ?? 8,
  runProgress: new Map(),
  logLines: []
})

export const filteredRepos = (state: AddOrgState): ReadonlyArray<OrgRepository> =>
  filterOrgRepos(state.repos, state.filters)

const clampFocus = (state: AddOrgState, value: number): number => {
  const max = Math.max(0, filteredRepos(state).length - 1)
  if (max === 0) return 0
  return ((value % (max + 1)) + (max + 1)) % (max + 1)
}

const withFilters = (state: AddOrgState, filters: OrgFilter): AddOrgState => ({
  ...state,
  filters,
  focusedIndex: 0
})

export const dispatchAddOrg = (state: AddOrgState, action: AddOrgAction): AddOrgState => {
  switch (action._tag) {
    case "MoveDown":
      return { ...state, focusedIndex: clampFocus(state, state.focusedIndex + 1) }
    case "MoveUp":
      return { ...state, focusedIndex: clampFocus(state, state.focusedIndex - 1) }
    case "PageDown":
      return { ...state, focusedIndex: clampFocus(state, state.focusedIndex + 10) }
    case "PageUp":
      return { ...state, focusedIndex: clampFocus(state, state.focusedIndex - 10) }
    case "ToggleSelected": {
      const visible = filteredRepos(state)
      const focused = visible[state.focusedIndex]
      if (focused === undefined) return state
      const id = idOf(focused)
      const next = new Set(state.selected)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return { ...state, selected: next }
    }
    case "SelectAllFiltered": {
      const visible = filteredRepos(state)
      const next = new Set(state.selected)
      for (const repo of visible) {
        const id = idOf(repo)
        if (!state.vendored.has(id)) next.add(id)
      }
      return { ...state, selected: next }
    }
    case "ClearSelection":
      return { ...state, selected: new Set() }
    case "SetLanguage":
      return withFilters(state, { ...state.filters, language: action.values })
    case "SetSince":
      return withFilters(state, { ...state.filters, since: action.value })
    case "SetVisibility":
      return withFilters(state, { ...state.filters, visibility: action.value })
    case "ToggleArchived":
      return withFilters(state, {
        ...state.filters,
        excludeArchived: !state.filters.excludeArchived
      })
    case "ToggleForks":
      return withFilters(state, {
        ...state.filters,
        excludeForks: !state.filters.excludeForks
      })
    case "SetSearch":
      return withFilters(state, { ...state.filters, search: action.value })
    case "SetStrategy":
      return { ...state, strategy: action.value }
    case "SetConcurrency":
      return { ...state, concurrency: Math.max(1, Math.min(32, action.value)) }
    case "Confirm":
      return { ...state, mode: "confirming-run" }
    case "Cancel":
      return { ...state, mode: "browsing" }
    case "StartRun":
      return { ...state, mode: "running" }
    case "TickProgress": {
      const next = new Map(state.runProgress)
      next.set(action.id, action.status)
      return { ...state, runProgress: next }
    }
    case "AppendLog":
      return {
        ...state,
        logLines: [...state.logLines, action.line].slice(-12)
      }
    case "FinishRun":
      return { ...state, mode: "done" }
  }
}
