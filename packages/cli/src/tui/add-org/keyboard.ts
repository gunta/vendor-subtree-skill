import { ORG_REPO_SORTS } from "../../domain/org-sort.ts"
import { AddOrgAction, type AddOrgState } from "./state.ts"

const VISIBILITY_VALUES = ["all", "public", "private", "internal"] as const
const SINCE_VALUES = [null, "30d", "90d", "6m", "12m"] as const

const availableLanguages = (state: AddOrgState): ReadonlyArray<string> => {
  const counts = new Map<string, { readonly label: string; count: number }>()
  for (const repo of state.repos) {
    const label = repo.primaryLanguage?.trim()
    if (!label) continue
    const key = label.toLowerCase()
    const current = counts.get(key)
    counts.set(key, { label: current?.label ?? label, count: (current?.count ?? 0) + 1 })
  }
  return Array.from(counts.values())
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .map((entry) => entry.label)
}

const nextLanguage = (state: AddOrgState): ReadonlyArray<string> => {
  const languages = availableLanguages(state)
  if (languages.length === 0) return []
  const current = state.filters.language[0]?.toLowerCase()
  if (!current) return [languages[0]!]
  const index = languages.findIndex((value) => value.toLowerCase() === current)
  const next = index < 0 ? 0 : index + 1
  return next >= languages.length ? [] : [languages[next]!]
}

const nextSince = (value: string | null): string | null => {
  const index = SINCE_VALUES.findIndex((candidate) => candidate === value)
  if (index < 0) return null
  return SINCE_VALUES[(index + 1) % SINCE_VALUES.length] ?? null
}

const nextVisibility = (value: AddOrgState["filters"]["visibility"]) =>
  VISIBILITY_VALUES[(VISIBILITY_VALUES.indexOf(value) + 1) % VISIBILITY_VALUES.length] ?? "all"

const nextSort = (value: AddOrgState["sort"]) =>
  ORG_REPO_SORTS[(ORG_REPO_SORTS.indexOf(value) + 1) % ORG_REPO_SORTS.length] ?? "stars"

const isPrintableSearchCharacter = (key: string): boolean =>
  key.length === 1 && key >= " " && key !== "\u007f"

const searchKeyAction = (key: string, state: AddOrgState): AddOrgAction | null => {
  switch (key) {
    case "\u001b":
    case "\r":
    case "\n":
      return AddOrgAction.SetSearchActive({ active: false })
    case "\u007f":
    case "\b":
      return AddOrgAction.SetSearch({ value: state.filters.search.slice(0, -1) })
    case "\u0015":
      return AddOrgAction.SetSearch({ value: "" })
    default:
      return isPrintableSearchCharacter(key)
        ? AddOrgAction.SetSearch({ value: `${state.filters.search}${key}` })
        : null
  }
}

export const handleAddOrgKey = (key: string, state: AddOrgState): AddOrgAction | null => {
  if (state.mode === "done" || state.mode === "running") return null
  if (state.mode === "confirming-run") {
    switch (key) {
      case "q":
        return AddOrgAction.Cancel()
      case "\r":
      case "\n":
        return AddOrgAction.StartRun()
      default:
        return null
    }
  }
  if (state.searchActive) return searchKeyAction(key, state)

  switch (key) {
    case "j":
    case "\u001b[B":
      return AddOrgAction.MoveDown()
    case "k":
    case "\u001b[A":
      return AddOrgAction.MoveUp()
    case "\u001b[6~":
      return AddOrgAction.PageDown()
    case "\u001b[5~":
      return AddOrgAction.PageUp()
    case " ":
      return AddOrgAction.ToggleSelected()
    case "a":
      return AddOrgAction.SelectAllFiltered()
    case "c":
      return AddOrgAction.ClearSelection()
    case "A":
      return AddOrgAction.ToggleArchived()
    case "F":
      return AddOrgAction.ToggleForks()
    case "l":
      return AddOrgAction.SetLanguage({ values: nextLanguage(state) })
    case "s":
      return AddOrgAction.SetSince({ value: nextSince(state.filters.since) })
    case "v":
      return AddOrgAction.SetVisibility({ value: nextVisibility(state.filters.visibility) })
    case "o":
      return AddOrgAction.SetSort({ value: nextSort(state.sort) })
    case "/":
      return AddOrgAction.SetSearchActive({ active: true })
    case "q":
      return AddOrgAction.Cancel()
    case "\r":
    case "\n":
      return AddOrgAction.Confirm()
    default:
      return null
  }
}
