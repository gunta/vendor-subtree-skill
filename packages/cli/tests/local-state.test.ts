import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { NodeServices } from "@effect/platform-node"
import { Effect, Option } from "effect"
import { FileSystem, Path } from "effect"

import {
  LocalState,
  LocalStateLive,
  type OrgCache,
  type UserIdentity,
  type RepoMeta
} from "../src/services/local-state.ts"

const makeTempCwd = () => {
  const dir = mkdtempSync(join(tmpdir(), "ingraft-localstate-"))
  return {
    cwd: dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true })
  }
}

const provide = <A, E>(eff: Effect.Effect<A, E, LocalState | FileSystem.FileSystem | Path.Path>) =>
  eff.pipe(Effect.provide(LocalStateLive), Effect.provide(NodeServices.layer))

describe("LocalState org cache", () => {
  test("returns None on cache miss", async () => {
    const { cwd, cleanup } = makeTempCwd()
    try {
      const result = await Effect.runPromise(
        provide(
          Effect.gen(function* () {
            const local = yield* LocalState
            return yield* local.readOrgCache({ cwd, owner: "gunta" })
          })
        )
      )
      expect(Option.isNone(result)).toBe(true)
    } finally {
      cleanup()
    }
  })

  test("round-trips org cache writes and reads", async () => {
    const { cwd, cleanup } = makeTempCwd()
    try {
      const written: OrgCache = {
        schemaVersion: 1,
        owner: "gunta",
        fetchedAt: "2026-05-19T14:33:21Z",
        repos: [
          {
            name: "ingraft",
            owner: "gunta",
            defaultBranch: "main",
            pushedAt: "2026-05-18T00:00:00Z",
            primaryLanguage: "TypeScript",
            isArchived: false,
            isFork: false,
            visibility: "public",
            description: "context router",
            stars: 4242,
            url: "https://github.com/gunta/ingraft.git"
          }
        ],
        preferences: {
          language: ["typescript"],
          since: "90d",
          excludeArchived: true,
          excludeForks: true,
          visibility: "all",
          selectedNames: ["ingraft"]
        }
      }

      const roundTripped = await Effect.runPromise(
        provide(
          Effect.gen(function* () {
            const local = yield* LocalState
            yield* local.writeOrgCache({ cwd, cache: written })
            return yield* local.readOrgCache({ cwd, owner: "gunta" })
          })
        )
      )

      expect(Option.isSome(roundTripped)).toBe(true)
      if (Option.isSome(roundTripped)) {
        expect(roundTripped.value).toEqual(written)
      }
    } finally {
      cleanup()
    }
  })

  test("clearOrg removes the cache so subsequent reads return None", async () => {
    const { cwd, cleanup } = makeTempCwd()
    try {
      const written: OrgCache = {
        schemaVersion: 1,
        owner: "gunta",
        fetchedAt: "2026-05-19T14:33:21Z",
        repos: [],
        preferences: {
          language: [],
          since: null,
          excludeArchived: true,
          excludeForks: true,
          visibility: "all",
          selectedNames: []
        }
      }

      const result = await Effect.runPromise(
        provide(
          Effect.gen(function* () {
            const local = yield* LocalState
            yield* local.writeOrgCache({ cwd, cache: written })
            yield* local.clearOrg({ cwd, owner: "gunta" })
            return yield* local.readOrgCache({ cwd, owner: "gunta" })
          })
        )
      )

      expect(Option.isNone(result)).toBe(true)
    } finally {
      cleanup()
    }
  })

  test("deletes and returns None on schema-version mismatch", async () => {
    const { cwd, cleanup } = makeTempCwd()
    try {
      const result = await Effect.runPromise(
        provide(
          Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem
            const path = yield* Path.Path
            const dir = path.join(cwd, ".ingraft", "state", "orgs")
            yield* fs.makeDirectory(dir, { recursive: true })
            yield* fs.writeFileString(
              path.join(dir, "gunta.json"),
              JSON.stringify({ schemaVersion: 999, owner: "gunta", repos: [] })
            )
            const local = yield* LocalState
            const value = yield* local.readOrgCache({ cwd, owner: "gunta" })
            const stillExists = yield* fs.exists(path.join(dir, "gunta.json"))
            return { value, stillExists }
          })
        )
      )

      expect(Option.isNone(result.value)).toBe(true)
      expect(result.stillExists).toBe(false)
    } finally {
      cleanup()
    }
  })

  test("deletes and returns None when a compatible cache has a future schema version", async () => {
    const { cwd, cleanup } = makeTempCwd()
    try {
      const result = await Effect.runPromise(
        provide(
          Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem
            const path = yield* Path.Path
            const dir = path.join(cwd, ".ingraft", "state", "orgs")
            const file = path.join(dir, "gunta.json")
            yield* fs.makeDirectory(dir, { recursive: true })
            yield* fs.writeFileString(
              file,
              JSON.stringify({
                schemaVersion: 999,
                owner: "gunta",
                fetchedAt: "2026-05-19T14:33:21Z",
                repos: [],
                preferences: {
                  language: [],
                  since: null,
                  excludeArchived: true,
                  excludeForks: true,
                  visibility: "all",
                  selectedNames: []
                }
              })
            )
            const local = yield* LocalState
            const value = yield* local.readOrgCache({ cwd, owner: "gunta" })
            const stillExists = yield* fs.exists(file)
            return { value, stillExists }
          })
        )
      )

      expect(Option.isNone(result.value)).toBe(true)
      expect(result.stillExists).toBe(false)
    } finally {
      cleanup()
    }
  })

  test("deletes and returns None on corrupt JSON", async () => {
    const { cwd, cleanup } = makeTempCwd()
    try {
      const result = await Effect.runPromise(
        provide(
          Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem
            const path = yield* Path.Path
            const dir = path.join(cwd, ".ingraft", "state", "orgs")
            yield* fs.makeDirectory(dir, { recursive: true })
            yield* fs.writeFileString(path.join(dir, "gunta.json"), "{ this is not json")
            const local = yield* LocalState
            const value = yield* local.readOrgCache({ cwd, owner: "gunta" })
            const stillExists = yield* fs.exists(path.join(dir, "gunta.json"))
            return { value, stillExists }
          })
        )
      )

      expect(Option.isNone(result.value)).toBe(true)
      expect(result.stillExists).toBe(false)
    } finally {
      cleanup()
    }
  })
})

describe("LocalState vendor index", () => {
  test("returns the cached index only when headSha matches", async () => {
    const { cwd, cleanup } = makeTempCwd()
    try {
      const result = await Effect.runPromise(
        provide(
          Effect.gen(function* () {
            const local = yield* LocalState
            yield* local.writeVendorIndex({
              cwd,
              headSha: "abc123",
              builtAt: "2026-05-19T14:33:21Z",
              repos: []
            })
            const matched = yield* local.readVendorIndex({ cwd, currentHeadSha: "abc123" })
            const mismatched = yield* local.readVendorIndex({ cwd, currentHeadSha: "deadbeef" })
            return { matched, mismatched }
          })
        )
      )

      expect(Option.isSome(result.matched)).toBe(true)
      expect(Option.isNone(result.mismatched)).toBe(true)
    } finally {
      cleanup()
    }
  })

  test("deletes and returns None when index cache has a future schema version", async () => {
    const { cwd, cleanup } = makeTempCwd()
    try {
      const result = await Effect.runPromise(
        provide(
          Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem
            const path = yield* Path.Path
            const file = path.join(cwd, ".ingraft", "state", "index.json")
            yield* fs.makeDirectory(path.dirname(file), { recursive: true })
            yield* fs.writeFileString(
              file,
              JSON.stringify({
                schemaVersion: 999,
                headSha: "abc123",
                builtAt: "2026-05-19T14:33:21Z",
                repos: []
              })
            )
            const local = yield* LocalState
            const value = yield* local.readVendorIndex({ cwd, currentHeadSha: "abc123" })
            const stillExists = yield* fs.exists(file)
            return { value, stillExists }
          })
        )
      )

      expect(Option.isNone(result.value)).toBe(true)
      expect(result.stillExists).toBe(false)
    } finally {
      cleanup()
    }
  })
})

describe("LocalState user + repo-meta", () => {
  test("round-trips user identity", async () => {
    const { cwd, cleanup } = makeTempCwd()
    try {
      const identity: UserIdentity = {
        schemaVersion: 1,
        fetchedAt: "2026-05-19T14:33:21Z",
        login: "gunta",
        orgs: ["g-productions-studio"]
      }
      const value = await Effect.runPromise(
        provide(
          Effect.gen(function* () {
            const local = yield* LocalState
            yield* local.writeUser({ cwd, identity })
            return yield* local.readUser({ cwd })
          })
        )
      )
      expect(Option.isSome(value)).toBe(true)
      if (Option.isSome(value)) expect(value.value).toEqual(identity)
    } finally {
      cleanup()
    }
  })

  test("deletes and returns None when user cache has a future schema version", async () => {
    const { cwd, cleanup } = makeTempCwd()
    try {
      const result = await Effect.runPromise(
        provide(
          Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem
            const path = yield* Path.Path
            const file = path.join(cwd, ".ingraft", "state", "user.json")
            yield* fs.makeDirectory(path.dirname(file), { recursive: true })
            yield* fs.writeFileString(
              file,
              JSON.stringify({
                schemaVersion: 999,
                fetchedAt: "2026-05-19T14:33:21Z",
                login: "gunta",
                orgs: []
              })
            )
            const local = yield* LocalState
            const value = yield* local.readUser({ cwd })
            const stillExists = yield* fs.exists(file)
            return { value, stillExists }
          })
        )
      )

      expect(Option.isNone(result.value)).toBe(true)
      expect(result.stillExists).toBe(false)
    } finally {
      cleanup()
    }
  })

  test("round-trips repo-meta keyed by owner/name", async () => {
    const { cwd, cleanup } = makeTempCwd()
    try {
      const meta: RepoMeta = {
        fetchedAt: "2026-05-19T14:33:21Z",
        isFork: true,
        parent: "Effect-TS/effect",
        owner: "gunta",
        visibility: "public"
      }
      const value = await Effect.runPromise(
        provide(
          Effect.gen(function* () {
            const local = yield* LocalState
            yield* local.writeRepoMeta({ cwd, ownerName: "gunta/effect", meta })
            return yield* local.readRepoMeta({ cwd, ownerName: "gunta/effect" })
          })
        )
      )
      expect(Option.isSome(value)).toBe(true)
      if (Option.isSome(value)) expect(value.value).toEqual(meta)
    } finally {
      cleanup()
    }
  })

  test("deletes and returns None when repo-meta cache has a future schema version", async () => {
    const { cwd, cleanup } = makeTempCwd()
    try {
      const result = await Effect.runPromise(
        provide(
          Effect.gen(function* () {
            const fs = yield* FileSystem.FileSystem
            const path = yield* Path.Path
            const file = path.join(cwd, ".ingraft", "state", "repo-meta.json")
            yield* fs.makeDirectory(path.dirname(file), { recursive: true })
            yield* fs.writeFileString(
              file,
              JSON.stringify({
                schemaVersion: 999,
                byOwnerName: {
                  "gunta/effect": {
                    fetchedAt: "2026-05-19T14:33:21Z",
                    isFork: true,
                    parent: "Effect-TS/effect",
                    owner: "gunta",
                    visibility: "public"
                  }
                }
              })
            )
            const local = yield* LocalState
            const value = yield* local.readRepoMeta({ cwd, ownerName: "gunta/effect" })
            const stillExists = yield* fs.exists(file)
            return { value, stillExists }
          })
        )
      )

      expect(Option.isNone(result.value)).toBe(true)
      expect(result.stillExists).toBe(false)
    } finally {
      cleanup()
    }
  })
})
