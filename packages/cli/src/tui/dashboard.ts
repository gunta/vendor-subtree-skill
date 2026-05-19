import { Data, Option } from "effect"

import {
  repoRowsSync,
  type VendorTuiCandidate,
  type VendorTuiRepo,
  type VendorTuiSnapshot,
  type VendorTuiTask
} from "./status.ts"

export type VendorTuiStrategy = "subtree" | "submodule" | "clone-ignore" | "cache-link"

export type DashboardTab = "tasks" | "repositories" | "dependencies" | "activity" | "help"

export type DashboardMode = "browsing" | "confirming-run" | "running"

export type DashboardInputMode = "normal" | "search" | "add"

export type CommandPlanAction = VendorTuiTask["action"] | "add-org"

export type DashboardSuggestionKind = "repo" | "org"

export interface DashboardSuggestion {
  readonly detail: string
  readonly kind: DashboardSuggestionKind
  readonly label: string
  readonly value: string
}

export interface CommandPlan {
  readonly action: CommandPlanAction
  readonly args: ReadonlyArray<string>
  readonly label: string
}

export interface DashboardState {
  readonly activeTab: DashboardTab
  readonly addInput: string
  readonly focusedTaskIndex: number
  readonly inputMode: DashboardInputMode
  readonly logLines: ReadonlyArray<string>
  readonly mode: DashboardMode
  readonly searchQuery: string
  readonly selectedTaskIndexes: ReadonlyArray<number>
  readonly selectedSuggestionIndex: number
  readonly snapshot: VendorTuiSnapshot
  readonly statusMessage: string
  readonly strategy: VendorTuiStrategy
  readonly suggestions: ReadonlyArray<DashboardSuggestion>
  readonly suggestionsQuery: string
  readonly suggestionsStatus: string
}

export interface CreateDashboardStateOptions {
  readonly logLines?: ReadonlyArray<string>
  readonly statusMessage?: string
}

export type DashboardAction = Data.TaggedEnum<{
  AppendLog: { readonly line: string }
  Cancel: {}
  ClearSelection: {}
  ConfirmRun: {}
  FinishRun: { readonly message: string; readonly snapshot?: VendorTuiSnapshot }
  MoveDown: {}
  MoveSuggestionDown: {}
  MoveSuggestionUp: {}
  MoveUp: {}
  Refresh: { readonly snapshot: VendorTuiSnapshot; readonly message?: string }
  SelectAll: {}
  AcceptSuggestion: {}
  SetAddInput: { readonly value: string }
  SetAddInputActive: { readonly active: boolean }
  SetSearch: { readonly value: string }
  SetSearchActive: { readonly active: boolean }
  SetSuggestions: {
    readonly message?: string
    readonly query: string
    readonly suggestions: ReadonlyArray<DashboardSuggestion>
  }
  SetSuggestionsLoading: { readonly query: string }
  SetStrategy: { readonly strategy: VendorTuiStrategy }
  SetTab: { readonly tab: DashboardTab }
  StartRun: {}
  ToggleSelected: {}
}>

export const DashboardAction = Data.taggedEnum<DashboardAction>()

export const dashboardTabs = [
  "tasks",
  "repositories",
  "dependencies",
  "activity",
  "help"
] as const satisfies ReadonlyArray<DashboardTab>

export const vendorStrategies = [
  "subtree",
  "submodule",
  "clone-ignore",
  "cache-link"
] as const satisfies ReadonlyArray<VendorTuiStrategy>

const normalizeSelectedIndexes = (
  indexes: ReadonlyArray<number>,
  snapshot: VendorTuiSnapshot
): ReadonlyArray<number> =>
  [...new Set(indexes.filter((index) => index >= 0 && index < snapshot.tasks.length))].sort(
    (a, b) => a - b
  )

const searchable = (values: ReadonlyArray<string | null | undefined>, query: string): boolean => {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) return true
  return values.some((value) => value?.toLowerCase().includes(needle))
}

const taskMatchesSearch = (task: VendorTuiTask, query: string): boolean =>
  searchable(
    [
      task.action,
      task.existingName,
      ...task.packageNames,
      task.primaryPackageName,
      task.repositoryUrl,
      task.suggestedName,
      task.versions?.local,
      task.versions?.remote,
      task.versions?.status,
      task.versions?.vendor
    ],
    query
  )

const candidateMatchesSearch = (candidate: VendorTuiCandidate, query: string): boolean =>
  searchable([candidate.packageName, candidate.repositoryUrl, candidate.status], query)

const repoMatchesSearch = (repo: VendorTuiRepo, query: string): boolean =>
  searchable(
    [
      repo.name,
      ...repo.packageNames,
      repo.path,
      repo.ref,
      repo.source,
      repo.strategy,
      repo.versions?.local,
      repo.versions?.remote,
      repo.versions?.status,
      repo.versions?.vendor
    ],
    query
  )

export const createDashboardState = (
  snapshot: VendorTuiSnapshot,
  options: CreateDashboardStateOptions = {}
): DashboardState => ({
  activeTab: "tasks",
  addInput: "",
  focusedTaskIndex: 0,
  logLines: options.logLines ?? ["Loaded dependency source-context snapshot."],
  mode: "browsing",
  searchQuery: "",
  selectedTaskIndexes: [],
  selectedSuggestionIndex: 0,
  snapshot,
  inputMode: "add",
  statusMessage:
    options.statusMessage ??
    "Type to search or add a repo/package/org; enter to run, esc for shortcuts.",
  strategy: "subtree",
  suggestions: [],
  suggestionsQuery: "",
  suggestionsStatus: "Type two or more characters for GitHub autocomplete."
})

export const visibleTaskIndexes = (state: DashboardState): ReadonlyArray<number> =>
  state.snapshot.tasks.flatMap((task, index) =>
    taskMatchesSearch(task, state.searchQuery) ? [index] : []
  )

const firstVisibleTaskIndex = (state: DashboardState): number => visibleTaskIndexes(state)[0] ?? 0

const moveFocusedTaskIndex = (state: DashboardState, direction: 1 | -1): number => {
  const visible = visibleTaskIndexes(state)
  if (visible.length === 0) return 0
  const current = visible.indexOf(state.focusedTaskIndex)
  if (current < 0) return direction > 0 ? (visible[0] ?? 0) : (visible.at(-1) ?? 0)
  return visible[(current + direction + visible.length) % visible.length] ?? 0
}

const selectedOrFocusedIndexes = (state: DashboardState): ReadonlyArray<number> => {
  const visible = visibleTaskIndexes(state)
  const selected = state.selectedTaskIndexes.filter((index) => visible.includes(index))
  if (selected.length > 0) return selected
  return visible.includes(state.focusedTaskIndex) ? [state.focusedTaskIndex] : []
}

const taskTarget = (task: VendorTuiTask): string =>
  task.action === "update" && task.existingName
    ? task.existingName
    : (task.suggestedName ?? task.repositoryUrl)

const taskPackageLabel = (task: VendorTuiTask): string => task.packageNames.join(", ")

export const formatTaskRow = (state: DashboardState, index: number): string => {
  const task = state.snapshot.tasks[index]
  if (task === undefined) return ""
  const cursor = state.focusedTaskIndex === index ? ">" : " "
  const selected = state.selectedTaskIndexes.includes(index) ? "x" : " "
  const action = task.action.toUpperCase().padEnd(6, " ")
  const status = task.versions === undefined ? "" : ` [${task.versions.status}]`
  return `${cursor} [${selected}] ${action} ${taskPackageLabel(task)} -> ${taskTarget(task)}${status}`
}

export const visibleTaskRows = (state: DashboardState): ReadonlyArray<string> =>
  visibleTaskIndexes(state).length === 0
    ? ["No package-backed source-context tasks detected."]
    : visibleTaskIndexes(state).map((index) => formatTaskRow(state, index))

export const visibleCandidateRows = (
  snapshot: VendorTuiSnapshot,
  searchQuery = ""
): ReadonlyArray<string> =>
  snapshot.candidates
    .filter((candidate) => candidateMatchesSearch(candidate, searchQuery))
    .map((candidate) => formatCandidateRow(candidate))

export const visibleRepositoryRows = (
  snapshot: VendorTuiSnapshot,
  searchQuery = ""
): ReadonlyArray<string> => {
  const repos = snapshot.repos.filter((repo) => repoMatchesSearch(repo, searchQuery))
  return repos.length === 0
    ? ["No durable source routes detected."]
    : repoRowsSync({ ...snapshot, repos })
}

export const hasSuggestions = (state: DashboardState): boolean => state.suggestions.length > 0

export const visibleSuggestionRows = (state: DashboardState): ReadonlyArray<string> =>
  state.suggestions.map((suggestion, index) => {
    const cursor = state.selectedSuggestionIndex === index ? ">" : " "
    const kind = suggestion.kind === "repo" ? "repo" : "org "
    return `${cursor} ${kind} ${suggestion.label.padEnd(20, " ")}  ${suggestion.detail}`
  })

const candidateStatusLabel = (candidate: VendorTuiCandidate): string => {
  switch (candidate.status) {
    case "matched":
      return "matched"
    case "metadata-unavailable":
      return "no npm metadata"
    case "missing-repository":
      return "no repository"
    default:
      return candidate.status
  }
}

const formatCandidateRow = (candidate: VendorTuiCandidate): string => {
  const repository = candidate.repositoryUrl ?? "-"
  return `${candidate.packageName.padEnd(28, " ")} ${candidateStatusLabel(candidate).padEnd(16, " ")} ${repository}`
}

const addCommandForTask = (task: VendorTuiTask, strategy: VendorTuiStrategy): CommandPlan => ({
  action: "add",
  args: [
    "add",
    task.repositoryUrl,
    "--sync-package",
    task.primaryPackageName,
    "--strategy",
    strategy
  ],
  label: `add ${task.suggestedName ?? task.primaryPackageName}`
})

const updateCommandForTask = (task: VendorTuiTask): CommandPlan => ({
  action: "update",
  args: ["update", task.existingName ?? task.suggestedName ?? task.primaryPackageName],
  label: `update ${task.existingName ?? task.suggestedName ?? task.primaryPackageName}`
})

const githubOwnerUrlFromInput = (input: string): string | null => {
  const candidate =
    input.startsWith("github.com/") || input.startsWith("www.github.com/")
      ? `https://${input}`
      : input
  const url = Option.liftThrowable((value: string) => new URL(value))(candidate).pipe(
    Option.getOrNull
  )
  if (url === null) return null
  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") return null
  const segments = url.pathname
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  return segments.length === 1 ? (segments[0] ?? null) : null
}

const orgOwnerFromAddInput = (input: string): string | null => {
  const trimmed = input.trim()
  const prefixed = /^(?:org|owner):(.+)$/i.exec(trimmed)?.[1]?.trim()
  if (prefixed !== undefined && prefixed.length > 0) return prefixed
  const command = /^(?:org|add-org)\s+(.+)$/i.exec(trimmed)?.[1]?.trim()
  if (command !== undefined && command.length > 0) return command
  return githubOwnerUrlFromInput(trimmed)
}

const addCommandForInput = (input: string, strategy: VendorTuiStrategy): CommandPlan | null => {
  const trimmed = input.trim()
  if (trimmed.length === 0) return null
  const orgOwner = orgOwnerFromAddInput(trimmed)
  if (orgOwner !== null) {
    return {
      action: "add-org",
      args: ["add-org", orgOwner, "--strategy", strategy],
      label: `add org ${orgOwner}`
    }
  }
  return {
    action: "add",
    args: ["add", trimmed, "--strategy", strategy],
    label: `add ${trimmed}`
  }
}

const commandPlanForVisibleSelection = (state: DashboardState): ReadonlyArray<CommandPlan> =>
  selectedOrFocusedIndexes(state).flatMap((index) => {
    const task = state.snapshot.tasks[index]
    if (task === undefined) return []
    return task.action === "add"
      ? [addCommandForTask(task, state.strategy)]
      : [updateCommandForTask(task)]
  })

export const commandPlanForSelection = (state: DashboardState): ReadonlyArray<CommandPlan> => {
  const taskPlans = commandPlanForVisibleSelection(state)
  if (taskPlans.length > 0) return taskPlans
  const inputPlan = addCommandForInput(state.addInput, state.strategy)
  return inputPlan === null ? [] : [inputPlan]
}

const shellQuote = (value: string): string =>
  /^[A-Za-z0-9_./:@+-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`

export const commandPreviewLines = (state: DashboardState): ReadonlyArray<string> =>
  commandPlanForSelection(state).map((plan) => `ingraft ${plan.args.map(shellQuote).join(" ")}`)

const setSelected = (
  state: DashboardState,
  selectedTaskIndexes: ReadonlyArray<number>
): DashboardState => ({
  ...state,
  selectedTaskIndexes: normalizeSelectedIndexes(selectedTaskIndexes, state.snapshot)
})

const setInputValue = (state: DashboardState, value: string): DashboardState => {
  const next = {
    ...state,
    addInput: value,
    searchQuery: value,
    selectedTaskIndexes: [],
    selectedSuggestionIndex: 0,
    suggestions: [],
    suggestionsQuery: value,
    suggestionsStatus:
      value.trim().length < 2
        ? "Type two or more characters for GitHub autocomplete."
        : "Searching GitHub..."
  }
  return {
    ...next,
    focusedTaskIndex: firstVisibleTaskIndex(next),
    statusMessage:
      value.trim().length === 0
        ? "Input cleared."
        : `Filtering by '${value}'. Press enter to run a match or add it.`
  }
}

const canDispatchDashboard = (state: DashboardState, action: DashboardAction): boolean => {
  switch (state.mode) {
    case "browsing":
      switch (action._tag) {
        case "AppendLog":
        case "Cancel":
        case "FinishRun":
        case "StartRun":
          return false
        case "ConfirmRun":
          return commandPlanForSelection(state).length > 0
        default:
          return true
      }
    case "confirming-run":
      switch (action._tag) {
        case "Cancel":
          return true
        case "StartRun":
          return commandPlanForSelection(state).length > 0
        default:
          return false
      }
    case "running":
      switch (action._tag) {
        case "AppendLog":
        case "FinishRun":
          return true
        default:
          return false
      }
  }
}

export const dispatchDashboard = (
  state: DashboardState,
  action: DashboardAction
): DashboardState => {
  if (!canDispatchDashboard(state, action)) {
    if (state.mode === "browsing" && action._tag === "ConfirmRun") {
      return {
        ...state,
        statusMessage: "No source-context tasks to run."
      }
    }
    return state
  }

  switch (action._tag) {
    case "AppendLog":
      return {
        ...state,
        logLines: [...state.logLines, action.line].slice(-12)
      }
    case "Cancel":
      return {
        ...state,
        inputMode: "normal",
        mode: "browsing",
        statusMessage: "Cancelled."
      }
    case "ClearSelection":
      return {
        ...state,
        selectedTaskIndexes: [],
        statusMessage: "Selection cleared."
      }
    case "ConfirmRun":
      return {
        ...state,
        inputMode: "normal",
        mode: "confirming-run",
        statusMessage: "Press y to run the previewed command, n to cancel."
      }
    case "FinishRun": {
      const snapshot = action.snapshot ?? state.snapshot
      const next = { ...state, addInput: "", searchQuery: "", snapshot }
      return {
        ...next,
        addInput: "",
        searchQuery: "",
        focusedTaskIndex: !visibleTaskIndexes(next).includes(state.focusedTaskIndex)
          ? firstVisibleTaskIndex(next)
          : state.focusedTaskIndex,
        inputMode: "add",
        logLines: [...state.logLines, action.message].slice(-12),
        mode: "browsing",
        selectedTaskIndexes: normalizeSelectedIndexes(state.selectedTaskIndexes, snapshot),
        snapshot,
        statusMessage: action.message
      }
    }
    case "MoveDown":
      return {
        ...state,
        focusedTaskIndex: moveFocusedTaskIndex(state, 1)
      }
    case "MoveSuggestionDown":
      return hasSuggestions(state)
        ? {
            ...state,
            selectedSuggestionIndex: (state.selectedSuggestionIndex + 1) % state.suggestions.length
          }
        : state
    case "MoveSuggestionUp":
      return hasSuggestions(state)
        ? {
            ...state,
            selectedSuggestionIndex:
              (state.selectedSuggestionIndex - 1 + state.suggestions.length) %
              state.suggestions.length
          }
        : state
    case "MoveUp":
      return {
        ...state,
        focusedTaskIndex: moveFocusedTaskIndex(state, -1)
      }
    case "Refresh": {
      const next = { ...state, snapshot: action.snapshot }
      return {
        ...state,
        focusedTaskIndex: !visibleTaskIndexes(next).includes(state.focusedTaskIndex)
          ? firstVisibleTaskIndex(next)
          : state.focusedTaskIndex,
        logLines: [...state.logLines, action.message ?? "Snapshot refreshed."].slice(-12),
        mode: "browsing",
        selectedTaskIndexes: normalizeSelectedIndexes(state.selectedTaskIndexes, action.snapshot),
        snapshot: action.snapshot,
        statusMessage: action.message ?? "Snapshot refreshed."
      }
    }
    case "SelectAll":
      return setSelected(
        {
          ...state,
          statusMessage:
            state.searchQuery.trim().length > 0
              ? "Selected filtered source-context tasks."
              : "Selected every visible source-context task."
        },
        visibleTaskIndexes(state)
      )
    case "AcceptSuggestion": {
      const suggestion = state.suggestions[state.selectedSuggestionIndex]
      if (suggestion === undefined) return state
      return {
        ...setInputValue(state, suggestion.value),
        suggestions: [],
        suggestionsQuery: suggestion.value,
        suggestionsStatus: `Accepted ${suggestion.kind} suggestion ${suggestion.label}.`
      }
    }
    case "SetAddInput":
      return setInputValue(state, action.value)
    case "SetAddInputActive":
      return {
        ...state,
        inputMode: action.active ? "add" : "normal",
        statusMessage: action.active
          ? "Type to search or add a repo/package/org; enter to run, esc for shortcuts."
          : "Input kept."
      }
    case "SetSearch":
      return setInputValue(state, action.value)
    case "SetSearchActive":
      return {
        ...state,
        inputMode: action.active ? "search" : "normal",
        statusMessage: action.active
          ? "Type to search or add a repo/package/org; enter to run, esc for shortcuts."
          : "Input kept."
      }
    case "SetSuggestions":
      if (action.query !== state.addInput) return state
      return {
        ...state,
        selectedSuggestionIndex: 0,
        suggestions: action.suggestions,
        suggestionsQuery: action.query,
        suggestionsStatus:
          action.message ??
          (action.suggestions.length === 0
            ? "No GitHub autocomplete suggestions."
            : `${action.suggestions.length} GitHub suggestion(s).`)
      }
    case "SetSuggestionsLoading":
      if (action.query !== state.addInput) return state
      return {
        ...state,
        selectedSuggestionIndex: 0,
        suggestions: [],
        suggestionsQuery: action.query,
        suggestionsStatus: "Searching GitHub..."
      }
    case "SetStrategy":
      return {
        ...state,
        statusMessage: `New add strategy: ${action.strategy}.`,
        strategy: action.strategy
      }
    case "SetTab":
      return {
        ...state,
        activeTab: action.tab
      }
    case "StartRun":
      return {
        ...state,
        mode: "running",
        statusMessage: "Running source-context command..."
      }
    case "ToggleSelected": {
      if (!visibleTaskIndexes(state).includes(state.focusedTaskIndex)) return state
      const selected = state.selectedTaskIndexes.includes(state.focusedTaskIndex)
        ? state.selectedTaskIndexes.filter((index) => index !== state.focusedTaskIndex)
        : [...state.selectedTaskIndexes, state.focusedTaskIndex]
      return setSelected(
        {
          ...state,
          statusMessage: selected.includes(state.focusedTaskIndex)
            ? "Task selected."
            : "Task unselected."
        },
        selected
      )
    }
  }
}
