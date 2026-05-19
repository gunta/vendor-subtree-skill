import { Box, Text } from "@opentui/core"
import { Effect } from "effect"

import {
  commandPreviewLines,
  dashboardTabs,
  vendorStrategies,
  visibleSuggestionRows,
  visibleCandidateRows,
  visibleRepositoryRows,
  visibleTaskRows,
  type DashboardState
} from "./dashboard.ts"
import type { RenderableNode } from "./renderer.ts"
import type { VendorTuiSnapshot } from "./status.ts"

export interface Viewport {
  readonly height: number
  readonly width: number
}

export const colors = {
  accent: "#8BD5CA",
  background: "#11111B",
  border: "#45475A",
  muted: "#9399B2",
  panel: "#181825",
  success: "#A6E3A1",
  text: "#CDD6F4",
  warning: "#F9E2AF"
} as const

const tabLabel = (state: DashboardState): string =>
  dashboardTabs
    .map((tab) => {
      const label =
        tab === "dependencies"
          ? "deps"
          : tab === "repositories"
            ? "repos"
            : tab === "activity"
              ? "log"
              : tab
      return tab === state.activeTab ? `[${label.toUpperCase()}]` : label
    })
    .join("  ")

const strategyLabel = (state: DashboardState): string =>
  vendorStrategies
    .map((strategy, index) => {
      const label = strategy === "clone-ignore" ? "clone" : strategy
      return strategy === state.strategy ? `[${index + 1} ${label}]` : `${index + 1} ${label}`
    })
    .join("  ")

const compactSummary = (snapshot: VendorTuiSnapshot): string => {
  const matched = snapshot.candidates.filter((candidate) => candidate.status === "matched").length
  const adds = snapshot.tasks.filter((task) => task.action === "add").length
  const updates = snapshot.tasks.filter((task) => task.action === "update").length
  return `${snapshot.candidates.length} deps | ${matched} matches | ${snapshot.repos.length} vendored | ${adds} add | ${updates} update`
}

const selectedLabel = (state: DashboardState): string => {
  if (state.addInput.trim().length > 0) return "add input"
  const selected = state.selectedTaskIndexes.length
  if (selected > 0) return `${selected} selected`
  return state.snapshot.tasks.length === 0 ? "no tasks" : "focused task"
}

const leftPaneTitle = (state: DashboardState): string => {
  switch (state.activeTab) {
    case "activity":
      return "Activity"
    case "dependencies":
      return "Dependencies"
    case "repositories":
      return "Vendored Repositories"
    case "help":
      return "Keys"
    case "tasks":
      return "Vendoring Tasks"
  }
}

const activePaneLines = (state: DashboardState): ReadonlyArray<string> => {
  switch (state.activeTab) {
    case "activity":
      return state.logLines.length === 0 ? ["No activity yet."] : state.logLines
    case "dependencies":
      return visibleCandidateRows(state.snapshot, state.searchQuery)
    case "repositories":
      return visibleRepositoryRows(state.snapshot, state.searchQuery)
    case "help":
      return [
        "j/down, k/up       move task focus",
        "space              toggle focused task",
        "a                  select all tasks",
        "c                  clear selection",
        "type               search tasks; if no task matches, add that target",
        "+, i, /            focus the input from shortcut mode",
        "enter              confirm focused match or add input target",
        "tab                accept highlighted GitHub autocomplete",
        "up/down            choose autocomplete while typing",
        "y / n              confirm or cancel run",
        "backspace, ctrl-u  edit input while typing",
        "esc                leave input for shortcut mode",
        "r                  refresh dependency scan",
        "tab, h, l          switch tabs",
        "1, 2, 3, 4         add strategy: subtree, submodule, clone-ignore, cache-link",
        "q                  quit"
      ]
    case "tasks":
      return visibleTaskRows(state)
  }
}

const focusedTaskDetails = (state: DashboardState): ReadonlyArray<string> => {
  const task = state.snapshot.tasks[state.focusedTaskIndex]
  if (task === undefined) return ["No task focused."]
  const details = [
    `Action:      ${task.action}`,
    `Packages:    ${task.packageNames.join(", ")}`,
    `Repository:  ${task.repositoryUrl}`,
    `Target:      ${task.existingName ?? task.suggestedName ?? task.primaryPackageName}`,
    `Sync pkg:    ${task.primaryPackageName}`
  ]
  if (task.versions === undefined) return details
  return [
    ...details,
    `Local:      ${task.versions.local}`,
    `Vendor:     ${task.versions.vendor}`,
    `Remote:     ${task.versions.remote}`,
    `Drift:      ${task.versions.status}`
  ]
}

const commandPaneLines = (state: DashboardState): ReadonlyArray<string> => {
  const preview = commandPreviewLines(state)
  if (state.mode === "confirming-run") {
    return ["Run these commands?", ...preview, "", "Press y to run, n to cancel."]
  }
  if (state.mode === "running") return ["Running selected source-context commands..."]
  return preview.length === 0
    ? ["No runnable task."]
    : [`${selectedLabel(state)} will run:`, ...preview, "", "Press enter to confirm."]
}

const suggestionPaneLines = (state: DashboardState): ReadonlyArray<string> => {
  if (state.inputMode !== "add" && state.inputMode !== "search") return []
  if (state.addInput.trim().length < 2) return []
  const rows = visibleSuggestionRows(state)
  if (rows.length === 0) return [`GitHub autocomplete: ${state.suggestionsStatus}`]
  return ["GitHub autocomplete:", ...rows, "", "Tab accepts; up/down changes highlight."]
}

const truncateLine = (line: string, width: number): string =>
  line.length <= width ? line : `${line.slice(0, Math.max(0, width - 1))}~`

const textBlock = (lines: ReadonlyArray<string>, maxLines: number, width: number): string => {
  const visible = lines.slice(0, maxLines).map((line) => truncateLine(line, width))
  const remaining = lines.length - visible.length
  return remaining > 0
    ? [...visible, truncateLine(`... ${remaining} more`, width)].join("\n")
    : visible.join("\n")
}

const renderDashboardSync = (state: DashboardState, viewport: Viewport): RenderableNode => {
  const width = Math.max(72, viewport.width)
  const height = Math.max(24, viewport.height)
  const headerHeight = 7
  const footerHeight = 5
  const contentWidth = Math.max(68, width - 2)
  const bodyHeight = Math.max(8, height - headerHeight - footerHeight - 4)
  const leftWidth = Math.max(36, Math.floor((contentWidth - 1) * 0.58))
  const rightWidth = Math.max(30, contentWidth - leftWidth - 1)
  const leftTextWidth = Math.max(20, leftWidth - 4)
  const rightTextWidth = Math.max(20, rightWidth - 4)
  const bodyTextHeight = Math.max(1, bodyHeight - 4)
  const inputActive = state.inputMode === "add" || state.inputMode === "search"
  const inputValue =
    state.addInput.length > 0
      ? state.addInput
      : inputActive
        ? "type to search/add"
        : "press /, +, or i"
  const inputBox = `input ${inputActive ? ">" : "="} ${inputValue}${inputActive ? "_" : ""}`

  return Box(
    {
      id: "dashboard",
      backgroundColor: colors.background,
      flexDirection: "column",
      gap: 1,
      height,
      padding: 1,
      width
    },
    Box(
      {
        backgroundColor: colors.panel,
        borderColor: colors.border,
        borderStyle: "rounded",
        flexDirection: "column",
        height: headerHeight,
        padding: 1,
        width: contentWidth
      },
      Text({
        content: truncateLine("ingraft", contentWidth - 4),
        fg: colors.accent,
        width: contentWidth - 4
      }),
      Text({
        content: truncateLine(compactSummary(state.snapshot), contentWidth - 4),
        fg: colors.success,
        width: contentWidth - 4
      }),
      Text({
        content: truncateLine(
          `${tabLabel(state)}  |  strategy ${strategyLabel(state)}`,
          contentWidth - 4
        ),
        fg: colors.warning,
        width: contentWidth - 4
      })
    ),
    Box(
      {
        flexDirection: "row",
        gap: 1,
        height: bodyHeight,
        width: contentWidth
      },
      Box(
        {
          backgroundColor: colors.panel,
          borderColor: colors.border,
          borderStyle: "rounded",
          flexDirection: "column",
          height: bodyHeight,
          padding: 1,
          title: leftPaneTitle(state),
          width: leftWidth
        },
        Text({
          content: textBlock(activePaneLines(state), bodyTextHeight, leftTextWidth),
          fg: colors.text,
          width: leftTextWidth
        })
      ),
      Box(
        {
          backgroundColor: colors.panel,
          borderColor: state.mode === "confirming-run" ? colors.warning : colors.border,
          borderStyle: "rounded",
          flexDirection: "column",
          height: bodyHeight,
          padding: 1,
          title: "Details",
          width: rightWidth
        },
        Text({
          content: textBlock(
            [
              ...focusedTaskDetails(state),
              "",
              ...suggestionPaneLines(state),
              "",
              ...commandPaneLines(state)
            ],
            bodyTextHeight,
            rightTextWidth
          ),
          fg: state.mode === "confirming-run" ? colors.warning : colors.text,
          width: rightTextWidth
        })
      )
    ),
    Box(
      {
        backgroundColor: colors.panel,
        borderColor: state.mode === "running" ? colors.warning : colors.border,
        borderStyle: "rounded",
        height: footerHeight,
        padding: 1,
        width: contentWidth
      },
      Text({
        content: truncateLine(
          `${inputBox}  |  ${state.statusMessage}  |  q quit  r refresh  ? help`,
          contentWidth - 4
        ),
        fg: state.mode === "running" ? colors.warning : colors.muted,
        width: contentWidth - 4
      })
    )
  )
}

export const renderDashboard = (
  state: DashboardState,
  viewport: Viewport
): Effect.Effect<RenderableNode> => Effect.sync(() => renderDashboardSync(state, viewport))
