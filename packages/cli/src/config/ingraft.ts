import { Context, Effect, FileSystem, Layer, Option, Path, Schema } from "effect"

import { RuntimeConfig } from "../app/runtime.ts"
import { IngraftConfigFileFailed, SchemaDecodeFailed, TomlParseFailed } from "../domain/errors.ts"
import { VendorStrategySchema, type VendorStrategy } from "../domain/vendor-strategy.ts"
import { parseTomlText } from "./toml.ts"

export const INGRAFT_CONFIG_RELATIVE_PATH = ".ingraft/config.toml"

const NonEmptyString = Schema.String.pipe(Schema.check(Schema.isMinLength(1)))

const AliasTargetSchema = Schema.Union([
  NonEmptyString,
  Schema.Struct({
    target: NonEmptyString,
    strategy: Schema.optionalKey(VendorStrategySchema)
  })
])

const AliasEntrySchema = Schema.Struct({
  alias: NonEmptyString,
  description: Schema.optionalKey(NonEmptyString),
  strategy: Schema.optionalKey(VendorStrategySchema),
  targets: Schema.Array(AliasTargetSchema)
})

const DefaultsSchema = Schema.Struct({
  strategy: Schema.optionalKey(VendorStrategySchema),
  ref: Schema.optionalKey(NonEmptyString),
  tag: Schema.optionalKey(NonEmptyString),
  release: Schema.optionalKey(NonEmptyString),
  "sync-package": Schema.optionalKey(NonEmptyString),
  "cloudflare-artifact": Schema.optionalKey(Schema.Boolean),
  "cloudflare-artifact-depth": Schema.optionalKey(NonEmptyString),
  "cloudflare-artifact-name": Schema.optionalKey(NonEmptyString),
  exclude: Schema.optionalKey(Schema.Array(NonEmptyString)),
  "exclude-dirs": Schema.optionalKey(Schema.Array(NonEmptyString)),
  "exclude-extensions": Schema.optionalKey(Schema.Array(NonEmptyString)),
  "max-file-size": Schema.optionalKey(NonEmptyString)
})

const IngraftConfigSchema = Schema.Struct({
  defaults: Schema.optionalKey(DefaultsSchema),
  aliases: Schema.optionalKey(Schema.Array(AliasEntrySchema))
})

type RawIngraftConfig = typeof IngraftConfigSchema.Type
type RawDefaults = typeof DefaultsSchema.Type

export type IngraftAliasTarget = typeof AliasTargetSchema.Type
export type IngraftAliasEntry = typeof AliasEntrySchema.Type

export interface IngraftAddDefaults {
  readonly cloudflareArtifact: boolean | undefined
  readonly cloudflareArtifactDepth: string | undefined
  readonly cloudflareArtifactName: string | undefined
  readonly exclude: ReadonlyArray<string>
  readonly excludeDirs: ReadonlyArray<string>
  readonly excludeExtensions: ReadonlyArray<string>
  readonly maxFileSize: string | undefined
  readonly ref: string | undefined
  readonly release: string | undefined
  readonly strategy: VendorStrategy | undefined
  readonly syncPackage: string | undefined
  readonly tag: string | undefined
}

export interface IngraftConfigShape {
  readonly aliases: ReadonlyArray<IngraftAliasEntry>
  readonly defaults: IngraftAddDefaults
  readonly path: Option.Option<string>
}

export interface ConfigurableAddParams {
  readonly cloudflareArtifact: boolean
  readonly cloudflareArtifactDepth: Option.Option<string>
  readonly cloudflareArtifactName: Option.Option<string>
  readonly exclude: ReadonlyArray<string>
  readonly excludeDirs: ReadonlyArray<string>
  readonly excludeExtensions: ReadonlyArray<string>
  readonly maxFileSize: Option.Option<string>
  readonly ref: Option.Option<string>
  readonly release: Option.Option<string>
  readonly strategy: Option.Option<VendorStrategy>
  readonly syncPackage: Option.Option<string>
  readonly tag: Option.Option<string>
}

export const emptyAddDefaults = (): IngraftAddDefaults => ({
  cloudflareArtifact: undefined,
  cloudflareArtifactDepth: undefined,
  cloudflareArtifactName: undefined,
  exclude: [],
  excludeDirs: [],
  excludeExtensions: [],
  maxFileSize: undefined,
  ref: undefined,
  release: undefined,
  strategy: undefined,
  syncPackage: undefined,
  tag: undefined
})

export const emptyIngraftConfig = (
  path: Option.Option<string> = Option.none()
): IngraftConfigShape => ({
  aliases: [],
  defaults: emptyAddDefaults(),
  path
})

const optionOrDefault = <A>(value: Option.Option<A>, fallback: A | undefined): Option.Option<A> =>
  Option.isSome(value) || fallback === undefined ? value : Option.some(fallback)

const mergeStringArrays = (
  defaults: ReadonlyArray<string>,
  values: ReadonlyArray<string>
): ReadonlyArray<string> => {
  const merged: Array<string> = []
  const seen = new Set<string>()
  for (const value of [...defaults, ...values]) {
    if (seen.has(value)) continue
    seen.add(value)
    merged.push(value)
  }
  return merged
}

const hasVersionSelector = (params: ConfigurableAddParams): boolean =>
  Option.isSome(params.ref) ||
  Option.isSome(params.tag) ||
  Option.isSome(params.release) ||
  Option.isSome(params.syncPackage)

export const applyAddDefaults = <Params extends ConfigurableAddParams>(
  params: Params,
  defaults: IngraftAddDefaults
): Params => {
  const versionSelectorProvided = hasVersionSelector(params)

  return {
    ...params,
    cloudflareArtifact: params.cloudflareArtifact || defaults.cloudflareArtifact === true,
    cloudflareArtifactDepth: optionOrDefault(
      params.cloudflareArtifactDepth,
      defaults.cloudflareArtifactDepth
    ),
    cloudflareArtifactName: optionOrDefault(
      params.cloudflareArtifactName,
      defaults.cloudflareArtifactName
    ),
    exclude: mergeStringArrays(defaults.exclude, params.exclude),
    excludeDirs: mergeStringArrays(defaults.excludeDirs, params.excludeDirs),
    excludeExtensions: mergeStringArrays(defaults.excludeExtensions, params.excludeExtensions),
    maxFileSize: optionOrDefault(params.maxFileSize, defaults.maxFileSize),
    ref: versionSelectorProvided ? params.ref : optionOrDefault(params.ref, defaults.ref),
    release: versionSelectorProvided
      ? params.release
      : optionOrDefault(params.release, defaults.release),
    strategy: optionOrDefault(params.strategy, defaults.strategy),
    syncPackage: versionSelectorProvided
      ? params.syncPackage
      : optionOrDefault(params.syncPackage, defaults.syncPackage),
    tag: versionSelectorProvided ? params.tag : optionOrDefault(params.tag, defaults.tag)
  } as Params
}

const defaultsFromRaw = (defaults: RawDefaults | undefined): IngraftAddDefaults => ({
  cloudflareArtifact: defaults?.["cloudflare-artifact"],
  cloudflareArtifactDepth: defaults?.["cloudflare-artifact-depth"],
  cloudflareArtifactName: defaults?.["cloudflare-artifact-name"],
  exclude: defaults?.exclude ?? [],
  excludeDirs: defaults?.["exclude-dirs"] ?? [],
  excludeExtensions: defaults?.["exclude-extensions"] ?? [],
  maxFileSize: defaults?.["max-file-size"],
  ref: defaults?.ref,
  release: defaults?.release,
  strategy: defaults?.strategy,
  syncPackage: defaults?.["sync-package"],
  tag: defaults?.tag
})

const configFromRaw = (raw: RawIngraftConfig, path: Option.Option<string>): IngraftConfigShape => ({
  aliases: raw.aliases ?? [],
  defaults: defaultsFromRaw(raw.defaults),
  path
})

export const parseIngraftConfigText = (
  text: string,
  source: string = INGRAFT_CONFIG_RELATIVE_PATH
): Effect.Effect<IngraftConfigShape, SchemaDecodeFailed | TomlParseFailed> =>
  parseTomlText(text).pipe(
    Effect.mapError((error) => new TomlParseFailed({ cause: error.cause, source })),
    Effect.flatMap((value) =>
      Schema.decodeUnknownEffect(IngraftConfigSchema)(value).pipe(
        Effect.mapError((error) => new SchemaDecodeFailed({ issue: error.issue, source }))
      )
    ),
    Effect.map((raw) => configFromRaw(raw, Option.some(source)))
  )

export const findIngraftConfigPath = (
  cwd: string
): Effect.Effect<Option.Option<string>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    let current = path.resolve(cwd)

    while (true) {
      const candidate = path.join(current, INGRAFT_CONFIG_RELATIVE_PATH)
      const exists = yield* fs.exists(candidate).pipe(Effect.catch(() => Effect.succeed(false)))
      if (exists) return Option.some(candidate)

      const parent = path.dirname(current)
      if (parent === current) return Option.none()
      current = parent
    }
  })

export const loadIngraftConfig = (
  cwd: string
): Effect.Effect<
  IngraftConfigShape,
  IngraftConfigFileFailed | SchemaDecodeFailed | TomlParseFailed,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const configPath = yield* findIngraftConfigPath(cwd)

    return yield* Option.match(configPath, {
      onNone: () => Effect.succeed(emptyIngraftConfig()),
      onSome: (path) =>
        fs.readFileString(path).pipe(
          Effect.mapError((cause) => new IngraftConfigFileFailed({ cause, path })),
          Effect.flatMap((text) => parseIngraftConfigText(text, path))
        )
    })
  })

export class IngraftConfig extends Context.Service<IngraftConfig, IngraftConfigShape>()(
  "ingraft/IngraftConfig"
) {}

export const IngraftConfigLive = Layer.effect(
  IngraftConfig,
  Effect.gen(function* () {
    const runtime = yield* RuntimeConfig
    return yield* loadIngraftConfig(runtime.cwd)
  })
)
