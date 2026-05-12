import { FileSystem, Path } from "@effect/platform"
import {
  applyEdits,
  modify,
  parse,
  printParseErrorCode,
  type ParseError
} from "jsonc-parser"
import { Effect, Option } from "effect"
import { VENDOR_DIR } from "./constants.ts"
import { warn } from "./log.ts"

const VENDOR_GLOB = `${VENDOR_DIR}/**`
const ARRAY_KEYS = [
  "typescript.preferences.autoImportFileExcludePatterns",
  "javascript.preferences.autoImportFileExcludePatterns"
] as const
const OBJECT_KEYS = ["files.exclude", "files.watcherExclude", "search.exclude"] as const

type ArrayExclusionKey = (typeof ARRAY_KEYS)[number]
type ObjectExclusionKey = (typeof OBJECT_KEYS)[number]

interface UnchangedSettingsMerge {
  readonly _tag: "Unchanged"
}

interface UpdatedSettingsMerge {
  readonly _tag: "Updated"
  readonly text: string
}

interface InvalidSettingsMerge {
  readonly _tag: "Invalid"
  readonly message: string
}

export type SettingsMergeResult =
  | UnchangedSettingsMerge
  | UpdatedSettingsMerge
  | InvalidSettingsMerge

interface ValidParsedSettings {
  readonly _tag: "Valid"
  readonly value: Record<string, unknown>
  readonly source: string
}

interface InvalidParsedSettings {
  readonly _tag: "Invalid"
  readonly message: string
  readonly source: string
}

type ParsedSettings = ValidParsedSettings | InvalidParsedSettings

const formatOptions = { insertSpaces: true, tabSize: 2 }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const parseSettings = (text: string): ParsedSettings => {
  const errors: ParseError[] = []
  const source = text.trim() === "" ? "{}\n" : text
  const value = parse(source, errors, { allowTrailingComma: true })
  if (errors.length > 0) {
    const message = errors
      .map((error) => printParseErrorCode(error.error))
      .join(", ")
    return { _tag: "Invalid" as const, message, source }
  }
  if (!isRecord(value)) {
    return {
      _tag: "Invalid" as const,
      message: ".vscode/settings.json must contain a JSON object.",
      source
    }
  }
  return { _tag: "Valid" as const, value, source }
}

const applyJsoncChange = (
  source: string,
  path: ReadonlyArray<string>,
  value: unknown
) =>
  applyEdits(
    source,
    modify(source, [...path], value, {
      formattingOptions: formatOptions
    })
  )

interface SettingsMergeState {
  readonly changed: boolean
  readonly settings: Record<string, unknown>
  readonly text: string
}

const updateState = (
  state: SettingsMergeState,
  path: ReadonlyArray<string>,
  value: unknown,
  settings: Record<string, unknown>
): SettingsMergeState => ({
  changed: true,
  settings,
  text: applyJsoncChange(state.text, path, value)
})

const ensureArrayExclusion = (
  state: SettingsMergeState,
  key: ArrayExclusionKey
): SettingsMergeState => {
  const current = Array.isArray(state.settings[key]) ? state.settings[key] : []
  if (current.includes(VENDOR_GLOB)) return state

  const value = [...current, VENDOR_GLOB]
  return updateState(state, [key], value, {
    ...state.settings,
    [key]: value
  })
}

const ensureObjectExclusion = (
  state: SettingsMergeState,
  key: ObjectExclusionKey
): SettingsMergeState => {
  const current = isRecord(state.settings[key]) ? state.settings[key] : {}
  if (current[VENDOR_GLOB] === true) return state

  const value = { ...current, [VENDOR_GLOB]: true }
  return isRecord(state.settings[key])
    ? updateState(state, [key, VENDOR_GLOB], true, {
        ...state.settings,
        [key]: value
      })
    : updateState(state, [key], value, {
        ...state.settings,
        [key]: value
      })
}

const mergeValidSettings = (
  source: string,
  value: Record<string, unknown>
): SettingsMergeState =>
  OBJECT_KEYS.reduce(
    ensureObjectExclusion,
    ARRAY_KEYS.reduce(ensureArrayExclusion, {
      changed: false,
      settings: { ...value },
      text: source
    })
  )

export const mergeVscodeSettingsText = (text = "{}\n"): SettingsMergeResult => {
  const parsed = parseSettings(text)
  if (parsed._tag === "Invalid") {
    return { _tag: "Invalid", message: parsed.message }
  }

  const merged = mergeValidSettings(parsed.source, parsed.value)
  return merged.changed
    ? { _tag: "Updated", text: merged.text }
    : { _tag: "Unchanged" }
}

export const updateVscodeSettings = (cwd: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const target = path.resolve(cwd, ".vscode/settings.json")
    const current = (yield* fs.exists(target))
      ? yield* fs.readFileString(target)
      : "{}\n"

    const merged = mergeVscodeSettingsText(current)
    switch (merged._tag) {
      case "Invalid":
        yield* warn(
          `Could not parse .vscode/settings.json (${merged.message}); skipping update.`
        )
        return Option.none<string>()
      case "Unchanged":
        return Option.none<string>()
      case "Updated":
        yield* fs.makeDirectory(path.dirname(target), { recursive: true }).pipe(
          Effect.ignore
        )
        yield* fs.writeFileString(
          target,
          merged.text.endsWith("\n") ? merged.text : `${merged.text}\n`
        )
        return Option.some(target)
    }
  })
