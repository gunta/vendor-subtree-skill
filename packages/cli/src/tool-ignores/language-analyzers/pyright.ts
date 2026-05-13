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
  VENDOR_DIR,
  type ToolFileContext,
  type ToolIgnoreIntegration
} from "../common.ts"

const TOOL = "Pyright"
const CONFIG = "pyrightconfig.json"

export const mergePyrightConfigText = (text = "{}\n"): SettingsMergeResult => {
  const parsed = parseSettings({ objectName: CONFIG, text })
  if (parsed._tag === "Invalid") {
    return SettingsMergeResult.Invalid({ message: parsed.message })
  }

  return completeMerge(
    ensureArrayItem({
      item: VENDOR_DIR,
      key: "exclude",
      state: initialSettingsState(parsed.source, parsed.value)
    })
  )
}

const configPath = (context: ToolFileContext, cwd: string) => firstExisting(context, cwd, [CONFIG])

const refreshWith = (context: ToolFileContext, cwd: string) =>
  Effect.gen(function* () {
    const target = yield* configPath(context, cwd)
    if (Option.isNone(target)) return Option.none<string>()
    const merged = mergePyrightConfigText(yield* context.fs.readFileString(target.value))
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
    const dependency = yield* packageHasDependency(context, cwd, ["pyright"])
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
        message: "detected in package.json but no pyrightconfig.json found",
        status: "unsupported",
        tool: TOOL
      })
    }

    const ignored = hasVendorPattern(yield* context.fs.readFileString(target.value), [VENDOR_DIR])
    return report({
      configPath: target.value,
      detected: true,
      ignored,
      message: ignored ? "vendor ignored by exclude" : "vendor not ignored",
      status: ignored ? "configured" : "missing",
      tool: TOOL
    })
  })

export class PyrightIgnore extends Context.Service<PyrightIgnore, ToolIgnoreIntegration>()(
  "ingraft/PyrightIgnore"
) {}

export const PyrightIgnoreLive = Layer.effect(
  PyrightIgnore,
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
