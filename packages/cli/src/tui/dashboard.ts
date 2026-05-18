import { Data } from "effect"

import {
  repoRowsSync,
  type VendorTuiCandidate,
  type VendorTuiSnapshot,
  type VendorTuiTask
} from "./status.ts"

export type VendorTuiStrategy = "subtree" | "submodule" | "clone-ignore" | "cache-link"

export type DashboardTab = "tasks" | "repositories" | "dependencies" | "activity" | "help"

export type DashboardMode = "browsing" | "confirming-run" | "running"

export interface CommandPlan {
  readonly action: VendorTuiTask["action"]
  readonly args: ReadonlyArray<string>
  readonly label: string
}

export interface DashboardState {
  readonly activeTab: DashboardTab
  readonly focusedTaskIndex: number
  readonly logLines: ReadonlyArray<string>
  readonly mode: DashboardMode
  readonly selectedTaskIndexes: ReadonlyArray<number>
  readonly snapshot: VendorTuiSnapshot
  readonly statusMessage: string
  readonly strategy: VendorTuiStrategy
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
  MoveUp: {}
  Refresh: { readonly snapshot: VendorTuiSnapshot; readonly message?: string }
  SelectAll: {}
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

const clampTaskIndex = (index: number, snapshot: VendorTuiSnapshot): number => {
  if (snapshot.tasks.length === 0) return 0
  return ((index % snapshot.tasks.length) + snapshot.tasks.length) % snapshot.tasks.length
}

const normalizeSelectedIndexes = (
  indexes: ReadonlyArray<number>,
  snapshot: VendorTuiSnapshot
): ReadonlyArray<number> =>
  [...new Set(indexes.filter((index) => index >= 0 && index < snapshot.tasks.length))].sort(
    (a, b) => a - b
  )

export const createDashboardState = (
  snapshot: VendorTuiSnapshot,
  options: CreateDashboardStateOptions = {}
): DashboardState => ({
  activeTab: "tasks",
  focusedTaskIndex: 0,
  logLines: options.logLines ?? ["Loaded dependency source-context snapshot."],
  mode: "browsing",
  selectedTaskIndexes: [],
  snapshot,
  statusMessage: options.statusMessage ?? "Use j/k to move, space to select, enter to run.",
  strategy: "subtree"
})

const selectedOrFocusedIndexes = (state: DashboardState): ReadonlyArray<number> => {
  if (state.selectedTaskIndexes.length > 0) return state.selectedTaskIndexes
  return state.snapshot.tasks[state.focusedTaskIndex] === undefined ? [] : [state.focusedTaskIndex]
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
  state.snapshot.tasks.length === 0
    ? ["No package-backed source-context tasks detected."]
    : state.snapshot.tasks.map((_, index) => formatTaskRow(state, index))

export const visibleCandidateRows = (snapshot: VendorTuiSnapshot): ReadonlyArray<string> =>
  snapshot.candidates.map((candidate) => formatCandidateRow(candidate))

export const visibleRepositoryRows = (snapshot: VendorTuiSnapshot): ReadonlyArray<string> =>
  snapshot.repos.length === 0 ? ["No durable source routes detected."] : repoRowsSync(snapshot)

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

export const commandPlanForSelection = (state: DashboardState): ReadonlyArray<CommandPlan> =>
  selectedOrFocusedIndexes(state).flatMap((index) => {
    const task = state.snapshot.tasks[index]
    if (task === undefined) return []
    return task.action === "add"
      ? [addCommandForTask(task, state.strategy)]
      : [updateCommandForTask(task)]
  })

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
        mode: "confirming-run",
        statusMessage: "Press y to run selected tasks, n to cancel."
      }
    case "FinishRun": {
      const snapshot = action.snapshot ?? state.snapshot
      return {
        ...state,
        focusedTaskIndex: clampTaskIndex(state.focusedTaskIndex, snapshot),
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
        focusedTaskIndex: clampTaskIndex(state.focusedTaskIndex + 1, state.snapshot)
      }
    case "MoveUp":
      return {
        ...state,
        focusedTaskIndex: clampTaskIndex(state.focusedTaskIndex - 1, state.snapshot)
      }
    case "Refresh":
      return {
        ...state,
        focusedTaskIndex: clampTaskIndex(state.focusedTaskIndex, action.snapshot),
        logLines: [...state.logLines, action.message ?? "Snapshot refreshed."].slice(-12),
        mode: "browsing",
        selectedTaskIndexes: normalizeSelectedIndexes(state.selectedTaskIndexes, action.snapshot),
        snapshot: action.snapshot,
        statusMessage: action.message ?? "Snapshot refreshed."
      }
    case "SelectAll":
      return setSelected(
        {
          ...state,
          statusMessage: "Selected every visible source-context task."
        },
        state.snapshot.tasks.map((_, index) => index)
      )
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
      if (state.snapshot.tasks[state.focusedTaskIndex] === undefined) return state
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
