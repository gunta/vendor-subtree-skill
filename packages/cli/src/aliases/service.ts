import { fileURLToPath } from "node:url"

import { Context, Effect, FileSystem, Layer, Result, Schema } from "effect"

import { RepositoryAliasDatabaseInvalid } from "../domain/errors.ts"

export interface RepositoryAliasEntry {
  readonly alias: string
  readonly description: string | undefined
  readonly targets: ReadonlyArray<string>
}

export interface RepositoryAliasResolvedTarget {
  readonly alias?: string
  readonly input: string
  readonly target: string
}

const AliasEntrySchema = Schema.Struct({
  alias: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  description: Schema.optionalKey(Schema.String.pipe(Schema.check(Schema.isMinLength(1)))),
  targets: Schema.Array(Schema.String.pipe(Schema.check(Schema.isMinLength(1))))
})

const AliasDatabaseSchema = Schema.Struct({
  aliases: Schema.Array(AliasEntrySchema)
})

const decodeAliasDatabase = Schema.decodeUnknownResult(AliasDatabaseSchema)

const bundledAliasDatabasePath = fileURLToPath(
  new URL("./repository-aliases.json", import.meta.url)
)

const normalizeAlias = (value: string): string => value.trim().toLowerCase()

const normalizedTargetKey = (value: string): string =>
  value
    .trim()
    .replace(/\/+$/, "")
    .replace(/\.git$/, "")
    .toLowerCase()

const invalidAliasDatabase = (reason: string) => new RepositoryAliasDatabaseInvalid({ reason })

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

          const targets = entry.targets.map((target) => target.trim()).filter(Boolean)
          if (targets.length === 0) {
            return yield* Effect.fail(
              invalidAliasDatabase(`Alias '${alias}' must map to at least one target.`)
            )
          }

          entries.push({
            alias,
            description: entry.description,
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
  const seenTargets = new Set<string>()
  const expanded: Array<RepositoryAliasResolvedTarget> = []

  for (const input of inputs) {
    const trimmed = input.trim()
    if (trimmed.length === 0) continue

    const alias = byAlias.get(normalizeAlias(trimmed))
    const targets = alias?.targets ?? [trimmed]

    for (const target of targets) {
      const key = normalizedTargetKey(target)
      if (seenTargets.has(key)) continue
      seenTargets.add(key)
      expanded.push(alias === undefined ? { input, target } : { alias: alias.alias, input, target })
    }
  }

  return expanded
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
    const entries = yield* loadBundledAliasEntries(fs)

    return {
      entries,
      expand: (inputs: ReadonlyArray<string>) =>
        Effect.succeed(expandAliasTargetsWith(entries, inputs))
    }
  })
)
