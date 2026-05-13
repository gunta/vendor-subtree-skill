import { Context, Effect, FileSystem, Layer, Option, Path } from "effect"

import {
  completeMerge,
  ensureArrayItems,
  initialSettingsState,
  parseSettings,
  type SettingsMergeResult
} from "../../config/jsonc-settings.ts"
import {
  VENDOR_GLOB,
  firstExisting,
  hasVendorPattern,
  packageHasDependency,
  report,
  type ToolFileContext,
  type ToolIgnoreIntegration
} from "../common.ts"

const TOOL = "CSpell"
const CONFIG_CANDIDATES = [
  "cspell.json",
  "cspell.jsonc",
  "cspell.config.json",
  ".cspell.json"
] as const

export const mergeCspellConfigText = (text = "{}\n"): SettingsMergeResult => {
  const parsed = parseSettings({ objectName: "CSpell config", text })
  if (parsed._tag === "Invalid") {
    return { _tag: "Invalid", message: parsed.message }
  }

  return completeMerge(
    ensureArrayItems({
      items: [VENDOR_GLOB],
      key: "ignorePaths",
      state: initialSettingsState(parsed.source, parsed.value)
    })
  )
}

const configPath = (context: ToolFileContext, cwd: string) =>
  firstExisting(context, cwd, CONFIG_CANDIDATES)

const isDetected = (context: ToolFileContext, cwd: string) =>
  Effect.gen(function* () {
    const config = yield* configPath(context, cwd)
    if (Option.isSome(config)) return true
    return yield* packageHasDependency(context, cwd, ["cspell", "cspell-cli", "@cspell/cspell"])
  })

const refreshWith = (context: ToolFileContext, cwd: string) =>
  Effect.gen(function* () {
    if (!(yield* isDetected(context, cwd))) return Option.none<string>()
    const existing = yield* configPath(context, cwd)
    const target = Option.getOrElse(existing, () => context.path.resolve(cwd, "cspell.json"))
    const current = (yield* context.fs.exists(target))
      ? yield* context.fs.readFileString(target)
      : "{}\n"
    const merged = mergeCspellConfigText(current)
    if (merged._tag !== "Updated") return Option.none<string>()
    yield* context.fs.writeFileString(
      target,
      merged.text.endsWith("\n") ? merged.text : `${merged.text}\n`
    )
    return Option.some(target)
  })

const doctorWith = (context: ToolFileContext, cwd: string) =>
  Effect.gen(function* () {
    const config = yield* configPath(context, cwd)
    const detected = Option.isSome(config) || (yield* isDetected(context, cwd))
    if (!detected) {
      return report({
        detected: false,
        ignored: false,
        message: "not detected",
        status: "absent",
        tool: TOOL
      })
    }

    const target = Option.getOrUndefined(config)
    if (target === undefined) {
      return report({
        configPath: context.path.resolve(cwd, "cspell.json"),
        detected: true,
        ignored: false,
        message: "detected in package.json but no cspell config found",
        status: "missing",
        tool: TOOL
      })
    }

    const content = yield* context.fs.readFileString(target)
    const ignored = hasVendorPattern(content)
    return report({
      configPath: target,
      detected: true,
      ignored,
      message: ignored ? "vendor ignored by ignorePaths" : "vendor not ignored",
      status: ignored ? "configured" : "missing",
      tool: TOOL
    })
  })

export class CspellIgnore extends Context.Service<CspellIgnore, ToolIgnoreIntegration>()(
  "ingraft/CspellIgnore"
) {}

export const CspellIgnoreLive = Layer.effect(
  CspellIgnore,
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
