import { describe, expect, test } from "bun:test"

import { Effect, Option } from "effect"

import { RuntimeConfig } from "../src/app/runtime.ts"
import { Git, detectDefaultBranch } from "../src/services/git.ts"
import { RepositoryHosts } from "../src/services/repository-hosts.ts"

describe("git service", () => {
  test("detects a default branch through an injectable Git service", async () => {
    const runtime = RuntimeConfig.of({
      argv: ["bun", "vendor.ts"],
      colors: false,
      cwd: "/workspace",
      exit: (code) => Effect.die(`exit ${code}`)
    })

    const result = await Effect.runPromise(
      detectDefaultBranch("https://github.com/Effect-TS/effect.git").pipe(
        Effect.provideService(
          Git,
          Git.of({
            exec: (args) => {
              expect(args).toEqual([
                "ls-remote",
                "--symref",
                "https://github.com/Effect-TS/effect.git",
                "HEAD"
              ])
              return Effect.succeed({
                stdout: "ref: refs/heads/trunk\tHEAD\n",
                stderr: "",
                exitCode: 0
              })
            }
          })
        ),
        Effect.provideService(
          RepositoryHosts,
          RepositoryHosts.of({
            clone: () => Effect.succeed(Option.none()),
            defaultBranch: () => Effect.succeed(Option.none()),
            identify: () => Effect.succeed(Option.none()),
            releaseTag: () => Effect.succeed(Option.none())
          })
        ),
        Effect.provideService(RuntimeConfig, runtime)
      )
    )

    expect(Option.getOrUndefined(result)).toBe("trunk")
  })

  test("uses repository host default branch before git fallback", async () => {
    const runtime = RuntimeConfig.of({
      argv: ["bun", "vendor.ts"],
      colors: false,
      cwd: "/workspace",
      exit: (code) => Effect.die(`exit ${code}`)
    })

    const result = await Effect.runPromise(
      detectDefaultBranch("https://github.com/Effect-TS/effect.git").pipe(
        Effect.provideService(
          Git,
          Git.of({
            exec: () => Effect.die("git fallback should not run")
          })
        ),
        Effect.provideService(
          RepositoryHosts,
          RepositoryHosts.of({
            clone: () => Effect.succeed(Option.none()),
            defaultBranch: () => Effect.succeed(Option.some("main")),
            identify: () => Effect.succeed(Option.none()),
            releaseTag: () => Effect.succeed(Option.none())
          })
        ),
        Effect.provideService(RuntimeConfig, runtime)
      )
    )

    expect(Option.getOrUndefined(result)).toBe("main")
  })
})
