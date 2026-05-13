import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { Effect, FileSystem } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"

import { RuntimeConfig } from "../app/runtime.ts"
import {
  BunRuntimeMissing,
  CommandPlanFailed,
  TuiLaunchFailed,
  TuiRendererFailed
} from "../domain/errors.ts"
import { runTuiApp } from "./app.ts"
import { TuiRendererLive } from "./renderer.ts"

export interface TuiLaunchPlan {
  readonly _tag: "direct" | "spawn"
  readonly args: ReadonlyArray<string>
  readonly command?: string
}

export interface LaunchTuiOptions {
  readonly args?: ReadonlyArray<string>
  readonly bunCommand?: string
  readonly isBunRuntime?: boolean
  readonly moduleUrl?: string
}

const moduleExtensionSync = (moduleUrl: string): ".js" | ".ts" =>
  fileURLToPath(moduleUrl).endsWith(".ts") ? ".ts" : ".js"

export const siblingModulePath = (moduleUrl: string, name: string): Effect.Effect<string> =>
  Effect.sync(() =>
    resolve(dirname(fileURLToPath(moduleUrl)), `${name}${moduleExtensionSync(moduleUrl)}`)
  )

export const tuiLaunchPlan = ({
  args = [],
  bunCommand = "bun",
  isBunRuntime = "bun" in process.versions,
  moduleUrl = import.meta.url
}: LaunchTuiOptions = {}): Effect.Effect<TuiLaunchPlan> =>
  Effect.gen(function* () {
    if (isBunRuntime) return { _tag: "direct" as const, args }
    const runnerPath = yield* siblingModulePath(moduleUrl, "runner")
    return { _tag: "spawn" as const, args: [runnerPath, ...args], command: bunCommand }
  })

const isEnoent = (cause: unknown): boolean => {
  if (cause === null || typeof cause !== "object") return false
  if ("code" in cause && (cause as { code?: unknown }).code === "ENOENT") return true
  if ("cause" in cause) return isEnoent((cause as { cause?: unknown }).cause)
  return false
}

export const launchTui = (
  options: LaunchTuiOptions = {}
): Effect.Effect<
  void,
  BunRuntimeMissing | CommandPlanFailed | TuiLaunchFailed | TuiRendererFailed,
  ChildProcessSpawner | FileSystem.FileSystem | RuntimeConfig
> =>
  Effect.gen(function* () {
    const plan = yield* tuiLaunchPlan(options)
    if (plan._tag === "direct") {
      return yield* runTuiApp.pipe(Effect.provide(TuiRendererLive))
    }
    const command = plan.command ?? "bun"
    const runtime = yield* RuntimeConfig
    const handle = yield* ChildProcess.make(command, [...plan.args], {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit"
    }).pipe(
      Effect.mapError((cause) =>
        isEnoent(cause) ? new BunRuntimeMissing({}) : new TuiLaunchFailed({ command, cause })
      )
    )
    const exitCode = yield* handle.exitCode.pipe(
      Effect.mapError((cause) => new TuiLaunchFailed({ command, cause }))
    )
    yield* runtime.exit(typeof exitCode === "number" ? exitCode : 1)
  }).pipe(Effect.scoped)
