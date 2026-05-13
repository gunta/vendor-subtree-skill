import { Context, Effect, FileSystem, Layer, Option, Path } from "effect"

import {
  VENDOR_DIR,
  firstExisting,
  hasVendorPattern,
  report,
  type ToolFileContext,
  type ToolIgnoreIntegration
} from "../common.ts"

const TOOL = "golangci-lint"
const CONFIG_CANDIDATES = [
  ".golangci.yml",
  ".golangci.yaml",
  ".golangci.toml",
  ".golangci.json"
] as const

const configPath = (context: ToolFileContext, cwd: string) =>
  firstExisting(context, cwd, CONFIG_CANDIDATES)

const isDetected = (context: ToolFileContext, cwd: string) =>
  Effect.gen(function* () {
    const config = yield* configPath(context, cwd)
    if (Option.isSome(config)) return true
    return yield* context.fs.exists(context.path.resolve(cwd, "go.mod"))
  })

const doctorWith = (context: ToolFileContext, cwd: string) =>
  Effect.gen(function* () {
    if (!(yield* isDetected(context, cwd))) {
      return report({
        detected: false,
        ignored: false,
        message: "not detected",
        status: "absent",
        tool: TOOL
      })
    }

    const config = yield* configPath(context, cwd)
    if (Option.isNone(config)) {
      return report({
        detected: true,
        ignored: false,
        message: "Go project detected but no golangci-lint config found",
        status: "absent",
        tool: TOOL
      })
    }

    const content = yield* context.fs.readFileString(config.value)
    const ignored = hasVendorPattern(content, [
      VENDOR_DIR,
      `${VENDOR_DIR}/`,
      `${VENDOR_DIR}/.*`,
      `${VENDOR_DIR}/**`
    ])
    return report({
      configPath: config.value,
      detected: true,
      ignored,
      message: ignored
        ? "vendor appears in golangci-lint exclusions"
        : "detected; YAML/TOML/JSON merge is reported but not auto-written",
      status: ignored ? "configured" : "unsupported",
      tool: TOOL
    })
  })

export class GolangciLintIgnore extends Context.Service<
  GolangciLintIgnore,
  ToolIgnoreIntegration
>()("ingraft/GolangciLintIgnore") {}

export const GolangciLintIgnoreLive = Layer.effect(
  GolangciLintIgnore,
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
