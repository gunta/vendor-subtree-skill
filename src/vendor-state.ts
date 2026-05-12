import { FileSystem, Path } from "@effect/platform"
import { Effect, Either, Option, ParseResult, Schema } from "effect"
import { TRAILER_DIR, TRAILER_REF, TRAILER_URL } from "./constants.ts"
import { git } from "./git.ts"

export const VendoredRepoSchema = Schema.Struct({
  name: Schema.String.pipe(Schema.minLength(1)),
  prefix: Schema.String.pipe(Schema.minLength(1)),
  url: Schema.String.pipe(Schema.minLength(1)),
  ref: Schema.String.pipe(Schema.minLength(1)),
  sha: Schema.String.pipe(Schema.minLength(1)),
  date: Schema.String.pipe(Schema.minLength(1))
})

export type VendoredRepo = typeof VendoredRepoSchema.Type

const decodeVendoredRepo = Schema.decodeUnknownEither(VendoredRepoSchema, {
  errors: "all"
})

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
  readonly date: string
  readonly name: string
  readonly prefix: string
  readonly ref: string
  readonly sha: string
  readonly url: string
}

export const gitLogFormat = [
  "%H",
  "%cI",
  `%(trailers:key=${TRAILER_DIR},valueonly)`,
  `%(trailers:key=${TRAILER_URL},valueonly)`,
  `%(trailers:key=${TRAILER_REF},valueonly)`
].join("%x00")

interface VendoredLogAccumulator {
  readonly byPrefix: ReadonlyMap<string, VendoredRepo>
  readonly diagnostics: ReadonlyArray<VendoredLogDiagnostic>
}

const nonEmptyRecords = (stdout: string): ReadonlyArray<string> =>
  stdout
    .split("\x1e")
    .map((record) => record.trim())
    .filter((record) => record.length > 0)

const recordPart = (
  parts: ReadonlyArray<string>,
  index: number
): string => parts[index]?.trim() ?? ""

const repoFromRecord = (record: string): VendoredLogRecordFields => {
  const parts = record.split("\x00")
  const sha = recordPart(parts, 0)
  const date = recordPart(parts, 1)
  const prefix = recordPart(parts, 2)
  const url = recordPart(parts, 3)
  const ref = recordPart(parts, 4)
  const name = prefix.replace(/\/+$/, "").split("/").pop() ?? ""
  return { date, name, prefix, ref, sha, url }
}

const diagnosticFromRecord = (
  record: string,
  error: ParseResult.ParseError
): VendoredLogDiagnostic => {
  const { prefix } = repoFromRecord(record)
  return {
    record,
    reason: `Invalid vendored repo record for prefix '${prefix ?? ""}': ${ParseResult.TreeFormatter.formatErrorSync(
      error
    )}`
  }
}

const rememberRepo = (
  byPrefix: ReadonlyMap<string, VendoredRepo>,
  repo: VendoredRepo
): ReadonlyMap<string, VendoredRepo> =>
  byPrefix.has(repo.prefix) ? byPrefix : new Map([...byPrefix, [repo.prefix, repo]])

const appendRecord = (
  state: VendoredLogAccumulator,
  record: string
): VendoredLogAccumulator =>
  Either.match(decodeVendoredRepo(repoFromRecord(record)), {
    onRight: (repo) => ({
      ...state,
      byPrefix: rememberRepo(state.byPrefix, repo)
    }),
    onLeft: (error) => ({
      ...state,
      diagnostics: [...state.diagnostics, diagnosticFromRecord(record, error)]
    })
  })

export const parseVendoredLogWithDiagnostics = (
  stdout: string
): VendoredLogParseResult => {
  const { byPrefix, diagnostics } = nonEmptyRecords(stdout).reduce(appendRecord, {
    byPrefix: new Map<string, VendoredRepo>(),
    diagnostics: []
  })

  return {
    repos: [...byPrefix.values()].sort((a, b) => a.name.localeCompare(b.name)),
    diagnostics
  }
}

export const parseVendoredLog = (stdout: string): ReadonlyArray<VendoredRepo> =>
  parseVendoredLogWithDiagnostics(stdout).repos

export const listVendored = (cwd: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const result = yield* git(
      [
        "log",
        `--grep=^${TRAILER_URL}:`,
        "--extended-regexp",
        `--format=${gitLogFormat}%x1e`
      ],
      { cwd }
    )

    if (result.exitCode !== 0) return [] as VendoredRepo[]

    const parsed = parseVendoredLogWithDiagnostics(result.stdout)
    yield* Effect.forEach(
      parsed.diagnostics,
      (diagnostic) => Effect.logDebug(diagnostic.reason),
      { discard: true }
    )
    return yield* Effect.filter(parsed.repos, (repo) =>
      fs.exists(path.resolve(cwd, repo.prefix))
    )
  })

export const findByName = ({ cwd, name }: FindVendoredRepoParams) =>
  listVendored(cwd).pipe(
    Effect.map((repos) =>
      Option.fromNullable(
        repos.find((repo) => repo.name === name || repo.prefix === name)
      )
    )
  )
