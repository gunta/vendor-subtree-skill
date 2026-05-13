import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs"
import * as nodeFs from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Effect } from "effect"
import * as git from "isomorphic-git"

import { GitMetadata, GitMetadataLive } from "../src/services/git-metadata.ts"

const withTempRepo = async <A>(run: (cwd: string) => Promise<A>): Promise<A> => {
  const cwd = mkdtempSync(join(tmpdir(), "vendor-git-metadata-"))
  try {
    await git.init({ fs: nodeFs, dir: cwd })
    return await run(cwd)
  } finally {
    rmSync(cwd, { force: true, recursive: true })
  }
}

const commitFile = async (cwd: string, filepath: string, content: string) => {
  writeFileSync(join(cwd, filepath), content)
  await git.add({ fs: nodeFs, dir: cwd, filepath })
  await git.commit({
    fs: nodeFs,
    dir: cwd,
    message: `add ${filepath}`,
    author: {
      name: "Vendor Test",
      email: "vendor@example.test"
    }
  })
}

describe("isomorphic-git metadata service", () => {
  test("finds the repository root without shelling out to git", async () => {
    await withTempRepo(async (cwd) => {
      const nested = join(cwd, "packages/cli/src")
      mkdirSync(nested, { recursive: true })

      const root = await Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* GitMetadata
          return yield* svc.findRoot(nested)
        }).pipe(Effect.provide(GitMetadataLive))
      )

      expect(root).toBe(cwd)
    })
  })

  test("lists tracked and untracked project files while respecting .gitignore", async () => {
    await withTempRepo(async (cwd) => {
      mkdirSync(join(cwd, "src"), { recursive: true })
      await commitFile(cwd, ".gitignore", "ignored.js\n")
      await commitFile(cwd, "src/index.ts", "export const value = 1\n")
      writeFileSync(join(cwd, "src/new.js"), "export const next = 2\n")
      writeFileSync(join(cwd, "ignored.js"), "export const ignored = true\n")

      const files = await Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* GitMetadata
          return yield* svc.listProjectFiles(cwd)
        }).pipe(Effect.provide(GitMetadataLive))
      )

      expect(files).toEqual(expect.arrayContaining([".gitignore", "src/index.ts", "src/new.js"]))
      expect(files).not.toContain("ignored.js")
    })
  })

  test("detects paths known to git even after they are deleted from the worktree", async () => {
    await withTempRepo(async (cwd) => {
      await commitFile(cwd, ".gitattributes", "vendor/** linguist-vendored\n")
      unlinkSync(join(cwd, ".gitattributes"))

      const tracked = await Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* GitMetadata
          return yield* svc.pathKnownToGit(cwd, ".gitattributes")
        }).pipe(Effect.provide(GitMetadataLive))
      )
      const missing = await Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* GitMetadata
          return yield* svc.pathKnownToGit(cwd, ".missing")
        }).pipe(Effect.provide(GitMetadataLive))
      )

      expect(tracked).toBe(true)
      expect(missing).toBe(false)
    })
  })
})
