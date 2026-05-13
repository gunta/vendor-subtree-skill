import type { KeyEvent } from "@opentui/core"
import { Data, Effect, Option } from "effect"

import {
  dashboardTabs,
  DashboardAction,
  vendorStrategies,
  type DashboardState,
  type DashboardTab
} from "./dashboard.ts"

/**
 * The result of handling a key event. Carries one of: a state-machine action
 * for the reducer to apply, or a side-effecting command (Run, RefreshSnapshot,
 * Quit) that the app loop must orchestrate.
 */
export type KeyAction = Data.TaggedEnum<{
  Dispatch: { readonly action: DashboardAction }
  Run: {}
  RefreshSnapshot: {}
  Quit: {}
}>

export const KeyAction = Data.taggedEnum<KeyAction>()

const nextTab = (state: DashboardState, direction: 1 | -1): DashboardTab => {
  const current = dashboardTabs.indexOf(state.activeTab)
  const next = (current + direction + dashboardTabs.length) % dashboardTabs.length
  return dashboardTabs[next] ?? "tasks"
}

const keyName = (key: KeyEvent): string => key.name.toLowerCase()

const dispatch = (action: DashboardAction) => Option.some(KeyAction.Dispatch({ action }))

const browsingKeyAction = (key: KeyEvent, state: DashboardState): Option.Option<KeyAction> => {
  const name = keyName(key)
  const sequence = key.sequence
  if (name === "q" || sequence === "q") return Option.some(KeyAction.Quit())
  if (name === "down" || name === "j" || sequence === "j")
    return dispatch(DashboardAction.MoveDown())
  if (name === "up" || name === "k" || sequence === "k") return dispatch(DashboardAction.MoveUp())
  if (name === "space" || sequence === " ") return dispatch(DashboardAction.ToggleSelected())
  if (name === "a" || sequence === "a") return dispatch(DashboardAction.SelectAll())
  if (name === "c" || sequence === "c") return dispatch(DashboardAction.ClearSelection())
  if (name === "return" || name === "enter") return dispatch(DashboardAction.ConfirmRun())
  if (name === "r" || sequence === "r") return Option.some(KeyAction.RefreshSnapshot())
  if (name === "tab" || name === "l" || sequence === "l") {
    return dispatch(DashboardAction.SetTab({ tab: nextTab(state, 1) }))
  }
  if (name === "h" || sequence === "h") {
    return dispatch(DashboardAction.SetTab({ tab: nextTab(state, -1) }))
  }
  if (sequence === "?" || name === "?") return dispatch(DashboardAction.SetTab({ tab: "help" }))
  const strategyIndex = Number.parseInt(sequence, 10) - 1
  const strategy = vendorStrategies[strategyIndex]
  if (strategy !== undefined) return dispatch(DashboardAction.SetStrategy({ strategy }))
  return Option.none()
}

const confirmingKeyAction = (key: KeyEvent): Option.Option<KeyAction> => {
  const name = keyName(key)
  if (name === "y" || key.sequence === "y") return Option.some(KeyAction.Run())
  if (name === "n" || name === "escape" || key.sequence === "n") {
    return dispatch(DashboardAction.Cancel())
  }
  return Option.none()
}

export const handleDashboardKey = (
  key: KeyEvent,
  state: DashboardState
): Effect.Effect<Option.Option<KeyAction>> =>
  Effect.sync(() => {
    if (state.mode === "running") return Option.none()
    if (state.mode === "confirming-run") return confirmingKeyAction(key)
    return browsingKeyAction(key, state)
  })
