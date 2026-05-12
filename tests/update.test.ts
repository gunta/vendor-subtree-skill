import { describe, expect, test } from "bun:test"
import { Effect, Option } from "effect"
import { selectUpdateTargets } from "../src/commands/update.ts"
import type { VendoredRepo } from "../src/vendor-state.ts"

const repo = {
  name: "effect",
  prefix: "vendor/effect",
  url: "https://github.com/Effect-TS/effect.git",
  ref: "main",
  sha: "sha",
  date: "date"
} satisfies VendoredRepo

describe("update target selection", () => {
  test("selects every repo for --all", async () => {
    const targets = await Effect.runPromise(
      selectUpdateTargets({ all: true, name: Option.none(), repos: [repo] })
    )

    expect(Option.getOrUndefined(targets)).toEqual([repo])
  })

  test("returns none when --all has no repos", async () => {
    const targets = await Effect.runPromise(
      selectUpdateTargets({ all: true, name: Option.none(), repos: [] })
    )

    expect(Option.isNone(targets)).toBe(true)
  })

  test("fails with a tagged error when no target is provided", async () => {
    const failure = await Effect.runPromise(
      selectUpdateTargets({
        all: false,
        name: Option.none(),
        repos: [repo]
      }).pipe(Effect.flip)
    )

    expect(failure._tag).toBe("UpdateTargetMissing")
  })

  test("fails with a tagged error when the repo is not found", async () => {
    const failure = await Effect.runPromise(
      selectUpdateTargets({
        all: false,
        name: Option.some("missing"),
        repos: [repo]
      }).pipe(Effect.flip)
    )

    expect(failure._tag).toBe("VendoredRepoNotFound")
  })
})
