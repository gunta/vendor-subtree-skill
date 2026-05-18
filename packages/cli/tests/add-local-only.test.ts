import { execSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, test } from "bun:test"
import { Effect, Option } from "effect"

import { LiveLayer } from "../src/app/layers.ts"
import { addImpl } from "../src/commands/add.tsx"
import { GitMetadataLive } from "../src/services/git-metadata.ts"
import {
  defaultAddParams,
  initBareUpstream,
  initLocalRepo,
  setForkMode
} from "./helpers/local-vendor-fixture.ts"

const originalCwd = process.cwd()

describe("add --local-only (clone-ignore)", () => {
  test("writes .git/info/exclude, state.json, and produces zero new commits", async () => {
    const cwd = initLocalRepo()
    const upstream = initBareUpstream()
    const headBefore = execSync("git rev-parse HEAD", { cwd }).toString().trim()

    process.chdir(cwd)
    try {
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
    } finally {
      process.chdir(originalCwd)
    }

    const headAfter = execSync("git rev-parse HEAD", { cwd }).toString().trim()
    expect(headAfter).toBe(headBefore)
    expect(existsSync(join(cwd, ".git", "info", "exclude"))).toBe(true)
    expect(readFileSync(join(cwd, ".git", "info", "exclude"), "utf-8")).toContain(
      "# ingraft: clone-ignore begin"
    )
    expect(existsSync(join(cwd, ".git", "ingraft", "state.json"))).toBe(true)
    const state = JSON.parse(
      readFileSync(join(cwd, ".git", "ingraft", "state.json"), "utf-8")
    )
    expect(state.vendors.map((entry: { prefix: string }) => entry.prefix)).toContain(
      "vendor/upstream"
    )
    if (existsSync(join(cwd, ".gitignore"))) {
      expect(readFileSync(join(cwd, ".gitignore"), "utf-8")).not.toContain(
        "# ingraft: clone-ignore begin"
      )
    }
  })

  test("rejects --local-only with --strategy subtree", async () => {
    const cwd = initLocalRepo()
    const upstream = initBareUpstream()

    process.chdir(cwd)
    let exit: Awaited<ReturnType<typeof Effect.runPromiseExit>>
    try {
      exit = await Effect.runPromiseExit(
        addImpl(
          defaultAddParams({
            repo: upstream,
            ref: Option.some("main"),
            strategy: "subtree",
            localOnly: true
          })
        ).pipe(Effect.provide(LiveLayer), Effect.provide(GitMetadataLive))
      )
    } finally {
      process.chdir(originalCwd)
    }

    expect(exit._tag).toBe("Failure")
  })

  test("forkMode=personal makes --local-only the implicit default", async () => {
    const cwd = initLocalRepo()
    const upstream = initBareUpstream()
    setForkMode(cwd, "personal")
    process.chdir(cwd)

    try {
      await Effect.runPromise(
        addImpl(
          defaultAddParams({
            repo: upstream,
            ref: Option.some("main"),
            name: Option.some("upstream"),
            strategy: "clone-ignore",
            localOnly: false
          })
        ).pipe(Effect.provide(LiveLayer), Effect.provide(GitMetadataLive))
      )

      expect(existsSync(join(cwd, ".git", "ingraft", "state.json"))).toBe(true)
      expect(existsSync(join(cwd, ".gitignore"))).toBe(false)
    } finally {
      process.chdir(originalCwd)
    }
  })
})
