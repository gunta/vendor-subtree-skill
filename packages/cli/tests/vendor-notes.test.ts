import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import * as nodeFs from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Effect } from "effect"
import * as git from "isomorphic-git"

import { EMPTY_VENDOR_FILTER } from "../src/domain/vendor-filter.ts"
import {
  VENDOR_NOTES_REF,
  VendorNotes,
  VendorNotesLive,
  vendorNotePayload
} from "../src/services/vendor-notes.ts"

const withTempWorkspace = async <A>(run: (cwd: string) => Promise<A>): Promise<A> => {
  const cwd = mkdtempSync(join(tmpdir(), "vendor-notes-"))
  try {
    return await run(cwd)
  } finally {
    rmSync(cwd, { force: true, recursive: true })
  }
}

describe("vendor git notes", () => {
  test("serializes non-authoritative vendor metadata as JSON", () => {
    const payload = JSON.parse(
      vendorNotePayload({
        date: "2026-05-13T00:00:00Z",
        filter: EMPTY_VENDOR_FILTER,
        name: "effect",
        prefix: "vendor/effect",
        ref: "main",
        sha: "abc123",
        strategy: "clone-ignore",
        url: "https://github.com/Effect-TS/effect.git"
      })
    )

    expect(payload).toMatchObject({
      schema: "ingraft/v1",
      source: "git-notes",
      vendor: {
        name: "effect",
        prefix: "vendor/effect",
        strategy: "clone-ignore"
      }
    })
  })

  test("writes and reads notes under the vendor notes ref", async () => {
    await withTempWorkspace(async (cwd) => {
      await git.init({ fs: nodeFs, dir: cwd })
      writeFileSync(join(cwd, "README.md"), "hello\n")
      await git.add({ fs: nodeFs, dir: cwd, filepath: "README.md" })
      const oid = await git.commit({
        fs: nodeFs,
        dir: cwd,
        message: "initial",
        author: {
          name: "Vendor Test",
          email: "vendor@example.test"
        }
      })

      const note = "hello note"
      await Effect.runPromise(
        Effect.gen(function* () {
          const vendorNotes = yield* VendorNotes
          yield* vendorNotes.write({ cwd, note, oid })
        }).pipe(Effect.provide(VendorNotesLive))
      )

      const read = await git.readNote({
        fs: nodeFs,
        dir: cwd,
        ref: VENDOR_NOTES_REF,
        oid
      })

      expect(new TextDecoder().decode(read)).toBe(note)
    })
  })
})
