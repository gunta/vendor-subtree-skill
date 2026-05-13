#!/usr/bin/env bun
import { NodeRuntime } from "@effect/platform-node"
import { Effect, Logger } from "effect"

import { LiveLayer } from "../app/layers.ts"
import { GitMetadataLive } from "../services/git-metadata.ts"
import { runTuiApp } from "./app.ts"
import { TuiRendererLive } from "./renderer.ts"

const main = runTuiApp.pipe(
  Effect.provide(TuiRendererLive),
  Effect.provide(Logger.layer([Logger.withConsoleLog(Logger.formatSimple)])),
  Effect.provide(LiveLayer),
  Effect.provide(GitMetadataLive)
)

NodeRuntime.runMain(Effect.scoped(main))
