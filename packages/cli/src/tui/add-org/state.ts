import { Data } from "effect"

import { filterOrgRepos, type OrgFilter } from "../../domain/org-filter.ts"
import { sortOrgRepos, type OrgRepoSort } from "../../domain/org-sort.ts"
import type { VendoredRepo } from "../../domain/vendor-state.ts"
import type { VendorStrategy } from "../../domain/vendor-strategy.ts"
import type { OrgRepository } from "../../services/local-state.ts"

export type AddOrgMode = "browsing" | "confirming-run" | "running" | "done"

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
  readonly sort: OrgRepoSort
  readonly searchActive: boolean
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
  SetSearchActive: { readonly active: boolean }
  SetSort: { readonly value: OrgRepoSort }
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

const comparableRepoUrl = (url: string): string => url.replace(/\.git$/, "").replace(/\/+$/, "")

export const vendoredOrgRepoIds = ({
  repos,
  vendored
}: {
  readonly repos: ReadonlyArray<OrgRepository>
  readonly vendored: ReadonlyArray<VendoredRepo>
}): ReadonlySet<string> => {
  const vendoredUrls = new Set(vendored.map((repo) => comparableRepoUrl(repo.url)))
  return new Set(
    repos.filter((repo) => vendoredUrls.has(comparableRepoUrl(repo.url))).map((repo) => idOf(repo))
  )
}

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
  readonly sort?: OrgRepoSort
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
  sort: input.sort ?? "stars",
  searchActive: false,
  runProgress: new Map(),
  logLines: []
})

export const filteredRepos = (state: AddOrgState): ReadonlyArray<OrgRepository> =>
  sortOrgRepos(filterOrgRepos(state.repos, state.filters), state.sort)

const hasSelection = (state: AddOrgState): boolean => state.selected.size > 0

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

const canDispatchAddOrg = (state: AddOrgState, action: AddOrgAction): boolean => {
  switch (state.mode) {
    case "browsing":
      switch (action._tag) {
        case "MoveDown":
        case "MoveUp":
        case "PageDown":
        case "PageUp":
        case "ToggleSelected":
        case "SelectAllFiltered":
        case "ClearSelection":
        case "SetLanguage":
        case "SetSince":
        case "SetVisibility":
        case "ToggleArchived":
        case "ToggleForks":
        case "SetSearch":
        case "SetSearchActive":
        case "SetSort":
        case "SetStrategy":
        case "SetConcurrency":
        case "Cancel":
          return true
        case "Confirm":
          return hasSelection(state)
        default:
          return false
      }
    case "confirming-run":
      switch (action._tag) {
        case "Cancel":
          return true
        case "StartRun":
          return hasSelection(state)
        default:
          return false
      }
    case "running":
      switch (action._tag) {
        case "TickProgress":
          return state.selected.has(action.id)
        case "AppendLog":
        case "FinishRun":
          return true
        default:
          return false
      }
    case "done":
      return false
  }
}

export const dispatchAddOrg = (state: AddOrgState, action: AddOrgAction): AddOrgState => {
  if (!canDispatchAddOrg(state, action)) return state

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
      if (state.vendored.has(id)) return state
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
    case "SetSearchActive":
      return { ...state, searchActive: action.active }
    case "SetSort":
      return { ...state, sort: action.value, focusedIndex: 0 }
    case "SetStrategy":
      return { ...state, strategy: action.value }
    case "SetConcurrency":
      return { ...state, concurrency: Math.max(1, Math.min(32, action.value)) }
    case "Confirm":
      return { ...state, mode: "confirming-run" }
    case "Cancel":
      return { ...state, mode: "done" }
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
