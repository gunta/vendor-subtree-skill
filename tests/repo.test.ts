import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { inferRepoName, normalizeRepoUrl } from "../src/repo.ts"

describe("repo parsing", () => {
  test("normalizes GitHub shorthand to an HTTPS git URL", () => {
    expect(normalizeRepoUrl("Effect-TS/effect")).toBe(
      "https://github.com/Effect-TS/effect.git"
    )
  })

  test("leaves full URLs untouched", () => {
    expect(normalizeRepoUrl("git@github.com:Effect-TS/effect.git")).toBe(
      "git@github.com:Effect-TS/effect.git"
    )
  })

  test("infers names from HTTPS and SSH git URLs", async () => {
    await expect(
      Effect.runPromise(inferRepoName("https://github.com/Effect-TS/effect.git"))
    ).resolves.toBe("effect")

    await expect(
      Effect.runPromise(inferRepoName("git@github.com:Effect-TS/effect.git"))
    ).resolves.toBe("effect")
  })

  test("fails with a tagged error when a repo name cannot be inferred", async () => {
    const failure = await Effect.runPromise(
      inferRepoName("https://github.com/").pipe(Effect.flip)
    )

    expect(failure._tag).toBe("RepoNameInferenceFailed")
  })
})
