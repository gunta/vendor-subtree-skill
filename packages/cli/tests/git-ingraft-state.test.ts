import { mkdtempSync, mkdirSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { NodeServices } from "@effect/platform-node"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"

import {
  type LocalVendorEntry,
  readLocalVendorState,
  removeLocalVendorEntry,
  upsertLocalVendorEntry
} from "../src/domain/local-state.ts"

const makeRepo = () => {
  const cwd = mkdtempSync(join(tmpdir(), "ingraft-local-state-"))
  mkdirSync(join(cwd, ".git"), { recursive: true })
  return cwd
}

const sampleEntry = (overrides: Partial<LocalVendorEntry> = {}): LocalVendorEntry => ({
  name: "effect",
  prefix: "vendor/effect",
  url: "https://github.com/Effect-TS/effect.git",
  ref: "main",
  resolvedRef: "abc123def456",
  strategy: "clone-ignore",
  filter: {
    exclude: [],
    excludeDirs: [],
    excludeExtensions: [],
    include: [],
    includeDirs: [],
    maxFileSizeBytes: null
  },
  syncPackage: undefined,
  addedAt: "2026-05-19T10:00:00.000Z",
  ...overrides
})

describe("local-state store", () => {
  test("returns an empty list when state file is missing", async () => {
    const cwd = makeRepo()

    const result = await Effect.runPromise(
      readLocalVendorState({ cwd }).pipe(Effect.provide(NodeServices.layer))
    )

    expect(result).toEqual([])
  })

  test("upsert writes a new entry and reads it back", async () => {
    const cwd = makeRepo()
    const entry = sampleEntry()

    await Effect.runPromise(
      upsertLocalVendorEntry({ cwd, entry }).pipe(Effect.provide(NodeServices.layer))
    )
    const result = await Effect.runPromise(
      readLocalVendorState({ cwd }).pipe(Effect.provide(NodeServices.layer))
    )

    expect(result).toEqual([entry])
    const raw = JSON.parse(readFileSync(join(cwd, ".git", "ingraft", "state.json"), "utf-8"))
    expect(raw.version).toBe(1)
    expect(raw.vendors).toHaveLength(1)
  })

  test("upsert replaces an existing entry with the same prefix", async () => {
    const cwd = makeRepo()
    const first = sampleEntry({ ref: "main", resolvedRef: "aaa111" })
    const second = sampleEntry({ ref: "v1.0.0", resolvedRef: "bbb222" })

    await Effect.runPromise(
      upsertLocalVendorEntry({ cwd, entry: first }).pipe(Effect.provide(NodeServices.layer))
    )
    await Effect.runPromise(
      upsertLocalVendorEntry({ cwd, entry: second }).pipe(Effect.provide(NodeServices.layer))
    )
    const result = await Effect.runPromise(
      readLocalVendorState({ cwd }).pipe(Effect.provide(NodeServices.layer))
    )

    expect(result).toEqual([second])
  })

  test("rejects entries with empty string resolvedRef from disk (treats as corrupt)", async () => {
    const cwd = makeRepo()
    const { writeFileSync, mkdirSync } = await import("node:fs")
    mkdirSync(join(cwd, ".git", "ingraft"), { recursive: true })
    writeFileSync(
      join(cwd, ".git", "ingraft", "state.json"),
      JSON.stringify({
        version: 1,
        vendors: [
          {
            name: "effect",
            prefix: "vendor/effect",
            url: "https://github.com/Effect-TS/effect.git",
            ref: "main",
            resolvedRef: "", // empty string should be rejected
            strategy: "clone-ignore",
            filter: {
              exclude: [],
              excludeDirs: [],
              excludeExtensions: [],
              include: [],
              includeDirs: [],
              maxFileSizeBytes: null
            },
            addedAt: "2026-05-19T10:00:00.000Z"
          }
        ]
      })
    )

    const result = await Effect.runPromise(
      readLocalVendorState({ cwd }).pipe(Effect.provide(NodeServices.layer))
    )

    expect(result).toEqual([])
  })

  test("returns empty list and logs a warning when state.json is malformed JSON", async () => {
    const cwd = makeRepo()
    const { writeFileSync, mkdirSync } = await import("node:fs")
    mkdirSync(join(cwd, ".git", "ingraft"), { recursive: true })
    writeFileSync(join(cwd, ".git", "ingraft", "state.json"), "{not valid json")

    const result = await Effect.runPromise(
      readLocalVendorState({ cwd }).pipe(Effect.provide(NodeServices.layer))
    )

    expect(result).toEqual([])
  })

  test("remove drops the entry for a given prefix", async () => {
    const cwd = makeRepo()
    const a = sampleEntry({ name: "effect", prefix: "vendor/effect" })
    const b = sampleEntry({
      name: "zod",
      prefix: "vendor/zod",
      url: "https://github.com/colinhacks/zod.git"
    })

    await Effect.runPromise(
      Effect.flatMap(upsertLocalVendorEntry({ cwd, entry: a }), () =>
        upsertLocalVendorEntry({ cwd, entry: b })
      ).pipe(Effect.provide(NodeServices.layer))
    )
    await Effect.runPromise(
      removeLocalVendorEntry({ cwd, prefix: "vendor/effect" }).pipe(
        Effect.provide(NodeServices.layer)
      )
    )
    const result = await Effect.runPromise(
      readLocalVendorState({ cwd }).pipe(Effect.provide(NodeServices.layer))
    )

    expect(result.map((entry) => entry.name)).toEqual(["zod"])
  })
})
