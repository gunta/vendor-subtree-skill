import * as nodeFs from "node:fs"

import { Context, Effect, Layer } from "effect"
import * as git from "isomorphic-git"

import { VendorNotesFailed } from "../domain/errors.ts"
import type { VendoredRepo } from "../domain/vendor-state.ts"

export const VENDOR_NOTES_REF = "refs/notes/ingraft"

export interface WriteVendorNoteParams {
  readonly cwd: string
  readonly note: string
  readonly oid: string
}

export interface SyncVendorNotesParams {
  readonly cwd: string
  readonly repos: ReadonlyArray<VendoredRepo>
}

export const vendorNotePayload = (repo: VendoredRepo): string =>
  JSON.stringify(
    {
      schema: "ingraft/v1",
      source: "git-notes",
      vendor: {
        date: repo.date,
        filter: repo.filter,
        name: repo.name,
        prefix: repo.prefix,
        ref: repo.ref,
        sha: repo.sha,
        strategy: repo.strategy,
        syncPackage: repo.syncPackage ?? null,
        url: repo.url
      }
    },
    null,
    2
  )

const readNote = ({ cwd, oid }: Omit<WriteVendorNoteParams, "note">) =>
  Effect.tryPromise({
    try: async () => {
      const note = await git.readNote({
        fs: nodeFs,
        dir: cwd,
        ref: VENDOR_NOTES_REF,
        oid
      })
      return new TextDecoder().decode(note)
    },
    catch: (cause) => new VendorNotesFailed({ operation: "read", cwd, oid, cause })
  })

const write = ({ cwd, note, oid }: WriteVendorNoteParams) =>
  readNote({ cwd, oid }).pipe(
    Effect.catch(() => Effect.succeed("")),
    Effect.flatMap((current) =>
      current === note
        ? Effect.void
        : Effect.tryPromise({
            try: () =>
              git.addNote({
                fs: nodeFs,
                dir: cwd,
                ref: VENDOR_NOTES_REF,
                oid,
                note,
                force: true,
                author: {
                  name: "ingraft",
                  email: "ingraft@example.invalid"
                }
              }),
            catch: (cause) => new VendorNotesFailed({ operation: "write", cwd, oid, cause })
          }).pipe(Effect.asVoid)
    )
  )

const sync = ({ cwd, repos }: SyncVendorNotesParams): Effect.Effect<void, never> =>
  Effect.forEach(
    repos,
    (repo) =>
      write({ cwd, oid: repo.sha, note: vendorNotePayload(repo) }).pipe(
        Effect.catch((error) =>
          Effect.logDebug(`Could not write vendor git note: ${String(error)}`)
        )
      ),
    { discard: true }
  )

export interface VendorNotesShape {
  readonly sync: (params: SyncVendorNotesParams) => Effect.Effect<void, never>
  readonly write: (params: WriteVendorNoteParams) => Effect.Effect<void, VendorNotesFailed>
}

export class VendorNotes extends Context.Service<VendorNotes, VendorNotesShape>()(
  "ingraft/VendorNotes"
) {}

export const VendorNotesLive = Layer.sync(VendorNotes, () => ({
  sync,
  write
}))
