#!/usr/bin/env bun
import { createCliRenderer } from "@opentui/core"

import { emptySnapshot, readSnapshotStreaming, runCommandPlan } from "./cli-adapter.ts"
import {
  commandPlanForSelection,
  createDashboardState,
  dispatchDashboard,
  type DashboardState
} from "./dashboard.ts"
import { handleDashboardKey } from "./keyboard.ts"
import { colors, renderDashboard } from "./render.ts"

export const runTuiApp = async () => {
  let state = createDashboardState(emptySnapshot(), {
    logLines: ["Opened dashboard; loading repository state in the background."],
    statusMessage: "Loading vendored repositories and package metadata..."
  })
  let snapshotRefreshId = 0

  const renderer = await createCliRenderer({
    backgroundColor: colors.background,
    clearOnShutdown: true,
    enableMouseMovement: true,
    exitOnCtrlC: true,
    screenMode: "alternate-screen",
    targetFps: 30,
    useMouse: true
  })

  const render = () => {
    const current = renderer.root.findDescendantById("dashboard")
    if (current !== undefined) renderer.root.remove("dashboard")
    renderer.root.add(
      renderDashboard(state, {
        height: renderer.terminalHeight,
        width: renderer.terminalWidth
      })
    )
    renderer.requestRender()
  }

  const updateState = (next: DashboardState) => {
    state = next
    render()
  }

  const refreshSnapshot = (message = "Refreshing repository and dependency snapshot...") => {
    const refreshId = (snapshotRefreshId += 1)
    updateState(
      dispatchDashboard(state, {
        message,
        snapshot: state.snapshot,
        type: "refresh"
      })
    )
    void readSnapshotStreaming((progress) => {
      if (refreshId !== snapshotRefreshId) return
      updateState(
        dispatchDashboard(state, {
          message: progress.message,
          snapshot: progress.snapshot,
          type: "refresh"
        })
      )
    }).catch((cause) => {
      if (refreshId !== snapshotRefreshId) return
      updateState(
        dispatchDashboard(state, {
          message: cause instanceof Error ? cause.message : String(cause),
          snapshot: state.snapshot,
          type: "refresh"
        })
      )
    })
  }

  const runSelected = () => {
    const plans = commandPlanForSelection(state)
    if (plans.length === 0) {
      updateState(dispatchDashboard(state, { type: "cancel" }))
      return
    }

    updateState(dispatchDashboard(state, { type: "start-run" }))
    for (const plan of plans) {
      updateState(dispatchDashboard(state, { line: `RUN ${plan.label}`, type: "append-log" }))
      updateState(dispatchDashboard(state, { line: runCommandPlan(plan), type: "append-log" }))
    }
    refreshSnapshot(`Processed ${plans.length} task(s). Refreshing snapshot...`)
    updateState(
      dispatchDashboard(state, {
        message: `Processed ${plans.length} task(s). Refreshing snapshot...`,
        snapshot: state.snapshot,
        type: "finish-run"
      })
    )
  }

  renderer.keyInput.on("keypress", (key) =>
    handleDashboardKey(key, {
      quit: () => {
        renderer.destroy()
        process.exit(0)
      },
      refreshSnapshot,
      runSelected,
      state: () => state,
      updateState
    })
  )

  render()
  setTimeout(() => refreshSnapshot("Loading vendored repositories and project dependencies..."), 0)
}
