import { Context, Effect, FileSystem, Layer, Option, Path } from "effect"

import {
  completeMerge,
  ensureArrayItems,
  initialSettingsState,
  parseSettings,
  SettingsMergeResult
} from "../../config/jsonc-settings.ts"
import {
  VENDOR_GLOB,
  VENDOR_IGNORE_DIR,
  firstExisting,
  hasVendorPattern,
  mergeManagedIgnoreSection,
  packageHasDependency,
  report,
  type ToolFileContext,
  type ToolIgnoreIntegration
} from "../common.ts"

const TOOL = "ESLint"
const BEGIN = "# ingraft: eslint-ignore begin"
const END = "# ingraft: eslint-ignore end"
const IGNORE_FILE = ".eslintignore"
const JSON_CONFIG_CANDIDATES = [".eslintrc.json", ".eslintrc"] as const
const SOURCE_CONFIG_CANDIDATES = [
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  "eslint.config.ts",
  "eslint.config.mts",
  "eslint.config.cts",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.yaml",
  ".eslintrc.yml"
] as const

export const mergeEslintIgnoreText = (content: string): string =>
  mergeManagedIgnoreSection({
    begin: BEGIN,
    content,
    end: END,
    lines: [VENDOR_IGNORE_DIR]
  })

export const mergeEslintConfigText = (text = "{}\n"): SettingsMergeResult => {
  const parsed = parseSettings({ objectName: "ESLint config", text })
  if (parsed._tag === "Invalid") {
    return SettingsMergeResult.Invalid({ message: parsed.message })
  }

  return completeMerge(
    ensureArrayItems({
      items: [VENDOR_GLOB],
      key: "ignorePatterns",
      state: initialSettingsState(parsed.source, parsed.value)
    })
  )
}

const jsonConfigPath = (context: ToolFileContext, cwd: string) =>
  firstExisting(context, cwd, JSON_CONFIG_CANDIDATES)

const sourceConfigPath = (context: ToolFileContext, cwd: string) =>
  firstExisting(context, cwd, SOURCE_CONFIG_CANDIDATES)

const ignorePath = (context: ToolFileContext, cwd: string) => context.path.resolve(cwd, IGNORE_FILE)

const isDetected = (context: ToolFileContext, cwd: string) =>
  Effect.gen(function* () {
    const [jsonConfig, sourceConfig, hasIgnore] = yield* Effect.all([
      jsonConfigPath(context, cwd),
      sourceConfigPath(context, cwd),
      context.fs.exists(ignorePath(context, cwd))
    ])
    if (Option.isSome(jsonConfig) || Option.isSome(sourceConfig) || hasIgnore) {
      return true
    }
    return yield* packageHasDependency(context, cwd, ["eslint", "@eslint/js", "typescript-eslint"])
  })

const refreshWith = (context: ToolFileContext, cwd: string) =>
  Effect.gen(function* () {
    const ignore = ignorePath(context, cwd)
    if (yield* context.fs.exists(ignore)) {
      const current = yield* context.fs.readFileString(ignore)
      const next = mergeEslintIgnoreText(current)
      if (next === current) return Option.none<string>()
      yield* context.fs.writeFileString(ignore, next)
      return Option.some(ignore)
    }

    const jsonConfig = yield* jsonConfigPath(context, cwd)
    if (Option.isSome(jsonConfig)) {
      const current = yield* context.fs.readFileString(jsonConfig.value)
      const merged = mergeEslintConfigText(current)
      if (merged._tag !== "Updated") return Option.none<string>()
      yield* context.fs.writeFileString(
        jsonConfig.value,
        merged.text.endsWith("\n") ? merged.text : `${merged.text}\n`
      )
      return Option.some(jsonConfig.value)
    }

    return Option.none<string>()
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

    const ignore = ignorePath(context, cwd)
    if (yield* context.fs.exists(ignore)) {
      const content = yield* context.fs.readFileString(ignore)
      const ignored = hasVendorPattern(content)
      return report({
        configPath: ignore,
        detected: true,
        ignored,
        message: ignored
          ? "vendor ignored by .eslintignore"
          : "vendor not ignored by .eslintignore",
        status: ignored ? "configured" : "missing",
        tool: TOOL
      })
    }

    const jsonConfig = yield* jsonConfigPath(context, cwd)
    if (Option.isSome(jsonConfig)) {
      const content = yield* context.fs.readFileString(jsonConfig.value)
      const ignored = hasVendorPattern(content)
      return report({
        configPath: jsonConfig.value,
        detected: true,
        ignored,
        message: ignored
          ? "vendor ignored by ignorePatterns"
          : "vendor not ignored by ignorePatterns",
        status: ignored ? "configured" : "missing",
        tool: TOOL
      })
    }

    const sourceConfig = yield* sourceConfigPath(context, cwd)
    return report({
      ...(Option.isSome(sourceConfig) ? { configPath: sourceConfig.value } : {}),
      detected: true,
      ignored: false,
      message: "detected; flat/source ESLint configs are reported but not auto-written",
      status: "unsupported",
      tool: TOOL
    })
  })

export class EslintIgnore extends Context.Service<EslintIgnore, ToolIgnoreIntegration>()(
  "ingraft/EslintIgnore"
) {}

export const EslintIgnoreLive = Layer.effect(
  EslintIgnore,
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
