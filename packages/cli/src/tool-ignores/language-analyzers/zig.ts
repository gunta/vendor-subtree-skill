import { Context, Effect, FileSystem, Layer, Option, Path } from "effect"

import {
  firstExisting,
  report,
  type ToolFileContext,
  type ToolIgnoreIntegration
} from "../common.ts"

const TOOL = "Zig"

const doctorWith = (context: ToolFileContext, cwd: string) =>
  Effect.gen(function* () {
    const config = yield* firstExisting(context, cwd, ["build.zig", "build.zig.zon"])
    if (Option.isNone(config)) {
      return report({
        detected: false,
        ignored: false,
        message: "not detected",
        status: "absent",
        tool: TOOL
      })
    }

    return report({
      configPath: config.value,
      detected: true,
      ignored: false,
      message: "detected; no standard generated ignore config is applied",
      status: "visible",
      tool: TOOL
    })
  })

export class ZigIgnore extends Context.Service<ZigIgnore, ToolIgnoreIntegration>()(
  "ingraft/ZigIgnore"
) {}

export const ZigIgnoreLive = Layer.effect(
  ZigIgnore,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const context = { fs, path }
    return {
      doctor: (cwd: string) => doctorWith(context, cwd),
      refresh: (_cwd: string) => Effect.succeed(Option.none<string>())
    }
  })
)
