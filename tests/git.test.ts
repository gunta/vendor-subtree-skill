import { describe, expect, test } from "bun:test"
import { Effect, Option } from "effect"
import { Git, detectDefaultBranch } from "../src/git.ts"
import { RuntimeConfig } from "../src/runtime.ts"

describe("git service", () => {
  test("detects a default branch through an injectable Git service", async () => {
    const runtime = RuntimeConfig.make({
      argv: ["bun", "vendor.ts"],
      colors: false,
      cwd: "/workspace",
      exit: (code) => Effect.dieMessage(`exit ${code}`)
    })

    const result = await Effect.runPromise(
      detectDefaultBranch("https://example.com/repo.git").pipe(
        Effect.provideService(
          Git,
          Git.make({
            exec: (args) => {
              expect(args).toEqual([
                "ls-remote",
                "--symref",
                "https://example.com/repo.git",
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
        Effect.provideService(RuntimeConfig, runtime)
      )
    )

    expect(Option.getOrUndefined(result)).toBe("trunk")
  })
})
