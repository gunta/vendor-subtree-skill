import { fileURLToPath } from "node:url"

import { Context, Effect, FileSystem, Layer, Result, Schema } from "effect"

import { IngraftConfig } from "../config/ingraft.ts"
import { RepositoryAliasDatabaseInvalid } from "../domain/errors.ts"
import { hostedRepoFromInput } from "../domain/repo.ts"
import { type VendorStrategy, VendorStrategySchema } from "../domain/vendor-strategy.ts"

export interface RepositoryAliasTarget {
  readonly strategy: VendorStrategy | undefined
  readonly target: string
}

export interface RepositoryAliasEntry {
  readonly alias: string
  readonly description: string | undefined
  readonly strategy: VendorStrategy | undefined
  readonly targets: ReadonlyArray<RepositoryAliasTarget>
}

export interface RepositoryAliasResolvedTarget {
  readonly alias?: string
  readonly input: string
  readonly strategy?: VendorStrategy
  readonly target: string
}

const AliasTargetSchema = Schema.Union([
  Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  Schema.Struct({
    target: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
    strategy: Schema.optionalKey(VendorStrategySchema)
  })
])

const AliasEntrySchema = Schema.Struct({
  alias: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  description: Schema.optionalKey(Schema.String.pipe(Schema.check(Schema.isMinLength(1)))),
  strategy: Schema.optionalKey(VendorStrategySchema),
  targets: Schema.Array(AliasTargetSchema)
})

const AliasDatabaseSchema = Schema.Struct({
  aliases: Schema.Array(AliasEntrySchema)
})

const decodeAliasDatabase = Schema.decodeUnknownResult(AliasDatabaseSchema)

const bundledAliasDatabasePath = fileURLToPath(
  new URL("./repository-aliases.json", import.meta.url)
)

const normalizeAlias = (value: string): string => value.trim().toLowerCase()

const normalizedTargetKey = (value: string): string => {
  const trimmed = value.trim()
  const hosted = hostedRepoFromInput(trimmed)
  if (hosted !== null) {
    return `${hosted.host}/${hosted.path}`.toLowerCase()
  }
  return trimmed
    .trim()
    .replace(/\/+$/, "")
    .replace(/\.git$/, "")
    .toLowerCase()
}

const invalidAliasDatabase = (reason: string) => new RepositoryAliasDatabaseInvalid({ reason })

const normalizeAliasTarget = (
  target: typeof AliasTargetSchema.Type,
  inheritedStrategy: VendorStrategy | undefined
): RepositoryAliasTarget => {
  if (typeof target === "string") {
    return {
      strategy: inheritedStrategy,
      target: target.trim()
    }
  }
  return {
    strategy: target.strategy ?? inheritedStrategy,
    target: target.target.trim()
  }
}

export const repositoryAliasEntriesFromDatabase = (database: unknown) =>
  Result.match(decodeAliasDatabase(database), {
    onFailure: (error) =>
      Effect.fail(invalidAliasDatabase(`Invalid alias database shape: ${error}`)),
    onSuccess: (raw) =>
      Effect.gen(function* () {
        const seen = new Set<string>()
        const entries: Array<RepositoryAliasEntry> = []

        for (const entry of raw.aliases) {
          const alias = normalizeAlias(entry.alias)
          if (seen.has(alias)) {
            return yield* Effect.fail(
              invalidAliasDatabase(`Duplicate repository alias '${alias}'.`)
            )
          }
          seen.add(alias)

          const targets = entry.targets
            .map((target) => normalizeAliasTarget(target, entry.strategy))
            .filter((target) => target.target.length > 0)
          if (targets.length === 0) {
            return yield* Effect.fail(
              invalidAliasDatabase(`Alias '${alias}' must map to at least one target.`)
            )
          }

          entries.push({
            alias,
            description: entry.description,
            strategy: entry.strategy,
            targets
          })
        }

        return entries
      })
  })

export const expandAliasTargetsWith = (
  entries: ReadonlyArray<RepositoryAliasEntry>,
  inputs: ReadonlyArray<string>
): ReadonlyArray<RepositoryAliasResolvedTarget> => {
  const byAlias = new Map(entries.map((entry) => [entry.alias, entry]))
  const strategyByTarget = new Map<string, VendorStrategy>()
  for (const entry of entries) {
    for (const target of entry.targets) {
      if (target.strategy !== undefined) {
        strategyByTarget.set(normalizedTargetKey(target.target), target.strategy)
      }
    }
  }
  const seenTargets = new Set<string>()
  const expanded: Array<RepositoryAliasResolvedTarget> = []

  for (const input of inputs) {
    const trimmed = input.trim()
    if (trimmed.length === 0) continue

    const alias = byAlias.get(normalizeAlias(trimmed))
    const targets = alias?.targets ?? [
      {
        strategy: strategyByTarget.get(normalizedTargetKey(trimmed)),
        target: trimmed
      }
    ]

    for (const target of targets) {
      const key = normalizedTargetKey(target.target)
      if (seenTargets.has(key)) continue
      seenTargets.add(key)
      const strategy = target.strategy ?? strategyByTarget.get(key)
      expanded.push({
        ...(alias === undefined ? {} : { alias: alias.alias }),
        input,
        ...(strategy === undefined ? {} : { strategy }),
        target: target.target
      })
    }
  }

  return expanded
}

export const mergeAliasEntries = (
  bundledEntries: ReadonlyArray<RepositoryAliasEntry>,
  configuredEntries: ReadonlyArray<RepositoryAliasEntry>
): ReadonlyArray<RepositoryAliasEntry> => {
  const aliases = new Map<string, RepositoryAliasEntry>()
  const order: Array<string> = []

  for (const entry of bundledEntries) {
    aliases.set(entry.alias, entry)
    order.push(entry.alias)
  }

  for (const entry of configuredEntries) {
    if (!aliases.has(entry.alias)) {
      order.push(entry.alias)
    }
    aliases.set(entry.alias, entry)
  }

  return order.flatMap((alias) => {
    const entry = aliases.get(alias)
    return entry === undefined ? [] : [entry]
  })
}

const parseJson = (text: string) =>
  Effect.try({
    try: () => JSON.parse(text) as unknown,
    catch: (cause) =>
      invalidAliasDatabase(
        cause instanceof Error ? cause.message : `Could not parse JSON: ${cause}`
      )
  })

const loadBundledAliasEntries = (fs: FileSystem.FileSystem) =>
  fs.readFileString(bundledAliasDatabasePath).pipe(
    Effect.mapError((cause) =>
      invalidAliasDatabase(
        `Could not read bundled alias database at ${bundledAliasDatabasePath}: ${cause}`
      )
    ),
    Effect.flatMap(parseJson),
    Effect.flatMap(repositoryAliasEntriesFromDatabase)
  )

export interface RepositoryAliasesShape {
  readonly entries: ReadonlyArray<RepositoryAliasEntry>
  readonly expand: (
    inputs: ReadonlyArray<string>
  ) => Effect.Effect<ReadonlyArray<RepositoryAliasResolvedTarget>, never>
}

export class RepositoryAliases extends Context.Service<RepositoryAliases, RepositoryAliasesShape>()(
  "ingraft/RepositoryAliases"
) {}

export const RepositoryAliasesLive = Layer.effect(
  RepositoryAliases,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const config = yield* IngraftConfig
    const bundledEntries = yield* loadBundledAliasEntries(fs)
    const configuredEntries = yield* repositoryAliasEntriesFromDatabase({
      aliases: config.aliases
    })
    const entries = mergeAliasEntries(bundledEntries, configuredEntries)

    return {
      entries,
      expand: (inputs: ReadonlyArray<string>) =>
        Effect.succeed(expandAliasTargetsWith(entries, inputs))
    }
  })
)
