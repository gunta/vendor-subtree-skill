import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { NodeServices } from "@effect/platform-node"
import { Effect } from "effect"

import { effectiveVendorStrategy } from "../src/domain/vendor-strategy.ts"
import { Jujutsu, JujutsuLive } from "../src/services/jujutsu.ts"

const withTempWorkspace = async <A>(run: (cwd: string) => Promise<A>): Promise<A> => {
  const cwd = mkdtempSync(join(tmpdir(), "vendor-jj-"))
  try {
    return await run(cwd)
  } finally {
    rmSync(cwd, { force: true, recursive: true })
  }
}

describe("Jujutsu colocated workspaces", () => {
  test("coerces git-integrated vendoring strategies to clone-ignore", () => {
    expect(effectiveVendorStrategy({ jjColocated: true, requested: "subtree" })).toBe(
      "clone-ignore"
    )
    expect(effectiveVendorStrategy({ jjColocated: true, requested: "submodule" })).toBe(
      "clone-ignore"
    )
    expect(effectiveVendorStrategy({ jjColocated: true, requested: "clone-ignore" })).toBe(
      "clone-ignore"
    )
    expect(effectiveVendorStrategy({ jjColocated: false, requested: "subtree" })).toBe("subtree")
  })

  test("detects a colocated jj workspace from .jj and .git side by side", async () => {
    await withTempWorkspace(async (cwd) => {
      mkdirSync(join(cwd, ".git"), { recursive: true })
      mkdirSync(join(cwd, ".jj/repo/store"), { recursive: true })
      writeFileSync(join(cwd, ".jj/repo/store/git_target"), "../../../.git")

      const detected = await Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* Jujutsu
          return yield* svc.isColocated(cwd)
        }).pipe(Effect.provide(JujutsuLive), Effect.provide(NodeServices.layer))
      )

      expect(detected).toBe(true)
    })
  })

  test("does not detect a plain git workspace as colocated jj", async () => {
    await withTempWorkspace(async (cwd) => {
      mkdirSync(join(cwd, ".git"), { recursive: true })

      const detected = await Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* Jujutsu
          return yield* svc.isColocated(cwd)
        }).pipe(Effect.provide(JujutsuLive), Effect.provide(NodeServices.layer))
      )

      expect(detected).toBe(false)
    })
  })
})
