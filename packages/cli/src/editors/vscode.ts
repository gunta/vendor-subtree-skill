import { Context, Effect, FileSystem, Layer, Option, Path } from "effect"

import { warn } from "../app/log.tsx"
import { RuntimeConfig, type RuntimeConfigShape } from "../app/runtime.ts"
import {
  completeMerge,
  ensureArrayItem,
  ensureObjectProperty,
  initialSettingsState,
  parseSettings,
  type SettingsMergeResult,
  type SettingsMergeState
} from "../config/jsonc-settings.ts"
import { VENDOR_DIR } from "../domain/constants.ts"
import { detectProjectLanguages, type ProjectLanguageUsage } from "../project/languages.ts"
import { GitMetadata, type GitMetadataShape } from "../services/git-metadata.ts"

const VENDOR_GLOB = `${VENDOR_DIR}/**`
const MATERIAL_ICON_FOLDER_ASSOCIATIONS = "material-icon-theme.folders.associations"
const MATERIAL_ICON_VENDOR_FOLDER = "packages"
const OBJECT_EXCLUSION_KEYS = ["files.exclude", "files.watcherExclude", "search.exclude"] as const
const ARRAY_KEYS_BY_LANGUAGE = {
  typescript: "typescript.preferences.autoImportFileExcludePatterns",
  javascript: "javascript.preferences.autoImportFileExcludePatterns"
} as const
const ARRAY_KEYS = Object.values(ARRAY_KEYS_BY_LANGUAGE)

type ArrayExclusionKey = (typeof ARRAY_KEYS)[number]
type ObjectExclusionKey = (typeof OBJECT_EXCLUSION_KEYS)[number]
type VscodeProjectLanguage = keyof typeof ARRAY_KEYS_BY_LANGUAGE

export interface VscodeLanguageUsage {
  readonly javascript: boolean
  readonly typescript: boolean
}

export interface MergeVscodeSettingsOptions {
  readonly languages?: VscodeLanguageUsage
}

interface UpdateVscodeSettingsWithParams {
  readonly cwd: string
  readonly fs: FileSystem.FileSystem
  readonly listProjectFiles: (cwd: string) => Effect.Effect<ReadonlyArray<string>, unknown>
  readonly path: Path.Path
  readonly runtime: RuntimeConfigShape
}

interface DetectVscodeLanguageUsageParams {
  readonly cwd: string
  readonly fs: FileSystem.FileSystem
  readonly listProjectFiles: (cwd: string) => Effect.Effect<ReadonlyArray<string>, unknown>
  readonly path: Path.Path
}

const DEFAULT_LANGUAGE_USAGE = {
  javascript: true,
  typescript: true
} as const satisfies VscodeLanguageUsage

const warnWithRuntime = (_runtime: RuntimeConfigShape, message: string) => warn(message)

const selectedArrayKeys = (languages: VscodeLanguageUsage): ReadonlyArray<ArrayExclusionKey> =>
  (Object.keys(ARRAY_KEYS_BY_LANGUAGE) as ReadonlyArray<VscodeProjectLanguage>)
    .filter((language) => languages[language])
    .map((language) => ARRAY_KEYS_BY_LANGUAGE[language])

const ensureArrayExclusion = (
  state: SettingsMergeState,
  key: ArrayExclusionKey
): SettingsMergeState => ensureArrayItem({ item: VENDOR_GLOB, key, state })

const ensureVendorFolderIcon = (state: SettingsMergeState): SettingsMergeState =>
  ensureObjectProperty({
    key: MATERIAL_ICON_FOLDER_ASSOCIATIONS,
    overwrite: false,
    property: VENDOR_DIR,
    state,
    value: MATERIAL_ICON_VENDOR_FOLDER
  })

const ensureObjectExclusion = (
  state: SettingsMergeState,
  key: ObjectExclusionKey
): SettingsMergeState =>
  ensureObjectProperty({
    key,
    property: VENDOR_GLOB,
    state,
    value: true
  })

const mergeValidSettings = (
  source: string,
  value: Record<string, unknown>,
  languages: VscodeLanguageUsage
): SettingsMergeState =>
  ensureVendorFolderIcon(
    selectedArrayKeys(languages).reduce(
      ensureArrayExclusion,
      OBJECT_EXCLUSION_KEYS.reduce(ensureObjectExclusion, initialSettingsState(source, value))
    )
  )

export const mergeVscodeSettingsText = (
  text = "{}\n",
  options: MergeVscodeSettingsOptions = {}
): SettingsMergeResult => {
  const parsed = parseSettings({
    objectName: ".vscode/settings.json",
    text
  })
  if (parsed._tag === "Invalid") {
    return { _tag: "Invalid", message: parsed.message }
  }

  return completeMerge(
    mergeValidSettings(parsed.source, parsed.value, options.languages ?? DEFAULT_LANGUAGE_USAGE)
  )
}

const detectVscodeLanguageUsage = ({
  cwd,
  fs,
  listProjectFiles,
  path
}: DetectVscodeLanguageUsageParams) =>
  detectProjectLanguages({ cwd, fs, listProjectFiles, path }).pipe(
    Effect.map(
      (languages: ProjectLanguageUsage) =>
        ({
          javascript: languages.javascript,
          typescript: languages.typescript
        }) satisfies VscodeLanguageUsage
    )
  )

const gitProjectFiles =
  (gitMetadata: GitMetadataShape) =>
  (cwd: string): Effect.Effect<ReadonlyArray<string>, unknown> =>
    gitMetadata.listProjectFiles(cwd)

const updateVscodeSettingsWith = ({
  cwd,
  fs,
  listProjectFiles,
  path,
  runtime
}: UpdateVscodeSettingsWithParams) =>
  Effect.gen(function* () {
    const target = path.resolve(cwd, ".vscode/settings.json")
    const current = (yield* fs.exists(target)) ? yield* fs.readFileString(target) : "{}\n"

    const languages = yield* detectVscodeLanguageUsage({
      cwd,
      fs,
      listProjectFiles,
      path
    })
    const merged = mergeVscodeSettingsText(current, { languages })
    switch (merged._tag) {
      case "Invalid":
        yield* warnWithRuntime(
          runtime,
          `Could not parse .vscode/settings.json (${merged.message}); skipping update.`
        )
        return Option.none<string>()
      case "Unchanged":
        return Option.none<string>()
      case "Updated":
        yield* fs.makeDirectory(path.dirname(target), { recursive: true }).pipe(Effect.ignore)
        yield* fs.writeFileString(
          target,
          merged.text.endsWith("\n") ? merged.text : `${merged.text}\n`
        )
        return Option.some(target)
    }
  })

export interface VscodeSettingsShape {
  readonly refresh: (cwd: string) => Effect.Effect<Option.Option<string>, unknown>
}

export class VscodeSettings extends Context.Service<VscodeSettings, VscodeSettingsShape>()(
  "ingraft/VscodeSettings"
) {}

export const VscodeSettingsLive = Layer.effect(
  VscodeSettings,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const gitMetadata = yield* GitMetadata
    const path = yield* Path.Path
    const runtime = yield* RuntimeConfig
    return {
      refresh: (cwd: string) =>
        updateVscodeSettingsWith({
          cwd,
          fs,
          listProjectFiles: gitProjectFiles(gitMetadata),
          path,
          runtime
        })
    }
  })
)
