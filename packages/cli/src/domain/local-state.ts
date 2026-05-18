import { Effect, FileSystem, Path, Schema } from "effect"

import { VendorFilterSchema, type VendorFilter } from "./vendor-filter.ts"
import { VendorStrategySchema, type VendorStrategy } from "./vendor-strategy.ts"

const STATE_VERSION = 1
const STATE_RELATIVE_PATH = [".git", "ingraft", "state.json"] as const

export interface LocalVendorEntry {
  readonly name: string
  readonly prefix: string
  readonly url: string
  readonly ref: string
  readonly resolvedRef?: string
  readonly strategy: VendorStrategy
  readonly filter: VendorFilter
  readonly syncPackage?: string
  readonly addedAt: string
}

const LocalVendorEntrySchema = Schema.Struct({
  name: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  prefix: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  url: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  ref: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  resolvedRef: Schema.optionalKey(Schema.String.pipe(Schema.check(Schema.isMinLength(1)))),
  strategy: VendorStrategySchema,
  filter: VendorFilterSchema,
  syncPackage: Schema.optionalKey(Schema.String.pipe(Schema.check(Schema.isMinLength(1)))),
  addedAt: Schema.String.pipe(Schema.check(Schema.isMinLength(1)))
})

const LocalStateSchema = Schema.Struct({
  version: Schema.Number,
  vendors: Schema.Array(LocalVendorEntrySchema)
})

export interface ReadLocalVendorStateParams {
  readonly cwd: string
}

export interface UpsertLocalVendorEntryParams {
  readonly cwd: string
  readonly entry: LocalVendorEntry
}

export interface RemoveLocalVendorEntryParams {
  readonly cwd: string
  readonly prefix: string
}

const statePath = (cwd: string, path: Path.Path): string =>
  path.resolve(cwd, ...STATE_RELATIVE_PATH)

const decodeState = Schema.decodeUnknownSync(LocalStateSchema)

const normalizeEntry = (entry: LocalVendorEntry): LocalVendorEntry => ({
  name: entry.name,
  prefix: entry.prefix.replace(/\/+$/, ""),
  url: entry.url,
  ref: entry.ref,
  ...(entry.resolvedRef === undefined ? {} : { resolvedRef: entry.resolvedRef }),
  strategy: entry.strategy,
  filter: entry.filter,
  ...(entry.syncPackage === undefined ? {} : { syncPackage: entry.syncPackage }),
  addedAt: entry.addedAt
})

const writeStateAtomic = (params: {
  readonly cwd: string
  readonly fs: FileSystem.FileSystem
  readonly path: Path.Path
  readonly entries: ReadonlyArray<LocalVendorEntry>
}) =>
  Effect.gen(function* () {
    const target = statePath(params.cwd, params.path)
    yield* params.fs
      .makeDirectory(params.path.dirname(target), { recursive: true })
      .pipe(Effect.ignore)
    const tmp = `${target}.tmp`
    const body = `${JSON.stringify({ version: STATE_VERSION, vendors: params.entries }, null, 2)}\n`
    yield* params.fs.writeFileString(tmp, body)
    yield* params.fs.rename(tmp, target)
  })

export const readLocalVendorState = ({ cwd }: ReadLocalVendorStateParams) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const target = statePath(cwd, path)
    if (!(yield* fs.exists(target))) return [] as ReadonlyArray<LocalVendorEntry>
    const raw = yield* fs.readFileString(target)
    try {
      const decoded = decodeState(JSON.parse(raw))
      return decoded.vendors.map(normalizeEntry)
    } catch (cause) {
      yield* Effect.logWarning(
        `Ignoring corrupt ingraft state.json at ${target}: ${String(cause)}`
      )
      return [] as ReadonlyArray<LocalVendorEntry>
    }
  })

export const upsertLocalVendorEntry = ({ cwd, entry }: UpsertLocalVendorEntryParams) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const existing = yield* readLocalVendorState({ cwd })
    const normalized = normalizeEntry(entry)
    const next = [
      ...existing.filter((stored) => stored.prefix !== normalized.prefix),
      normalized
    ].sort((a, b) => a.prefix.localeCompare(b.prefix))
    yield* writeStateAtomic({ cwd, fs, path, entries: next })
  })

export const removeLocalVendorEntry = ({ cwd, prefix }: RemoveLocalVendorEntryParams) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const existing = yield* readLocalVendorState({ cwd })
    const target = prefix.replace(/\/+$/, "")
    const next = existing.filter((stored) => stored.prefix !== target)
    if (next.length === existing.length) return
    if (next.length === 0) {
      const file = statePath(cwd, path)
      if (yield* fs.exists(file)) yield* fs.remove(file, { force: true })
      return
    }
    yield* writeStateAtomic({ cwd, fs, path, entries: next })
  })
