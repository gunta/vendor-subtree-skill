import { describe, expect, test } from "bun:test"
import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { Effect, Option } from "effect"

import { LiveLayer } from "../src/app/layers.ts"
import { addImpl } from "../src/commands/add.tsx"
import { selectUpdateTargets } from "../src/commands/update.tsx"
import { updateImpl } from "../src/commands/update.tsx"
import { EMPTY_VENDOR_FILTER } from "../src/domain/vendor-filter.ts"
import type { VendoredRepo } from "../src/domain/vendor-state.ts"
import { GitMetadataLive } from "../src/services/git-metadata.ts"
import {
  advanceUpstream,
  defaultAddParams,
  initBareUpstream,
  initLocalRepo
} from "./helpers/local-vendor-fixture.ts"

const repo = {
  name: "effect",
  prefix: "vendor/effect",
  url: "https://github.com/Effect-TS/effect.git",
  ref: "main",
  strategy: "subtree",
  filter: EMPTY_VENDOR_FILTER,
  sha: "sha",
  date: "date"
} satisfies VendoredRepo

describe("update target selection", () => {
  test("selects every repo when no target is provided", async () => {
    const targets = await Effect.runPromise(
      selectUpdateTargets({ name: Option.none(), repos: [repo] })
    )

    expect(Option.getOrUndefined(targets)).toEqual([repo])
  })

  test("returns none when no target is provided and no repos exist", async () => {
    const targets = await Effect.runPromise(selectUpdateTargets({ name: Option.none(), repos: [] }))

    expect(Option.isNone(targets)).toBe(true)
  })

  test("fails with a tagged error when the repo is not found", async () => {
    const failure = await Effect.runPromise(
      selectUpdateTargets({
        name: Option.some("missing"),
        repos: [repo]
      }).pipe(Effect.flip)
    )

    expect(failure._tag).toBe("VendoredRepoNotFound")
  })
})

test("updating a local-only entry does not create a commit and advances resolvedRef in state.json", async () => {
  const cwd = initLocalRepo()
  const upstream = initBareUpstream()

  const originalCwd = process.cwd()
  process.chdir(cwd)
  try {
    await Effect.runPromise(
      addImpl(
        defaultAddParams({
          repo: upstream,
          ref: Option.some("main"),
          name: Option.some("upstream"),
          strategy: "clone-ignore",
          localOnly: true,
          prefix: Option.some("vendor/upstream")
        })
      ).pipe(Effect.provide(LiveLayer), Effect.provide(GitMetadataLive))
    )

    const headBefore = execSync("git rev-parse HEAD", { cwd }).toString().trim()
    const stateBefore = JSON.parse(
      readFileSync(join(cwd, ".git", "ingraft", "state.json"), "utf-8")
    )
    const resolvedBefore = stateBefore.vendors[0].resolvedRef
    expect(resolvedBefore).toBeDefined()

    advanceUpstream(upstream, "README.md", "hello updated\n")

    await Effect.runPromise(
      updateImpl({ name: Option.some("upstream") }).pipe(
        Effect.provide(LiveLayer),
        Effect.provide(GitMetadataLive)
      )
    )

    const headAfter = execSync("git rev-parse HEAD", { cwd }).toString().trim()
    expect(headAfter).toBe(headBefore)
    const stateAfter = JSON.parse(readFileSync(join(cwd, ".git", "ingraft", "state.json"), "utf-8"))
    expect(stateAfter.vendors[0].resolvedRef).not.toBe(resolvedBefore)
  } finally {
    process.chdir(originalCwd)
  }
})
