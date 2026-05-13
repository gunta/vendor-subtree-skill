import { Context, Effect, FileSystem, Layer, Option, Path } from "effect"

import {
  firstExisting,
  hasVendorPattern,
  mergeManagedIgnoreSection,
  packageHasDependency,
  report,
  VENDOR_IGNORE_DIR,
  type ToolFileContext,
  type ToolIgnoreIntegration
} from "../common.ts"

const TOOL = "Prettier"
const BEGIN = "# ingraft: prettier-ignore begin"
const END = "# ingraft: prettier-ignore end"
const CONFIG_CANDIDATES = [
  ".prettierrc",
  ".prettierrc.json",
  ".prettierrc.jsonc",
  ".prettierrc.yaml",
  ".prettierrc.yml",
  ".prettierrc.js",
  ".prettierrc.cjs",
  ".prettierrc.mjs",
  "prettier.config.js",
  "prettier.config.cjs",
  "prettier.config.mjs"
] as const

const isDetected = (context: ToolFileContext, cwd: string) =>
  Effect.gen(function* () {
    const config = yield* firstExisting(context, cwd, CONFIG_CANDIDATES)
    if (Option.isSome(config)) return true
    return yield* packageHasDependency(context, cwd, ["prettier"])
  })

export const mergePrettierIgnoreText = (content: string): string =>
  mergeManagedIgnoreSection({
    begin: BEGIN,
    content,
    end: END,
    lines: [VENDOR_IGNORE_DIR]
  })

const refreshWith = (context: ToolFileContext, cwd: string) =>
  Effect.gen(function* () {
    if (!(yield* isDetected(context, cwd))) return Option.none<string>()
    const target = context.path.resolve(cwd, ".prettierignore")
    const current = (yield* context.fs.exists(target))
      ? yield* context.fs.readFileString(target)
      : ""
    const next = mergePrettierIgnoreText(current)
    if (next === current) return Option.none<string>()
    yield* context.fs.writeFileString(target, next)
    return Option.some(target)
  })

const doctorWith = (context: ToolFileContext, cwd: string) =>
  Effect.gen(function* () {
    const detected = yield* isDetected(context, cwd)
    if (!detected) {
      return report({
        detected: false,
        ignored: false,
        message: "not detected",
        status: "absent",
        tool: TOOL
      })
    }

    const target = context.path.resolve(cwd, ".prettierignore")
    const exists = yield* context.fs.exists(target)
    const ignored = exists && hasVendorPattern(yield* context.fs.readFileString(target))
    return report({
      configPath: target,
      detected: true,
      ignored,
      message: ignored ? "vendor ignored by .prettierignore" : "vendor not ignored",
      status: ignored ? "configured" : "missing",
      tool: TOOL
    })
  })

export class PrettierIgnore extends Context.Service<PrettierIgnore, ToolIgnoreIntegration>()(
  "ingraft/PrettierIgnore"
) {}

export const PrettierIgnoreLive = Layer.effect(
  PrettierIgnore,
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
