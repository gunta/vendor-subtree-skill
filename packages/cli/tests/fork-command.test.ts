import { describe, expect, test } from "bun:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Effect, Option } from "effect"

import { prepareForkWorkspace } from "../src/commands/fork.tsx"
import { GitHubCli } from "../src/services/gh.ts"
import { Git } from "../src/services/git.ts"

describe("fork command workspace preparation", () => {
  test("creates a GitHub fork, clones a parallel checkout, and configures remotes", async () => {
    const cwd = "/Users/me/Documents/GitHub/app"
    const cloneRoot = mkdtempSync(join(tmpdir(), "ingraft-fork-root-"))
    const ghCalls: ReadonlyArray<string>[] = []
    const gitCalls: Array<{ readonly args: ReadonlyArray<string>; readonly cwd?: string }> = []

    const prepared = await Effect.runPromise(
      prepareForkWorkspace({
        checkoutRoot: Option.some(cloneRoot),
        cwd,
        owner: Option.none(),
        upstreamInput: "Effect-TS/effect"
      }).pipe(
        Effect.provideService(
          GitHubCli,
          GitHubCli.of({
            exec: (args) => {
              ghCalls.push(args)
              if (args[0] === "api" && args[1] === "user") {
                return Effect.succeed({ stdout: "gunta\n", stderr: "", exitCode: 0 })
              }
              if (args[0] === "repo" && args[1] === "view") {
                return Effect.succeed({ stdout: "", stderr: "not found", exitCode: 1 })
              }
              if (args[0] === "repo" && args[1] === "fork") {
                return Effect.succeed({ stdout: "", stderr: "", exitCode: 0 })
              }
              return Effect.die(`unexpected gh ${args.join(" ")}`)
            }
          })
        ),
        Effect.provideService(
          Git,
          Git.of({
            exec: (args, options) => {
              gitCalls.push(options?.cwd === undefined ? { args } : { args, cwd: options.cwd })
              if (args.join(" ") === "remote get-url upstream") {
                return Effect.succeed({ stdout: "", stderr: "missing", exitCode: 2 })
              }
              return Effect.succeed({ stdout: "", stderr: "", exitCode: 0 })
            }
          })
        )
      )
    )

    expect(prepared).toMatchObject({
      checkoutPath: join(cloneRoot, "Effect-TS", "effect"),
      fork: { owner: "gunta", name: "effect", nameWithOwner: "gunta/effect" },
      forkUrl: "https://github.com/gunta/effect.git",
      route: {
        name: "effect",
        prefix: "vendor/Effect-TS/effect",
        url: "https://github.com/gunta/effect.git"
      },
      upstream: { owner: "Effect-TS", name: "effect", nameWithOwner: "Effect-TS/effect" }
    })
    expect(ghCalls).toContainEqual(["api", "user", "--jq", ".login"])
    expect(ghCalls).toContainEqual([
      "repo",
      "fork",
      "Effect-TS/effect",
      "--clone=false",
      "--remote=false"
    ])
    expect(gitCalls).toContainEqual({
      args: ["clone", "https://github.com/gunta/effect.git", join(cloneRoot, "Effect-TS", "effect")]
    })
    expect(gitCalls).toContainEqual({
      args: ["remote", "add", "upstream", "https://github.com/Effect-TS/effect.git"],
      cwd: join(cloneRoot, "Effect-TS", "effect")
    })
  })
})
