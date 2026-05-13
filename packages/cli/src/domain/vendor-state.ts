import { Effect, FileSystem, Option, Path, Result, Schema } from "effect"

import { GitMetadata, type GitMetadataCommit } from "../services/git-metadata.ts"
import { git } from "../services/git.ts"
import {
  TRAILER_ACTION,
  TRAILER_DIR,
  TRAILER_FILTER,
  TRAILER_REF,
  TRAILER_RESOLVED_REF,
  TRAILER_STRATEGY,
  TRAILER_SYNC_PACKAGE,
  TRAILER_URL
} from "./constants.ts"
import {
  EMPTY_VENDOR_FILTER,
  parseVendorFilterTrailer,
  VendorFilterSchema,
  type VendorFilter
} from "./vendor-filter.ts"
import {
  DEFAULT_VENDOR_STRATEGY,
  VendorActionSchema,
  VendorStrategySchema
} from "./vendor-strategy.ts"

export const VendoredRepoSchema = Schema.Struct({
  name: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  prefix: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  url: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  ref: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  resolvedRef: Schema.optionalKey(Schema.String.pipe(Schema.check(Schema.isMinLength(1)))),
  strategy: VendorStrategySchema,
  filter: VendorFilterSchema,
  syncPackage: Schema.optionalKey(Schema.String.pipe(Schema.check(Schema.isMinLength(1)))),
  sha: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  date: Schema.String.pipe(Schema.check(Schema.isMinLength(1)))
})

export type VendoredRepo = typeof VendoredRepoSchema.Type

const VendoredLogRecordSchema = Schema.Struct({
  ...VendoredRepoSchema.fields,
  action: VendorActionSchema
})

interface ActiveVendoredLogRecord {
  readonly _tag: "Active"
  readonly repo: VendoredRepo
}

interface RemovedVendoredLogRecord {
  readonly _tag: "Removed"
  readonly prefix: string
}

type StoredVendoredLogRecord = ActiveVendoredLogRecord | RemovedVendoredLogRecord

type VendoredLogRecord = typeof VendoredLogRecordSchema.Type

const decodeVendoredRecord = Schema.decodeUnknownResult(VendoredLogRecordSchema)

export interface VendoredLogDiagnostic {
  readonly record: string
  readonly reason: string
}

export interface VendoredLogParseResult {
  readonly repos: ReadonlyArray<VendoredRepo>
  readonly diagnostics: ReadonlyArray<VendoredLogDiagnostic>
}

export interface FindVendoredRepoParams {
  readonly cwd: string
  readonly name: string
}

interface VendoredLogRecordFields {
  readonly action: string
  readonly date: string
  readonly filter: VendorFilter
  readonly name: string
  readonly prefix: string
  readonly ref: string
  readonly resolvedRef?: string
  readonly sha: string
  readonly strategy: string
  readonly syncPackage?: string
  readonly url: string
}

interface RawVendoredLogRecordFields {
  readonly action: string
  readonly date: string
  readonly name: string
  readonly prefix: string
  readonly rawFilter: string
  readonly rawResolvedRef: string
  readonly rawSyncPackage: string
  readonly ref: string
  readonly sha: string
  readonly strategy: string
  readonly url: string
}

interface RawVendoredRecordFields {
  readonly action: string
  readonly date: string
  readonly name: string
  readonly prefix: string
  readonly rawFilter: string
  readonly rawResolvedRef: string
  readonly rawSyncPackage: string
  readonly ref: string
  readonly sha: string
  readonly strategy: string
  readonly url: string
}

export const gitLogFormat = [
  "%H",
  "%cI",
  `%(trailers:key=${TRAILER_DIR},valueonly)`,
  `%(trailers:key=${TRAILER_URL},valueonly)`,
  `%(trailers:key=${TRAILER_REF},valueonly)`,
  `%(trailers:key=${TRAILER_STRATEGY},valueonly)`,
  `%(trailers:key=${TRAILER_ACTION},valueonly)`,
  `%(trailers:key=${TRAILER_FILTER},valueonly)`,
  `%(trailers:key=${TRAILER_SYNC_PACKAGE},valueonly)`,
  `%(trailers:key=${TRAILER_RESOLVED_REF},valueonly)`
].join("%x00")

interface VendoredLogAccumulator {
  readonly byPrefix: ReadonlyMap<string, StoredVendoredLogRecord>
  readonly diagnostics: ReadonlyArray<VendoredLogDiagnostic>
}

const nonEmptyRecords = (stdout: string): ReadonlyArray<string> =>
  stdout
    .split("\x1e")
    .map((record) => record.trim())
    .filter((record) => record.length > 0)

const recordPart = (parts: ReadonlyArray<string>, index: number): string =>
  parts[index]?.trim() ?? ""

const rawRepoFromRecord = (record: string): RawVendoredLogRecordFields => {
  const parts = record.split("\x00")
  const sha = recordPart(parts, 0)
  const date = recordPart(parts, 1)
  const prefix = recordPart(parts, 2)
  const url = recordPart(parts, 3)
  const ref = recordPart(parts, 4)
  const rawStrategy = recordPart(parts, 5)
  const rawAction = recordPart(parts, 6)
  const rawFilter = recordPart(parts, 7)
  const rawSyncPackage = recordPart(parts, 8)
  const rawResolvedRef = recordPart(parts, 9)
  const name = prefix.replace(/\/+$/, "").split("/").pop() ?? ""
  const strategy = rawStrategy === "" ? DEFAULT_VENDOR_STRATEGY : rawStrategy
  const action = rawAction === "" ? "upsert" : rawAction
  return {
    action,
    date,
    name,
    prefix,
    rawFilter,
    rawResolvedRef,
    rawSyncPackage,
    ref,
    sha,
    strategy,
    url
  }
}

const filterFromRecord = (
  record: string,
  fields: RawVendoredLogRecordFields
): Result.Result<VendorFilter, VendoredLogDiagnostic> => {
  if (fields.rawFilter === "") return Result.succeed(EMPTY_VENDOR_FILTER)
  try {
    return Result.succeed(parseVendorFilterTrailer(fields.rawFilter))
  } catch (error) {
    return Result.fail({
      record,
      reason: `Invalid vendored repo filter for prefix '${fields.prefix}': ${String(error)}`
    })
  }
}

const repoFromRecord = (
  record: string
): Result.Result<VendoredLogRecordFields, VendoredLogDiagnostic> => {
  const fields = rawRepoFromRecord(record)
  return Result.map(filterFromRecord(record, fields), (filter) => ({
    action: fields.action,
    date: fields.date,
    filter,
    name: fields.name,
    prefix: fields.prefix,
    ref: fields.ref,
    ...(fields.rawResolvedRef === "" ? {} : { resolvedRef: fields.rawResolvedRef }),
    sha: fields.sha,
    strategy: fields.strategy,
    ...(fields.rawSyncPackage === "" ? {} : { syncPackage: fields.rawSyncPackage }),
    url: fields.url
  }))
}

const knownTrailerKeys = new Set([
  TRAILER_ACTION,
  TRAILER_DIR,
  TRAILER_FILTER,
  TRAILER_REF,
  TRAILER_RESOLVED_REF,
  TRAILER_STRATEGY,
  TRAILER_SYNC_PACKAGE,
  TRAILER_URL
])

const commitDate = (timestamp: number): string => new Date(timestamp * 1000).toISOString()

const trailersFromMessage = (message: string): ReadonlyMap<string, string> => {
  const trailers = new Map<string, string>()
  for (const line of message.split(/\r?\n/)) {
    const match = /^([A-Za-z0-9-]+):\s*(.*)$/.exec(line)
    if (!match) continue
    const [, key, value] = match
    if (key !== undefined && value !== undefined && knownTrailerKeys.has(key)) {
      trailers.set(key, value.trim())
    }
  }
  return trailers
}

const rawRepoFromCommit = ({
  message,
  oid,
  timestamp
}: GitMetadataCommit): RawVendoredRecordFields => {
  const trailers = trailersFromMessage(message)
  const prefix = trailers.get(TRAILER_DIR) ?? ""
  const rawStrategy = trailers.get(TRAILER_STRATEGY) ?? ""
  const rawAction = trailers.get(TRAILER_ACTION) ?? ""
  return {
    action: rawAction === "" ? "upsert" : rawAction,
    date: commitDate(timestamp),
    name: prefix.replace(/\/+$/, "").split("/").pop() ?? "",
    prefix,
    rawFilter: trailers.get(TRAILER_FILTER) ?? "",
    rawResolvedRef: trailers.get(TRAILER_RESOLVED_REF) ?? "",
    rawSyncPackage: trailers.get(TRAILER_SYNC_PACKAGE) ?? "",
    ref: trailers.get(TRAILER_REF) ?? "",
    sha: oid,
    strategy: rawStrategy === "" ? DEFAULT_VENDOR_STRATEGY : rawStrategy,
    url: trailers.get(TRAILER_URL) ?? ""
  }
}

const filterFromFields = (
  record: string,
  fields: RawVendoredRecordFields
): Result.Result<VendorFilter, VendoredLogDiagnostic> => {
  if (fields.rawFilter === "") return Result.succeed(EMPTY_VENDOR_FILTER)
  try {
    return Result.succeed(parseVendorFilterTrailer(fields.rawFilter))
  } catch (error) {
    return Result.fail({
      record,
      reason: `Invalid vendored repo filter for prefix '${fields.prefix}': ${String(error)}`
    })
  }
}

const repoFieldsFromRaw = (
  record: string,
  fields: RawVendoredRecordFields
): Result.Result<VendoredLogRecordFields, VendoredLogDiagnostic> =>
  Result.map(filterFromFields(record, fields), (filter) => ({
    action: fields.action,
    date: fields.date,
    filter,
    name: fields.name,
    prefix: fields.prefix,
    ref: fields.ref,
    ...(fields.rawResolvedRef === "" ? {} : { resolvedRef: fields.rawResolvedRef }),
    sha: fields.sha,
    strategy: fields.strategy,
    ...(fields.rawSyncPackage === "" ? {} : { syncPackage: fields.rawSyncPackage }),
    url: fields.url
  }))

const diagnosticFromRecord = (record: string, error: unknown): VendoredLogDiagnostic => {
  const { prefix } = rawRepoFromRecord(record)
  return {
    record,
    reason: `Invalid vendored repo record for prefix '${prefix ?? ""}': ${String(error)}`
  }
}

const rememberRepo = (
  byPrefix: ReadonlyMap<string, StoredVendoredLogRecord>,
  record: VendoredLogRecord
): ReadonlyMap<string, StoredVendoredLogRecord> => {
  if (byPrefix.has(record.prefix)) return byPrefix

  const stored: StoredVendoredLogRecord =
    record.action === "remove"
      ? { _tag: "Removed", prefix: record.prefix }
      : {
          _tag: "Active",
          repo: {
            date: record.date,
            name: record.name,
            prefix: record.prefix,
            ref: record.ref,
            ...(record.resolvedRef === undefined ? {} : { resolvedRef: record.resolvedRef }),
            filter: record.filter,
            sha: record.sha,
            strategy: record.strategy,
            ...(record.syncPackage === undefined ? {} : { syncPackage: record.syncPackage }),
            url: record.url
          }
        }
  return new Map([...byPrefix, [record.prefix, stored]])
}

const appendRecord = (state: VendoredLogAccumulator, record: string): VendoredLogAccumulator => {
  const parsed = repoFromRecord(record)
  if (Result.isFailure(parsed)) {
    return {
      ...state,
      diagnostics: [...state.diagnostics, parsed.failure]
    }
  }

  return Result.match(decodeVendoredRecord(parsed.success), {
    onSuccess: (repo) => ({
      ...state,
      byPrefix: rememberRepo(state.byPrefix, repo)
    }),
    onFailure: (error) => ({
      ...state,
      diagnostics: [...state.diagnostics, diagnosticFromRecord(record, error)]
    })
  })
}

export const parseVendoredLogWithDiagnostics = (stdout: string): VendoredLogParseResult => {
  const { byPrefix, diagnostics } = nonEmptyRecords(stdout).reduce(appendRecord, {
    byPrefix: new Map<string, StoredVendoredLogRecord>(),
    diagnostics: []
  })

  return {
    repos: [...byPrefix.values()]
      .flatMap((record) => (record._tag === "Active" ? [record.repo] : []))
      .sort((a, b) => a.name.localeCompare(b.name)),
    diagnostics
  }
}

export const parseVendoredLog = (stdout: string): ReadonlyArray<VendoredRepo> =>
  parseVendoredLogWithDiagnostics(stdout).repos

export const parseVendoredCommitsWithDiagnostics = (
  commits: ReadonlyArray<GitMetadataCommit>
): VendoredLogParseResult => {
  const state = commits.reduce<VendoredLogAccumulator>(
    (accumulator, commit) => {
      const trailers = trailersFromMessage(commit.message)
      if (!trailers.has(TRAILER_URL)) return accumulator
      const raw = rawRepoFromCommit(commit)
      const parsed = repoFieldsFromRaw(commit.message, raw)
      if (Result.isFailure(parsed)) {
        return {
          ...accumulator,
          diagnostics: [...accumulator.diagnostics, parsed.failure]
        }
      }

      return Result.match(decodeVendoredRecord(parsed.success), {
        onSuccess: (repo) => ({
          ...accumulator,
          byPrefix: rememberRepo(accumulator.byPrefix, repo)
        }),
        onFailure: (error) => ({
          ...accumulator,
          diagnostics: [
            ...accumulator.diagnostics,
            {
              record: commit.message,
              reason: `Invalid vendored repo record for prefix '${raw.prefix}': ${String(error)}`
            }
          ]
        })
      })
    },
    {
      byPrefix: new Map<string, StoredVendoredLogRecord>(),
      diagnostics: []
    }
  )

  return {
    repos: [...state.byPrefix.values()]
      .flatMap((record) => (record._tag === "Active" ? [record.repo] : []))
      .sort((a, b) => a.name.localeCompare(b.name)),
    diagnostics: state.diagnostics
  }
}

export const parseVendoredCommits = (
  commits: ReadonlyArray<GitMetadataCommit>
): ReadonlyArray<VendoredRepo> => parseVendoredCommitsWithDiagnostics(commits).repos

const listVendoredWithGit = (cwd: string) =>
  git(["log", `--grep=^${TRAILER_URL}:`, "--extended-regexp", `--format=${gitLogFormat}%x1e`], {
    cwd
  }).pipe(
    Effect.map((result) =>
      result.exitCode === 0
        ? parseVendoredLogWithDiagnostics(result.stdout)
        : { repos: [], diagnostics: [] }
    )
  )

export const listVendored = (cwd: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const gitMetadata = yield* GitMetadata
    const parsed = yield* gitMetadata.listCommits(cwd).pipe(
      Effect.map(parseVendoredCommitsWithDiagnostics),
      Effect.catch(() => listVendoredWithGit(cwd))
    )
    yield* Effect.forEach(parsed.diagnostics, (diagnostic) => Effect.logDebug(diagnostic.reason), {
      discard: true
    })
    return yield* Effect.filter(parsed.repos, (repo) =>
      repo.strategy === "clone-ignore" || repo.strategy === "cache-link"
        ? Effect.succeed(true)
        : fs.exists(path.resolve(cwd, repo.prefix))
    )
  })

export const findByName = ({ cwd, name }: FindVendoredRepoParams) =>
  listVendored(cwd).pipe(
    Effect.map((repos) =>
      Option.fromNullishOr(repos.find((repo) => repo.name === name || repo.prefix === name))
    )
  )
