import { Context, Effect, FileSystem, Layer, Option, Path } from "effect"

import {
  completeMerge,
  ensureArrayItemsAtPath,
  initialSettingsState,
  parseSettings,
  SettingsMergeResult
} from "../../config/jsonc-settings.ts"
import {
  firstExisting,
  hasVendorPattern,
  packageHasDependency,
  report,
  VENDOR_NEGATED_GLOB,
  type ToolFileContext,
  type ToolIgnoreIntegration
} from "../common.ts"

const TOOL = "Biome"
const CONFIG_CANDIDATES = ["biome.jsonc", "biome.json"] as const

export const mergeBiomeConfigText = (text = "{}\n"): SettingsMergeResult => {
  const parsed = parseSettings({ objectName: "Biome config", text })
  if (parsed._tag === "Invalid") {
    return SettingsMergeResult.Invalid({ message: parsed.message })
  }

  const existingIncludes = parsed.value.files
  const fallback =
    typeof existingIncludes === "object" &&
    existingIncludes !== null &&
    Array.isArray((existingIncludes as Record<string, unknown>).includes)
      ? []
      : ["**"]

  return completeMerge(
    ensureArrayItemsAtPath({
      fallback,
      items: [VENDOR_NEGATED_GLOB],
      path: ["files", "includes"],
      state: initialSettingsState(parsed.source, parsed.value)
    })
  )
}

const configPath = (context: ToolFileContext, cwd: string) =>
  firstExisting(context, cwd, CONFIG_CANDIDATES)

const refreshWith = (context: ToolFileContext, cwd: string) =>
  Effect.gen(function* () {
    const target = yield* configPath(context, cwd)
    if (Option.isNone(target)) return Option.none<string>()
    const current = yield* context.fs.readFileString(target.value)
    const merged = mergeBiomeConfigText(current)
    if (merged._tag !== "Updated") return Option.none<string>()
    yield* context.fs.writeFileString(
      target.value,
      merged.text.endsWith("\n") ? merged.text : `${merged.text}\n`
    )
    return Option.some(target.value)
  })

const doctorWith = (context: ToolFileContext, cwd: string) =>
  Effect.gen(function* () {
    const target = yield* configPath(context, cwd)
    const dependency = yield* packageHasDependency(context, cwd, ["@biomejs/biome", "biome"])
    if (Option.isNone(target) && !dependency) {
      return report({
        detected: false,
        ignored: false,
        message: "not detected",
        status: "absent",
        tool: TOOL
      })
    }
    if (Option.isNone(target)) {
      return report({
        detected: true,
        ignored: false,
        message: "detected in package.json but no biome.json/biome.jsonc found",
        status: "unsupported",
        tool: TOOL
      })
    }

    const content = yield* context.fs.readFileString(target.value)
    const ignored = hasVendorPattern(content, [VENDOR_NEGATED_GLOB])
    return report({
      configPath: target.value,
      detected: true,
      ignored,
      message: ignored ? "vendor ignored by files.includes" : "vendor not ignored",
      status: ignored ? "configured" : "missing",
      tool: TOOL
    })
  })

export class BiomeIgnore extends Context.Service<BiomeIgnore, ToolIgnoreIntegration>()(
  "ingraft/BiomeIgnore"
) {}

export const BiomeIgnoreLive = Layer.effect(
  BiomeIgnore,
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
