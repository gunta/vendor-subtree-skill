import { Context, Effect, FileSystem, Layer, Option, Path } from "effect"

import {
  VENDOR_DIR,
  firstExisting,
  hasVendorPattern,
  report,
  type ToolFileContext,
  type ToolIgnoreIntegration
} from "../common.ts"

const TOOL = "Mix/Elixir"

const FORMATTER_CONFIG = ".formatter.exs"

const doctorWith = (context: ToolFileContext, cwd: string) =>
  Effect.gen(function* () {
    const project = yield* firstExisting(context, cwd, ["mix.exs", "mix.lock", FORMATTER_CONFIG])
    if (Option.isNone(project)) {
      return report({
        detected: false,
        ignored: false,
        message: "not detected",
        status: "absent",
        tool: TOOL
      })
    }

    const formatter = context.path.resolve(cwd, FORMATTER_CONFIG)
    const formatterExists = yield* context.fs.exists(formatter)
    const ignored =
      formatterExists &&
      hasVendorPattern(yield* context.fs.readFileString(formatter), [
        VENDOR_DIR,
        `${VENDOR_DIR}/`,
        `${VENDOR_DIR}/**`
      ])

    return report({
      configPath: formatterExists ? formatter : project.value,
      detected: true,
      ignored,
      message: ignored
        ? "vendor appears in Mix formatter inputs"
        : "detected; no generated Mix formatter edit is applied",
      status: ignored ? "configured" : "visible",
      tool: TOOL
    })
  })

export class ElixirIgnore extends Context.Service<ElixirIgnore, ToolIgnoreIntegration>()(
  "ingraft/ElixirIgnore"
) {}

export const ElixirIgnoreLive = Layer.effect(
  ElixirIgnore,
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
