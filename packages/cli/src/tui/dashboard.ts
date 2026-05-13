import {
  repoRows,
  type VendorTuiCandidate,
  type VendorTuiSnapshot,
  type VendorTuiTask
} from "./status.ts"

export type VendorTuiStrategy = "subtree" | "submodule" | "clone-ignore"

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

export type DashboardAction =
  | { readonly type: "append-log"; readonly line: string }
  | { readonly type: "cancel" }
  | { readonly type: "clear-selection" }
  | { readonly type: "confirm-run" }
  | { readonly type: "finish-run"; readonly message: string; readonly snapshot?: VendorTuiSnapshot }
  | { readonly type: "move-down" }
  | { readonly type: "move-up" }
  | { readonly type: "refresh"; readonly snapshot: VendorTuiSnapshot; readonly message?: string }
  | { readonly type: "select-all" }
  | { readonly type: "set-strategy"; readonly strategy: VendorTuiStrategy }
  | { readonly type: "set-tab"; readonly tab: DashboardTab }
  | { readonly type: "start-run" }
  | { readonly type: "toggle-selected" }

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
  "clone-ignore"
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
  logLines: options.logLines ?? ["Loaded dependency vendoring snapshot."],
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
    ? ["No package-backed vendoring tasks detected."]
    : state.snapshot.tasks.map((_, index) => formatTaskRow(state, index))

export const visibleCandidateRows = (snapshot: VendorTuiSnapshot): ReadonlyArray<string> =>
  snapshot.candidates.map((candidate) => formatCandidateRow(candidate))

export const visibleRepositoryRows = (snapshot: VendorTuiSnapshot): ReadonlyArray<string> =>
  snapshot.repos.length === 0 ? ["No vendored repositories detected."] : repoRows(snapshot)

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

export const dispatchDashboard = (
  state: DashboardState,
  action: DashboardAction
): DashboardState => {
  switch (action.type) {
    case "append-log":
      return {
        ...state,
        logLines: [...state.logLines, action.line].slice(-12)
      }
    case "cancel":
      return {
        ...state,
        mode: "browsing",
        statusMessage: "Cancelled."
      }
    case "clear-selection":
      return {
        ...state,
        selectedTaskIndexes: [],
        statusMessage: "Selection cleared."
      }
    case "confirm-run":
      return commandPlanForSelection(state).length === 0
        ? {
            ...state,
            statusMessage: "No vendoring tasks to run."
          }
        : {
            ...state,
            mode: "confirming-run",
            statusMessage: "Press y to run selected tasks, n to cancel."
          }
    case "finish-run": {
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
    case "move-down":
      return {
        ...state,
        focusedTaskIndex: clampTaskIndex(state.focusedTaskIndex + 1, state.snapshot)
      }
    case "move-up":
      return {
        ...state,
        focusedTaskIndex: clampTaskIndex(state.focusedTaskIndex - 1, state.snapshot)
      }
    case "refresh":
      return {
        ...state,
        focusedTaskIndex: clampTaskIndex(state.focusedTaskIndex, action.snapshot),
        logLines: [...state.logLines, action.message ?? "Snapshot refreshed."].slice(-12),
        mode: "browsing",
        selectedTaskIndexes: normalizeSelectedIndexes(state.selectedTaskIndexes, action.snapshot),
        snapshot: action.snapshot,
        statusMessage: action.message ?? "Snapshot refreshed."
      }
    case "select-all":
      return setSelected(
        {
          ...state,
          statusMessage: "Selected every visible vendoring task."
        },
        state.snapshot.tasks.map((_, index) => index)
      )
    case "set-strategy":
      return {
        ...state,
        statusMessage: `New add strategy: ${action.strategy}.`,
        strategy: action.strategy
      }
    case "set-tab":
      return {
        ...state,
        activeTab: action.tab
      }
    case "start-run":
      return {
        ...state,
        mode: "running",
        statusMessage: "Running vendoring command..."
      }
    case "toggle-selected": {
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
