import { Effect, Option, Stream, SubscriptionRef } from "effect"

import { LiveLayer } from "../app/layers.ts"
import { GitMetadataLive } from "../services/git-metadata.ts"
import { GitHubSearch } from "../services/github-search.ts"
import { emptySnapshot, readSnapshotStream, runCommandPlanEffect } from "./cli-adapter.ts"
import {
  commandPlanForSelection,
  createDashboardState,
  DashboardAction,
  dispatchDashboard,
  type DashboardState
} from "./dashboard.ts"
import { handleDashboardKey } from "./keyboard.ts"
import { renderDashboard } from "./render.ts"
import { TuiRenderer } from "./renderer.ts"

const initialState = (): DashboardState =>
  createDashboardState(emptySnapshot(), {
    logLines: ["Opened dashboard; loading repository state in the background."],
    statusMessage: "Loading durable source routes and package metadata..."
  })

const renderState = (state: DashboardState) =>
  Effect.gen(function* () {
    const renderer = yield* TuiRenderer
    const size = yield* renderer.terminalSize
    const node = yield* renderDashboard(state, size)
    yield* renderer.render(node)
  })

const refreshSnapshot = (stateRef: SubscriptionRef.SubscriptionRef<DashboardState>) =>
  Effect.gen(function* () {
    const current = yield* SubscriptionRef.get(stateRef)
    yield* SubscriptionRef.set(
      stateRef,
      dispatchDashboard(
        current,
        DashboardAction.Refresh({
          message: "Refreshing repository and dependency snapshot...",
          snapshot: current.snapshot
        })
      )
    )
    yield* readSnapshotStream.pipe(
      Stream.runForEach((progress) =>
        SubscriptionRef.update(stateRef, (s) =>
          dispatchDashboard(
            s,
            DashboardAction.Refresh({
              message: progress.message,
              snapshot: progress.snapshot
            })
          )
        )
      ),
      Effect.forkChild
    )
  })

const shouldRefreshSuggestions = (action: DashboardAction): boolean =>
  action._tag === "SetAddInput" || action._tag === "SetSearch"

const refreshSuggestions = (
  stateRef: SubscriptionRef.SubscriptionRef<DashboardState>,
  query: string
) =>
  Effect.gen(function* () {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      yield* SubscriptionRef.update(stateRef, (state) =>
        dispatchDashboard(
          state,
          DashboardAction.SetSuggestions({
            message: "Type two or more characters for GitHub autocomplete.",
            query,
            suggestions: []
          })
        )
      )
      return
    }
    yield* SubscriptionRef.update(stateRef, (state) =>
      dispatchDashboard(state, DashboardAction.SetSuggestionsLoading({ query }))
    )
    const result = yield* Effect.gen(function* () {
      const search = yield* GitHubSearch
      return yield* search.suggestions({ limit: 5, query: trimmed })
    }).pipe(
      Effect.provide(LiveLayer),
      Effect.provide(GitMetadataLive),
      Effect.match({
        onFailure: () => ({ _tag: "failure" as const }),
        onSuccess: (suggestions) => ({ _tag: "success" as const, suggestions })
      })
    )
    yield* SubscriptionRef.update(stateRef, (state) => {
      if (state.addInput !== query) return state
      if (result._tag === "failure") {
        return dispatchDashboard(
          state,
          DashboardAction.SetSuggestions({
            message: "GitHub autocomplete unavailable; check gh auth or connectivity.",
            query,
            suggestions: []
          })
        )
      }
      return dispatchDashboard(
        state,
        DashboardAction.SetSuggestions({
          message:
            result.suggestions.length === 0
              ? "No GitHub autocomplete suggestions."
              : `${result.suggestions.length} GitHub suggestion(s).`,
          query,
          suggestions: result.suggestions
        })
      )
    })
  }).pipe(Effect.forkChild)

const runSelected = (stateRef: SubscriptionRef.SubscriptionRef<DashboardState>) =>
  Effect.gen(function* () {
    const current = yield* SubscriptionRef.get(stateRef)
    const plans = commandPlanForSelection(current)
    if (plans.length === 0) {
      yield* SubscriptionRef.update(stateRef, (s) => dispatchDashboard(s, DashboardAction.Cancel()))
      return
    }
    yield* SubscriptionRef.update(stateRef, (s) => dispatchDashboard(s, DashboardAction.StartRun()))
    for (const plan of plans) {
      yield* SubscriptionRef.update(stateRef, (s) =>
        dispatchDashboard(s, DashboardAction.AppendLog({ line: `RUN ${plan.label}` }))
      )
      const output = yield* runCommandPlanEffect(plan)
      yield* SubscriptionRef.update(stateRef, (s) =>
        dispatchDashboard(s, DashboardAction.AppendLog({ line: output }))
      )
    }
    yield* SubscriptionRef.update(stateRef, (s) =>
      dispatchDashboard(
        s,
        DashboardAction.FinishRun({
          message: `Processed ${plans.length} task(s). Refreshing snapshot...`
        })
      )
    )
    yield* refreshSnapshot(stateRef)
  })

export const runTuiApp = Effect.gen(function* () {
  const renderer = yield* TuiRenderer
  const stateRef = yield* SubscriptionRef.make(initialState())

  // Re-render on every state change. Forked in the surrounding Scope so the
  // fiber is interrupted when the app effect completes.
  yield* SubscriptionRef.changes(stateRef).pipe(Stream.runForEach(renderState), Effect.forkScoped)

  // Kick off initial snapshot load in the background.
  yield* refreshSnapshot(stateRef).pipe(Effect.forkChild)

  // Consume key events until the user quits.
  yield* renderer.keyEvents.pipe(
    Stream.takeUntilEffect((event) =>
      Effect.gen(function* () {
        const current = yield* SubscriptionRef.get(stateRef)
        const result = yield* handleDashboardKey(event, current)
        if (Option.isNone(result)) return false
        const keyAction = result.value
        switch (keyAction._tag) {
          case "Quit":
            yield* renderer.shutdown
            return true
          case "Run":
            yield* runSelected(stateRef)
            return false
          case "RefreshSnapshot":
            yield* refreshSnapshot(stateRef)
            return false
          case "Dispatch":
            yield* SubscriptionRef.update(stateRef, (s) => dispatchDashboard(s, keyAction.action))
            if (shouldRefreshSuggestions(keyAction.action)) {
              const updated = yield* SubscriptionRef.get(stateRef)
              yield* refreshSuggestions(stateRef, updated.addInput)
            }
            return false
        }
      })
    ),
    Stream.runDrain
  )
}).pipe(Effect.scoped)
