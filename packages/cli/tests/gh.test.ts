import { describe, expect, test } from "bun:test"

import { Effect, Option } from "effect"

import { RuntimeConfig } from "../src/app/runtime.ts"
import { GitHubCli, ghRepoCloneFromInput } from "../src/services/gh.ts"

const runtime = RuntimeConfig.of({
  argv: ["bun", "vendor.ts"],
  colors: false,
  cwd: "/workspace",
  exit: (code) => Effect.die(`exit ${code}`)
})

describe("GitHub CLI service", () => {
  test("clones GitHub repos through gh", async () => {
    const result = await Effect.runPromise(
      ghRepoCloneFromInput({
        cwd: "/workspace",
        input: "https://github.com/Effect-TS/effect.git",
        target: "vendor/effect"
      }).pipe(
        Effect.provideService(
          GitHubCli,
          GitHubCli.of({
            exec: (args, options) => {
              expect(args).toEqual(["repo", "clone", "Effect-TS/effect", "vendor/effect"])
              expect(options?.cwd).toBe("/workspace")
              return Effect.succeed({ stdout: "", stderr: "", exitCode: 0 })
            }
          })
        ),
        Effect.provideService(RuntimeConfig, runtime)
      )
    )

    expect(Option.isSome(result)).toBe(true)
  })

  test("skips gh for non-GitHub repos", async () => {
    const result = await Effect.runPromise(
      ghRepoCloneFromInput({
        cwd: "/workspace",
        input: "https://example.com/org/repo.git",
        target: "vendor/repo"
      }).pipe(
        Effect.provideService(
          GitHubCli,
          GitHubCli.of({
            exec: () => Effect.die("gh should not run")
          })
        ),
        Effect.provideService(RuntimeConfig, runtime)
      )
    )

    expect(Option.isNone(result)).toBe(true)
  })
})
