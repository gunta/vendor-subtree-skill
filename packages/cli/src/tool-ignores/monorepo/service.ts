import { Context, Effect, FileSystem, Layer, Option, Path } from "effect"

import { buildSystemTools } from "./build-systems/index.ts"
import {
  type MonorepoToolCategory,
  type MonorepoToolDefinition,
  type ToolFileContext,
  type ToolIgnoreReport
} from "./common.ts"
import { packageManagerTools } from "./package-managers/index.ts"
import { taskRunnerTools } from "./task-runners/index.ts"

const categories = [
  packageManagerTools,
  taskRunnerTools,
  buildSystemTools
] as const satisfies ReadonlyArray<MonorepoToolCategory>

const categoryTools = categories.flatMap((category) => category.tools)

const hasRefresh = (
  tool: MonorepoToolDefinition
): tool is MonorepoToolDefinition & {
  readonly refresh: NonNullable<MonorepoToolDefinition["refresh"]>
} => tool.refresh !== undefined

const doctorWith = (context: ToolFileContext, cwd: string) =>
  Effect.all(
    categoryTools.map((tool) => tool.doctor(context, cwd)),
    {
      concurrency: categoryTools.length
    }
  )

const refreshWith = (context: ToolFileContext, cwd: string) => {
  const refreshableTools = categoryTools.filter(hasRefresh)
  return Effect.all(
    refreshableTools.map((tool) => tool.refresh(context, cwd)),
    { concurrency: refreshableTools.length }
  ).pipe(
    Effect.map((paths) =>
      paths.flatMap(
        Option.match({
          onNone: () => [],
          onSome: (path) => [path]
        })
      )
    )
  )
}

export interface MonorepoToolsShape {
  readonly doctor: (cwd: string) => Effect.Effect<ReadonlyArray<ToolIgnoreReport>, unknown>
  readonly refresh: (cwd: string) => Effect.Effect<ReadonlyArray<string>, unknown>
}

export class MonorepoTools extends Context.Service<MonorepoTools, MonorepoToolsShape>()(
  "ingraft/MonorepoTools"
) {}

export const MonorepoToolsLive = Layer.effect(
  MonorepoTools,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const context = { fs, path }
    return {
      doctor: (cwd: string) => doctorWith(context, cwd),
      refresh: (cwd: string) => refreshWith(context, cwd)
    }
  })
)
