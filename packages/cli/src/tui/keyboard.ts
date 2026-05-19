import type { KeyEvent } from "@opentui/core"
import { Data, Effect, Option } from "effect"

import {
  commandPlanForSelection,
  dashboardTabs,
  DashboardAction,
  hasSuggestions,
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

const isPrintableCharacter = (key: KeyEvent): boolean =>
  key.sequence.length === 1 && key.sequence >= " " && key.sequence !== "\u007f"

const inputKeyAction = (key: KeyEvent, state: DashboardState): Option.Option<KeyAction> => {
  const name = keyName(key)
  if (name === "escape") {
    return dispatch(DashboardAction.SetAddInputActive({ active: false }))
  }
  if (name === "return" || name === "enter") {
    return commandPlanForSelection(state).length > 0
      ? dispatch(DashboardAction.ConfirmRun())
      : dispatch(DashboardAction.SetAddInputActive({ active: false }))
  }
  if (name === "backspace" || key.sequence === "\u007f" || key.sequence === "\b") {
    return dispatch(DashboardAction.SetAddInput({ value: state.addInput.slice(0, -1) }))
  }
  if (key.sequence === "\u0015") return dispatch(DashboardAction.SetAddInput({ value: "" }))
  if (name === "down")
    return dispatch(
      hasSuggestions(state) ? DashboardAction.MoveSuggestionDown() : DashboardAction.MoveDown()
    )
  if (name === "up")
    return dispatch(
      hasSuggestions(state) ? DashboardAction.MoveSuggestionUp() : DashboardAction.MoveUp()
    )
  if (name === "tab") {
    if (hasSuggestions(state)) return dispatch(DashboardAction.AcceptSuggestion())
    return dispatch(DashboardAction.SetTab({ tab: nextTab(state, 1) }))
  }
  if (name === "left") {
    return dispatch(DashboardAction.SetTab({ tab: nextTab(state, -1) }))
  }
  if (name === "right") {
    return dispatch(DashboardAction.SetTab({ tab: nextTab(state, 1) }))
  }
  return isPrintableCharacter(key)
    ? dispatch(DashboardAction.SetAddInput({ value: `${state.addInput}${key.sequence}` }))
    : Option.none()
}

const browsingKeyAction = (key: KeyEvent, state: DashboardState): Option.Option<KeyAction> => {
  if (state.inputMode === "search" || state.inputMode === "add") return inputKeyAction(key, state)
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
  if (name === "/" || sequence === "/")
    return dispatch(DashboardAction.SetSearchActive({ active: true }))
  if (name === "i" || sequence === "i" || sequence === "+") {
    return dispatch(DashboardAction.SetAddInputActive({ active: true }))
  }
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
