import { Effect, Option, Stream, SubscriptionRef } from "effect"

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
    statusMessage: "Loading vendored repositories and package metadata..."
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
            return false
        }
      })
    ),
    Stream.runDrain
  )
}).pipe(Effect.scoped)
