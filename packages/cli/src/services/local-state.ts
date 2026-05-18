import { Context, Effect, FileSystem, Layer, Option, Path, type PlatformError, Schema } from "effect"

const CURRENT_SCHEMA_VERSION = 1
const STATE_DIR = ".ingraft/state"

const NonEmptyString = Schema.String.pipe(Schema.check(Schema.isMinLength(1)))

const OrgRepositorySchema = Schema.Struct({
  name: NonEmptyString,
  owner: NonEmptyString,
  defaultBranch: Schema.NullOr(Schema.String),
  pushedAt: Schema.NullOr(Schema.String),
  primaryLanguage: Schema.NullOr(Schema.String),
  isArchived: Schema.Boolean,
  isFork: Schema.Boolean,
  visibility: Schema.String,
  description: Schema.NullOr(Schema.String),
  url: NonEmptyString
})

const OrgPreferencesSchema = Schema.Struct({
  language: Schema.Array(Schema.String),
  since: Schema.NullOr(Schema.String),
  excludeArchived: Schema.Boolean,
  excludeForks: Schema.Boolean,
  visibility: Schema.String,
  selectedNames: Schema.Array(Schema.String)
})

const OrgCacheSchema = Schema.Struct({
  schemaVersion: Schema.Number,
  owner: NonEmptyString,
  fetchedAt: NonEmptyString,
  repos: Schema.Array(OrgRepositorySchema),
  preferences: OrgPreferencesSchema
})

const VendorIndexSchema = Schema.Struct({
  schemaVersion: Schema.Number,
  headSha: NonEmptyString,
  builtAt: NonEmptyString,
  repos: Schema.Array(Schema.Any)
})

const UserIdentitySchema = Schema.Struct({
  schemaVersion: Schema.Number,
  fetchedAt: NonEmptyString,
  login: NonEmptyString,
  orgs: Schema.Array(Schema.String)
})

const RepoMetaSchema = Schema.Struct({
  fetchedAt: NonEmptyString,
  isFork: Schema.Boolean,
  parent: Schema.NullOr(Schema.String),
  owner: NonEmptyString,
  visibility: Schema.String
})

const RepoMetaFileSchema = Schema.Struct({
  schemaVersion: Schema.Number,
  byOwnerName: Schema.Record(Schema.String, RepoMetaSchema)
})

export type OrgRepository = typeof OrgRepositorySchema.Type
export type OrgPreferences = typeof OrgPreferencesSchema.Type
export type OrgCache = typeof OrgCacheSchema.Type
export type UserIdentity = typeof UserIdentitySchema.Type
export type RepoMeta = typeof RepoMetaSchema.Type

export interface VendorIndex {
  readonly schemaVersion: number
  readonly headSha: string
  readonly builtAt: string
  readonly repos: ReadonlyArray<unknown>
}

const decodeOrgCache = Schema.decodeUnknownOption(OrgCacheSchema)
const decodeVendorIndex = Schema.decodeUnknownOption(VendorIndexSchema)
const decodeUserIdentity = Schema.decodeUnknownOption(UserIdentitySchema)
const decodeRepoMetaFile = Schema.decodeUnknownOption(RepoMetaFileSchema)

const orgsDir = (path: Path.Path, cwd: string) => path.join(cwd, STATE_DIR, "orgs")
const orgFile = (path: Path.Path, cwd: string, owner: string) =>
  path.join(orgsDir(path, cwd), `${owner}.json`)
const indexFile = (path: Path.Path, cwd: string) => path.join(cwd, STATE_DIR, "index.json")
const userFile = (path: Path.Path, cwd: string) => path.join(cwd, STATE_DIR, "user.json")
const repoMetaFile = (path: Path.Path, cwd: string) =>
  path.join(cwd, STATE_DIR, "repo-meta.json")

const readJson = <A>(
  decode: (input: unknown) => Option.Option<A>,
  file: string
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const exists = yield* fs.exists(file).pipe(Effect.catch(() => Effect.succeed(false)))
    if (!exists) return Option.none<A>()
    const text = yield* fs.readFileString(file).pipe(Effect.option)
    if (Option.isNone(text)) return Option.none<A>()
    const parsed = yield* Effect.try({
      try: () => JSON.parse(text.value) as unknown,
      catch: () => new Error("invalid json")
    }).pipe(Effect.option)
    if (Option.isNone(parsed)) {
      yield* fs.remove(file).pipe(Effect.ignore)
      return Option.none<A>()
    }
    const decoded = decode(parsed.value)
    if (Option.isNone(decoded)) {
      yield* fs.remove(file).pipe(Effect.ignore)
      return Option.none<A>()
    }
    return decoded
  })

const writeJson = (file: string, value: unknown) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    yield* fs.makeDirectory(path.dirname(file), { recursive: true })
    const tmp = `${file}.tmp.${process.pid}.${Date.now()}`
    const body = JSON.stringify(value, null, 2)
    yield* fs.writeFileString(tmp, body).pipe(
      Effect.onError(() => fs.remove(tmp).pipe(Effect.ignore))
    )
    yield* fs.rename(tmp, file).pipe(
      Effect.onError(() => fs.remove(tmp).pipe(Effect.ignore))
    )
  })

export interface LocalStateShape {
  readonly readOrgCache: (params: {
    readonly cwd: string
    readonly owner: string
  }) => Effect.Effect<Option.Option<OrgCache>, never, FileSystem.FileSystem | Path.Path>
  readonly writeOrgCache: (params: {
    readonly cwd: string
    readonly cache: OrgCache
  }) => Effect.Effect<void, PlatformError.PlatformError, FileSystem.FileSystem | Path.Path>
  readonly clearOrg: (params: {
    readonly cwd: string
    readonly owner: string
  }) => Effect.Effect<void, never, FileSystem.FileSystem | Path.Path>
  readonly readVendorIndex: (params: {
    readonly cwd: string
    readonly currentHeadSha: string
  }) => Effect.Effect<Option.Option<VendorIndex>, never, FileSystem.FileSystem | Path.Path>
  readonly writeVendorIndex: (params: {
    readonly cwd: string
    readonly headSha: string
    readonly builtAt: string
    readonly repos: ReadonlyArray<unknown>
  }) => Effect.Effect<void, PlatformError.PlatformError, FileSystem.FileSystem | Path.Path>
  readonly readUser: (params: {
    readonly cwd: string
  }) => Effect.Effect<Option.Option<UserIdentity>, never, FileSystem.FileSystem | Path.Path>
  readonly writeUser: (params: {
    readonly cwd: string
    readonly identity: UserIdentity
  }) => Effect.Effect<void, PlatformError.PlatformError, FileSystem.FileSystem | Path.Path>
  readonly readRepoMeta: (params: {
    readonly cwd: string
    readonly ownerName: string
  }) => Effect.Effect<Option.Option<RepoMeta>, never, FileSystem.FileSystem | Path.Path>
  readonly writeRepoMeta: (params: {
    readonly cwd: string
    readonly ownerName: string
    readonly meta: RepoMeta
  }) => Effect.Effect<void, PlatformError.PlatformError, FileSystem.FileSystem | Path.Path>
}

export class LocalState extends Context.Service<LocalState, LocalStateShape>()(
  "ingraft/LocalState"
) {}

export const LocalStateLive = Layer.sync(LocalState, () => ({
  readOrgCache: ({ cwd, owner }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      return yield* readJson(decodeOrgCache, orgFile(path, cwd, owner))
    }),

  writeOrgCache: ({ cwd, cache }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      yield* writeJson(orgFile(path, cwd, cache.owner), {
        ...cache,
        schemaVersion: CURRENT_SCHEMA_VERSION
      })
    }),

  clearOrg: ({ cwd, owner }) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      yield* fs.remove(orgFile(path, cwd, owner)).pipe(Effect.ignore)
    }),

  readVendorIndex: ({ cwd, currentHeadSha }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      const decoded = yield* readJson(decodeVendorIndex, indexFile(path, cwd))
      return Option.flatMap(decoded, (idx) =>
        idx.headSha === currentHeadSha ? Option.some(idx) : Option.none()
      )
    }),

  writeVendorIndex: ({ cwd, headSha, builtAt, repos }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      yield* writeJson(indexFile(path, cwd), {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        headSha,
        builtAt,
        repos
      })
    }),

  readUser: ({ cwd }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      return yield* readJson(decodeUserIdentity, userFile(path, cwd))
    }),

  writeUser: ({ cwd, identity }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      yield* writeJson(userFile(path, cwd), {
        ...identity,
        schemaVersion: CURRENT_SCHEMA_VERSION
      })
    }),

  readRepoMeta: ({ cwd, ownerName }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      const file = yield* readJson(decodeRepoMetaFile, repoMetaFile(path, cwd))
      if (Option.isNone(file)) return Option.none<RepoMeta>()
      const entry = file.value.byOwnerName[ownerName]
      return entry ? Option.some(entry) : Option.none<RepoMeta>()
    }),

  // Best-effort under concurrent writers; full serialization would require a Semaphore or external file lock (out of scope for v1).
  writeRepoMeta: ({ cwd, ownerName, meta }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      const existing = yield* readJson(decodeRepoMetaFile, repoMetaFile(path, cwd))
      const byOwnerName = Option.match(existing, {
        onNone: () => ({}) as Record<string, RepoMeta>,
        onSome: (file) => ({ ...file.byOwnerName })
      })
      byOwnerName[ownerName] = meta
      yield* writeJson(repoMetaFile(path, cwd), {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        byOwnerName
      })
    })
}))
