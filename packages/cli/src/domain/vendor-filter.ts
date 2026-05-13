import { Effect, Schema } from "effect"

import { InvalidVendorFilter } from "./errors.ts"

export interface VendorFilter {
  readonly exclude: ReadonlyArray<string>
  readonly excludeDirs: ReadonlyArray<string>
  readonly excludeExtensions: ReadonlyArray<string>
  readonly maxFileSizeBytes: number | null
}

export interface VendorFilterOptionParams {
  readonly exclude: ReadonlyArray<string>
  readonly excludeDirs: ReadonlyArray<string>
  readonly excludeExtensions: ReadonlyArray<string>
  readonly maxFileSize: string | null
}

export interface GitTreeEntry {
  readonly mode: string
  readonly objectType: string
  readonly objectName: string
  readonly size: number | null
  readonly path: string
}

export interface IncludedTreePathsParams {
  readonly entries: ReadonlyArray<GitTreeEntry>
  readonly filter: VendorFilter
}

export const VendorFilterSchema = Schema.Struct({
  exclude: Schema.Array(Schema.String),
  excludeDirs: Schema.Array(Schema.String),
  excludeExtensions: Schema.Array(Schema.String),
  maxFileSizeBytes: Schema.NullOr(Schema.Number)
})

export const EMPTY_VENDOR_FILTER: VendorFilter = {
  exclude: [],
  excludeDirs: [],
  excludeExtensions: [],
  maxFileSizeBytes: null
}

const SIZE_UNITS: Readonly<Record<string, number>> = {
  b: 1,
  byte: 1,
  bytes: 1,
  k: 1024,
  kb: 1024,
  kib: 1024,
  m: 1024 ** 2,
  mb: 1024 ** 2,
  mib: 1024 ** 2,
  g: 1024 ** 3,
  gb: 1024 ** 3,
  gib: 1024 ** 3
}

const nonEmpty = (value: string): boolean => value.trim().length > 0

const dedupe = (values: ReadonlyArray<string>): ReadonlyArray<string> =>
  [...new Set(values)].sort((a, b) => a.localeCompare(b))

const normalizePathLike = (value: string): string =>
  value
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\/+|\/+$/g, "")

const normalizeExtension = (value: string): string => value.trim().toLowerCase().replace(/^\.+/, "")

const invalidFilter = (value: string, reason: string) => new InvalidVendorFilter({ value, reason })

const validateToken = (value: string) =>
  value.includes("\n") || value.includes("\0")
    ? Effect.fail(invalidFilter(value, "newlines and NUL bytes are not allowed"))
    : Effect.succeed(value)

const normalizedList = (values: ReadonlyArray<string>, normalize: (value: string) => string) =>
  Effect.forEach(
    values.filter(nonEmpty),
    (value) => validateToken(value).pipe(Effect.map(normalize)),
    { concurrency: 1 }
  ).pipe(Effect.map((items) => dedupe(items.filter(nonEmpty))))

export const hasVendorFilter = (filter: VendorFilter): boolean =>
  filter.exclude.length > 0 ||
  filter.excludeDirs.length > 0 ||
  filter.excludeExtensions.length > 0 ||
  filter.maxFileSizeBytes !== null

export const parseSizeToBytes = (value: string) =>
  Effect.suspend(() => {
    const normalized = value.trim().toLowerCase()
    const match = normalized.match(/^(\d+(?:\.\d+)?)\s*([a-z]+)?$/)
    if (!match?.[1]) {
      return Effect.fail(invalidFilter(value, "expected a number with an optional unit"))
    }

    const amount = Number(match[1])
    const unit = match[2] ?? "b"
    const multiplier = SIZE_UNITS[unit]
    if (!Number.isFinite(amount) || amount <= 0 || multiplier === undefined) {
      return Effect.fail(invalidFilter(value, "expected a positive size such as 500KB or 1MB"))
    }

    return Effect.succeed(Math.floor(amount * multiplier))
  })

export const vendorFilterFromOptions = ({
  exclude,
  excludeDirs,
  excludeExtensions,
  maxFileSize
}: VendorFilterOptionParams) =>
  Effect.gen(function* () {
    const normalizedExclude = yield* normalizedList(exclude, normalizePathLike)
    const normalizedDirs = yield* normalizedList(excludeDirs, normalizePathLike)
    const normalizedExtensions = yield* normalizedList(excludeExtensions, normalizeExtension)
    const maxFileSizeBytes =
      maxFileSize === null || maxFileSize.trim().length === 0
        ? null
        : yield* parseSizeToBytes(maxFileSize)

    return {
      exclude: normalizedExclude,
      excludeDirs: normalizedDirs,
      excludeExtensions: normalizedExtensions,
      maxFileSizeBytes
    } satisfies VendorFilter
  })

const pathExtension = (value: string): string => {
  const name = value.split("/").at(-1) ?? value
  const index = name.lastIndexOf(".")
  return index <= 0 ? "" : name.slice(index + 1).toLowerCase()
}

const inExcludedDir = (relativePath: string, excludeDirs: ReadonlyArray<string>): boolean =>
  excludeDirs.some((dir) => relativePath === dir || relativePath.startsWith(`${dir}/`))

const regexpEscape = (char: string): string => (/[|\\{}()[\]^$+?.]/.test(char) ? `\\${char}` : char)

const globToRegExp = (pattern: string): RegExp => {
  let source = ""
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]
    const next = pattern[index + 1]
    if (char === "*" && next === "*") {
      source += ".*"
      index += 1
    } else if (char === "*") {
      source += "[^/]*"
    } else if (char === "?") {
      source += "[^/]"
    } else {
      source += regexpEscape(char ?? "")
    }
  }
  return new RegExp(pattern.includes("/") ? `^${source}$` : `(^|/)${source}$`)
}

const matchesAnyGlob = (relativePath: string, patterns: ReadonlyArray<string>): boolean =>
  patterns.some((pattern) => globToRegExp(pattern).test(relativePath))

const isExcluded = (entry: GitTreeEntry, filter: VendorFilter): boolean => {
  if (inExcludedDir(entry.path, filter.excludeDirs)) return true
  if (
    filter.excludeExtensions.length > 0 &&
    filter.excludeExtensions.includes(pathExtension(entry.path))
  ) {
    return true
  }
  if (matchesAnyGlob(entry.path, filter.exclude)) return true
  return (
    filter.maxFileSizeBytes !== null && entry.size !== null && entry.size > filter.maxFileSizeBytes
  )
}

export const parseGitTreeEntries = (stdout: string): ReadonlyArray<GitTreeEntry> =>
  stdout.split("\n").flatMap((line) => {
    const match = line.match(/^(\d+)\s+(\S+)\s+(\S+)\s+(-|\d+)\t(.+)$/)
    if (!match?.[1] || !match[2] || !match[3] || !match[4] || !match[5]) {
      return []
    }
    return [
      {
        mode: match[1],
        objectType: match[2],
        objectName: match[3],
        size: match[4] === "-" ? null : Number(match[4]),
        path: normalizePathLike(match[5])
      }
    ]
  })

export const includedTreePaths = ({
  entries,
  filter
}: IncludedTreePathsParams): ReadonlyArray<string> =>
  entries
    .filter((entry) => entry.path.length > 0 && !isExcluded(entry, filter))
    .map((entry) => entry.path)
    .sort((a, b) => a.localeCompare(b))

export const formatVendorFilterTrailer = (filter: VendorFilter): string =>
  hasVendorFilter(filter) ? JSON.stringify(filter) : ""

export const parseVendorFilterTrailer = (value: string): VendorFilter => {
  if (value.trim().length === 0) return EMPTY_VENDOR_FILTER
  return Schema.decodeUnknownSync(VendorFilterSchema)(JSON.parse(value))
}
