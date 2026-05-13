import { Context, Effect, FileSystem, Layer, Option, Path } from "effect"

import {
  completeMerge,
  ensureArrayItem,
  initialSettingsState,
  parseSettings,
  SettingsMergeResult
} from "../../config/jsonc-settings.ts"
import {
  firstExisting,
  hasVendorPattern,
  packageHasDependency,
  report,
  VENDOR_GLOB,
  type ToolFileContext,
  type ToolIgnoreIntegration
} from "../common.ts"

const TOOL = "Stylelint"
const CONFIG_CANDIDATES = [".stylelintrc.json", "stylelint.config.json"] as const

export const mergeStylelintConfigText = (text = "{}\n"): SettingsMergeResult => {
  const parsed = parseSettings({ objectName: "Stylelint config", text })
  if (parsed._tag === "Invalid") {
    return SettingsMergeResult.Invalid({ message: parsed.message })
  }

  return completeMerge(
    ensureArrayItem({
      item: VENDOR_GLOB,
      key: "ignoreFiles",
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
    const merged = mergeStylelintConfigText(yield* context.fs.readFileString(target.value))
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
    const dependency = yield* packageHasDependency(context, cwd, ["stylelint"])
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
        message: "detected in package.json but no JSON config found",
        status: "unsupported",
        tool: TOOL
      })
    }

    const ignored = hasVendorPattern(yield* context.fs.readFileString(target.value))
    return report({
      configPath: target.value,
      detected: true,
      ignored,
      message: ignored ? "vendor ignored by ignoreFiles" : "vendor not ignored",
      status: ignored ? "configured" : "missing",
      tool: TOOL
    })
  })

export class StylelintIgnore extends Context.Service<StylelintIgnore, ToolIgnoreIntegration>()(
  "ingraft/StylelintIgnore"
) {}

export const StylelintIgnoreLive = Layer.effect(
  StylelintIgnore,
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
