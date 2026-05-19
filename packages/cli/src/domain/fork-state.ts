import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"

import { Effect, Schema } from "effect"

const STATE_VERSION = 1
const FORKS_STATE_RELATIVE_PATH = [".git", "ingraft", "forks.json"] as const

export interface ForkWorkspaceEntry {
  readonly checkoutPath: string
  readonly fork: string
  readonly forkUrl: string
  readonly name: string
  readonly prefix: string
  readonly updatedAt: string
  readonly upstream: string
  readonly upstreamUrl: string
}

const NonEmptyString = Schema.String.pipe(Schema.check(Schema.isMinLength(1)))

const ForkWorkspaceEntrySchema = Schema.Struct({
  checkoutPath: NonEmptyString,
  fork: NonEmptyString,
  forkUrl: NonEmptyString,
  name: NonEmptyString,
  prefix: NonEmptyString,
  updatedAt: NonEmptyString,
  upstream: NonEmptyString,
  upstreamUrl: NonEmptyString
})

const ForkWorkspaceStateSchema = Schema.Struct({
  version: Schema.Number,
  forks: Schema.Array(ForkWorkspaceEntrySchema)
})

export interface ReadForkWorkspaceStateParams {
  readonly cwd: string
}

export interface UpsertForkWorkspaceEntryParams {
  readonly cwd: string
  readonly entry: ForkWorkspaceEntry
}

export interface RemoveForkWorkspaceEntryParams {
  readonly cwd: string
  readonly name: string
}

const statePath = (cwd: string): string => path.resolve(cwd, ...FORKS_STATE_RELATIVE_PATH)

const normalizeEntry = (entry: ForkWorkspaceEntry): ForkWorkspaceEntry => ({
  checkoutPath: path.resolve(entry.checkoutPath),
  fork: entry.fork,
  forkUrl: entry.forkUrl,
  name: entry.name,
  prefix: entry.prefix.replace(/\/+$/, ""),
  updatedAt: entry.updatedAt,
  upstream: entry.upstream,
  upstreamUrl: entry.upstreamUrl
})

const decodeState = Schema.decodeUnknownSync(ForkWorkspaceStateSchema)

const readEntries = (cwd: string): ReadonlyArray<ForkWorkspaceEntry> => {
  const file = statePath(cwd)
  if (!existsSync(file)) return []
  try {
    const decoded = decodeState(JSON.parse(readFileSync(file, "utf-8")))
    if (decoded.version !== STATE_VERSION) return []
    return decoded.forks.map(normalizeEntry)
  } catch {
    return []
  }
}

const writeEntries = (cwd: string, entries: ReadonlyArray<ForkWorkspaceEntry>): void => {
  const file = statePath(cwd)
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  writeFileSync(
    tmp,
    `${JSON.stringify({ version: STATE_VERSION, forks: entries.map(normalizeEntry) }, null, 2)}\n`
  )
  renameSync(tmp, file)
}

export const readForkWorkspaceState = ({ cwd }: ReadForkWorkspaceStateParams) =>
  Effect.sync(() => readEntries(cwd))

export const upsertForkWorkspaceEntry = ({ cwd, entry }: UpsertForkWorkspaceEntryParams) =>
  Effect.sync(() => {
    const normalized = normalizeEntry(entry)
    const next = [
      ...readEntries(cwd).filter((stored) => stored.name !== normalized.name),
      normalized
    ].sort((a, b) => a.name.localeCompare(b.name))
    writeEntries(cwd, next)
  })

export const removeForkWorkspaceEntry = ({ cwd, name }: RemoveForkWorkspaceEntryParams) =>
  Effect.sync(() => {
    const file = statePath(cwd)
    const existing = readEntries(cwd)
    const next = existing.filter((entry) => entry.name !== name)
    if (next.length === existing.length) return
    if (next.length === 0) {
      if (existsSync(file)) rmSync(file, { force: true })
      return
    }
    writeEntries(cwd, next)
  })
