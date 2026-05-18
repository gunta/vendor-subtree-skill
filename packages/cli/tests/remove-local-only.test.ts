import { execSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { Effect, Option } from "effect"

import { LiveLayer } from "../src/app/layers.ts"
import { GitMetadataLive } from "../src/services/git-metadata.ts"
import { addImpl } from "../src/commands/add.tsx"
import { removeImpl } from "../src/commands/remove.tsx"
import {
  defaultAddParams,
  initBareUpstream,
  initLocalRepo
} from "./helpers/local-vendor-fixture.ts"

describe("remove --local-only", () => {
  let originalCwd: string

  beforeEach(() => {
    originalCwd = process.cwd()
  })

  afterEach(() => {
    process.chdir(originalCwd)
  })

  test("removing a local-only entry does not create a commit and clears state.json", async () => {
    const cwd = initLocalRepo()
    const upstream = initBareUpstream()
    process.chdir(cwd)

    await Effect.runPromise(
      addImpl(
        defaultAddParams({
          repo: upstream,
          ref: Option.some("main"),
          name: Option.some("upstream"),
          strategy: "clone-ignore",
          localOnly: true
        })
      ).pipe(Effect.provide(LiveLayer), Effect.provide(GitMetadataLive))
    )

    const headBefore = execSync("git rev-parse HEAD", { cwd }).toString().trim()
    expect(existsSync(join(cwd, "vendor", "upstream"))).toBe(true)

    await Effect.runPromise(
      removeImpl({ name: "upstream", dangerouslyRewriteHistory: false }).pipe(
        Effect.provide(LiveLayer),
        Effect.provide(GitMetadataLive)
      )
    )

    const headAfter = execSync("git rev-parse HEAD", { cwd }).toString().trim()
    expect(headAfter).toBe(headBefore)
    expect(existsSync(join(cwd, "vendor", "upstream"))).toBe(false)

    const statePath = join(cwd, ".git", "ingraft", "state.json")
    if (existsSync(statePath)) {
      const state = JSON.parse(readFileSync(statePath, "utf-8"))
      expect(state.vendors).toEqual([])
    }

    // .git/info/exclude should no longer contain the ingraft block for vendor/upstream
    const excludePath = join(cwd, ".git", "info", "exclude")
    if (existsSync(excludePath)) {
      expect(readFileSync(excludePath, "utf-8")).not.toContain("vendor/upstream")
    }
  })
})
