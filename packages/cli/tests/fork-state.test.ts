import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { Effect } from "effect"

import {
  readForkWorkspaceState,
  removeForkWorkspaceEntry,
  upsertForkWorkspaceEntry
} from "../src/domain/fork-state.ts"
import { initLocalRepo } from "./helpers/local-vendor-fixture.ts"

describe("fork workspace state", () => {
  test("writes fork workspace metadata under .git/ingraft/forks.json", async () => {
    const cwd = initLocalRepo()
    await Effect.runPromise(
      upsertForkWorkspaceEntry({
        cwd,
        entry: {
          checkoutPath: join(cwd, "..", "forked", "Effect-TS", "effect"),
          fork: "gunta/effect",
          forkUrl: "https://github.com/gunta/effect.git",
          name: "effect",
          prefix: "vendor/Effect-TS/effect",
          updatedAt: "2026-05-19T00:00:00.000Z",
          upstream: "Effect-TS/effect",
          upstreamUrl: "https://github.com/Effect-TS/effect.git"
        }
      })
    )

    const file = join(cwd, ".git", "ingraft", "forks.json")
    expect(existsSync(file)).toBe(true)
    const raw = JSON.parse(readFileSync(file, "utf-8"))
    expect(raw.version).toBe(1)
    expect(raw.forks[0].fork).toBe("gunta/effect")

    const entries = await Effect.runPromise(readForkWorkspaceState({ cwd }))
    expect(entries).toHaveLength(1)
    expect(entries[0]?.prefix).toBe("vendor/Effect-TS/effect")
  })

  test("upserts by route name and removes the state file when empty", async () => {
    const cwd = initLocalRepo()
    const base = {
      checkoutPath: join(cwd, "..", "forked", "Effect-TS", "effect"),
      fork: "gunta/effect",
      forkUrl: "https://github.com/gunta/effect.git",
      name: "effect",
      prefix: "vendor/Effect-TS/effect",
      updatedAt: "2026-05-19T00:00:00.000Z",
      upstream: "Effect-TS/effect",
      upstreamUrl: "https://github.com/Effect-TS/effect.git"
    }

    await Effect.runPromise(upsertForkWorkspaceEntry({ cwd, entry: base }))
    await Effect.runPromise(
      upsertForkWorkspaceEntry({
        cwd,
        entry: { ...base, checkoutPath: join(cwd, "..", "forked", "copy") }
      })
    )

    expect(await Effect.runPromise(readForkWorkspaceState({ cwd }))).toHaveLength(1)

    await Effect.runPromise(removeForkWorkspaceEntry({ cwd, name: "effect" }))
    expect(existsSync(join(cwd, ".git", "ingraft", "forks.json"))).toBe(false)
  })
})
