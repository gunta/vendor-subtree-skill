import { Effect } from "effect"
import { Command } from "effect/unstable/cli"

import { withCommandTelemetry } from "../app/log.tsx"
import { launchTui } from "../tui/launcher.ts"

export const openTui = Effect.promise(() => launchTui()).pipe(
  Effect.asVoid,
  withCommandTelemetry("tui")
)

export const tuiCmd = Command.make("tui", {}, () => openTui).pipe(
  Command.withDescription("Open the interactive vendoring dashboard.")
)
