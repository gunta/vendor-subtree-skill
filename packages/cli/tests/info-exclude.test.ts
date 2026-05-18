import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { NodeServices } from "@effect/platform-node"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"

import { updateIgnoreFile } from "../src/project/gitignore.ts"

const makeRepo = () => {
  const cwd = mkdtempSync(join(tmpdir(), "ingraft-info-exclude-"))
  mkdirSync(join(cwd, ".git", "info"), { recursive: true })
  return cwd
}

describe("updateIgnoreFile (info-exclude target)", () => {
  test("writes the sentineled block to .git/info/exclude", async () => {
    const cwd = makeRepo()

    await Effect.runPromise(
      updateIgnoreFile({ cwd, prefixes: ["vendor/effect"], target: "info-exclude" }).pipe(
        Effect.provide(NodeServices.layer)
      )
    )

    const target = join(cwd, ".git", "info", "exclude")
    expect(existsSync(target)).toBe(true)
    expect(readFileSync(target, "utf-8")).toContain("# ingraft: clone-ignore begin")
    expect(readFileSync(target, "utf-8")).toContain("/vendor/effect/")
  })

  test("preserves unrelated content in .git/info/exclude", async () => {
    const cwd = makeRepo()
    const target = join(cwd, ".git", "info", "exclude")
    writeFileSync(target, "# pre-existing comment\nlocal-cache/\n")

    await Effect.runPromise(
      updateIgnoreFile({ cwd, prefixes: ["vendor/zod"], target: "info-exclude" }).pipe(
        Effect.provide(NodeServices.layer)
      )
    )

    const content = readFileSync(target, "utf-8")
    expect(content).toContain("# pre-existing comment")
    expect(content).toContain("local-cache/")
    expect(content).toContain("/vendor/zod/")
  })

  test("removes the block when prefixes is empty", async () => {
    const cwd = makeRepo()

    await Effect.runPromise(
      updateIgnoreFile({ cwd, prefixes: ["vendor/effect"], target: "info-exclude" }).pipe(
        Effect.provide(NodeServices.layer)
      )
    )
    await Effect.runPromise(
      updateIgnoreFile({ cwd, prefixes: [], target: "info-exclude" }).pipe(
        Effect.provide(NodeServices.layer)
      )
    )

    const target = join(cwd, ".git", "info", "exclude")
    if (!existsSync(target)) return
    const content = readFileSync(target, "utf-8")
    expect(content).not.toContain("# ingraft: clone-ignore begin")
  })
})
