import { Context, Effect, FileSystem, Layer, Option, Path } from "effect"

import { jsObjectHasArrayValue } from "../../config/javascript-source.ts"
import {
  completeMerge,
  ensureArrayItem,
  initialSettingsState,
  parseSettings,
  SettingsMergeResult
} from "../../config/jsonc-settings.ts"
import { tsObjectHasArrayValue } from "../../config/typescript-source.ts"
import {
  firstExisting,
  hasVendorPattern,
  packageHasDependency,
  report,
  VENDOR_GLOB,
  type ToolFileContext,
  type ToolIgnoreIntegration
} from "../common.ts"

const TOOL = "Oxlint"
const JSON_CONFIG = ".oxlintrc.json"
const SOURCE_CONFIG_CANDIDATES = [
  "oxlint.config.ts",
  "oxlint.config.js",
  "oxlint.config.mjs",
  "oxlint.config.cjs"
] as const
const CONFIG_CANDIDATES = [JSON_CONFIG, ...SOURCE_CONFIG_CANDIDATES] as const

export const mergeOxlintConfigText = (text = "{}\n"): SettingsMergeResult => {
  const parsed = parseSettings({ objectName: "Oxlint config", text })
  if (parsed._tag === "Invalid") {
    return SettingsMergeResult.Invalid({ message: parsed.message })
  }

  return completeMerge(
    ensureArrayItem({
      item: VENDOR_GLOB,
      key: "ignorePatterns",
      state: initialSettingsState(parsed.source, parsed.value)
    })
  )
}

const jsonConfigPath = (context: ToolFileContext, cwd: string) =>
  context.path.resolve(cwd, JSON_CONFIG)

const sourceConfigPath = (context: ToolFileContext, cwd: string) =>
  firstExisting(context, cwd, SOURCE_CONFIG_CANDIDATES)

const sourceConfigIgnoresVendor = (path: string, content: string): boolean =>
  path.endsWith(".ts")
    ? tsObjectHasArrayValue(content, "ignorePatterns", VENDOR_GLOB)
    : jsObjectHasArrayValue(content, "ignorePatterns", VENDOR_GLOB)

const isDetected = (context: ToolFileContext, cwd: string) =>
  Effect.gen(function* () {
    const config = yield* firstExisting(context, cwd, CONFIG_CANDIDATES)
    if (Option.isSome(config)) return true
    return yield* packageHasDependency(context, cwd, ["oxlint"])
  })

const refreshWith = (context: ToolFileContext, cwd: string) =>
  Effect.gen(function* () {
    if (!(yield* isDetected(context, cwd))) return Option.none<string>()
    const unsupported = yield* sourceConfigPath(context, cwd)
    const jsonTarget = jsonConfigPath(context, cwd)
    if (Option.isSome(unsupported) && !(yield* context.fs.exists(jsonTarget))) {
      return Option.none<string>()
    }

    const current = (yield* context.fs.exists(jsonTarget))
      ? yield* context.fs.readFileString(jsonTarget)
      : "{}\n"
    const merged = mergeOxlintConfigText(current)
    if (merged._tag !== "Updated") return Option.none<string>()
    yield* context.fs.writeFileString(
      jsonTarget,
      merged.text.endsWith("\n") ? merged.text : `${merged.text}\n`
    )
    return Option.some(jsonTarget)
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

    const jsonTarget = jsonConfigPath(context, cwd)
    if (!(yield* context.fs.exists(jsonTarget))) {
      const sourceTarget = yield* sourceConfigPath(context, cwd)
      if (Option.isSome(sourceTarget)) {
        const ignored = sourceConfigIgnoresVendor(
          sourceTarget.value,
          yield* context.fs.readFileString(sourceTarget.value)
        )
        return report({
          configPath: sourceTarget.value,
          detected: true,
          ignored,
          message: ignored
            ? "vendor ignored by ignorePatterns in source config"
            : "source config detected; not auto-written",
          status: ignored ? "configured" : "unsupported",
          tool: TOOL
        })
      }
      return report({
        configPath: jsonTarget,
        detected: true,
        ignored: false,
        message: "JSON config can be created on refresh",
        status: "missing",
        tool: TOOL
      })
    }

    const ignored = hasVendorPattern(yield* context.fs.readFileString(jsonTarget))
    return report({
      configPath: jsonTarget,
      detected: true,
      ignored,
      message: ignored ? "vendor ignored by ignorePatterns" : "vendor not ignored",
      status: ignored ? "configured" : "missing",
      tool: TOOL
    })
  })

export class OxlintIgnore extends Context.Service<OxlintIgnore, ToolIgnoreIntegration>()(
  "ingraft/OxlintIgnore"
) {}

export const OxlintIgnoreLive = Layer.effect(
  OxlintIgnore,
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
