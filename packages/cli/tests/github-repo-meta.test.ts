import { describe, expect, test } from "bun:test"
import { Effect, Option } from "effect"

import { RuntimeConfig } from "../src/app/runtime.ts"
import { GitHubCli } from "../src/services/gh.ts"
import {
  classifyRepo,
  fetchRepoMeta,
  fetchUserIdentity,
  type RepoTypeInput
} from "../src/services/github-repo-meta.ts"
import type { RepoMeta, UserIdentity } from "../src/services/local-state.ts"

const runtime = RuntimeConfig.of({
  argv: ["bun", "vendor.ts"],
  colors: false,
  cwd: "/workspace",
  env: {},
  exit: (code) => Effect.die(`exit ${code}`)
})

const user: UserIdentity = {
  schemaVersion: 1,
  fetchedAt: "2026-05-19T00:00:00Z",
  login: "gunta",
  orgs: ["g-productions-studio", "ai-driven-office"]
}

describe("classifyRepo", () => {
  test("returns own when owner equals user.login", () => {
    const input: RepoTypeInput = {
      url: "https://github.com/gunta/ingraft.git",
      user,
      meta: Option.none()
    }
    expect(classifyRepo(input)).toBe("own")
  })

  test("returns own when owner is in user.orgs", () => {
    const input: RepoTypeInput = {
      url: "https://github.com/g-productions-studio/site.git",
      user,
      meta: Option.none()
    }
    expect(classifyRepo(input)).toBe("own")
  })

  test("returns fork when not own and meta.isFork = true", () => {
    const meta: RepoMeta = {
      fetchedAt: "2026-05-19T00:00:00Z",
      isFork: true,
      parent: "Effect-TS/effect",
      owner: "facebook",
      visibility: "public"
    }
    const input: RepoTypeInput = {
      url: "https://github.com/facebook/effect.git",
      user,
      meta: Option.some(meta)
    }
    expect(classifyRepo(input)).toBe("fork")
  })

  test("returns upstream when not own and meta.isFork = false", () => {
    const meta: RepoMeta = {
      fetchedAt: "2026-05-19T00:00:00Z",
      isFork: false,
      parent: null,
      owner: "Effect-TS",
      visibility: "public"
    }
    const input: RepoTypeInput = {
      url: "https://github.com/Effect-TS/effect.git",
      user,
      meta: Option.some(meta)
    }
    expect(classifyRepo(input)).toBe("upstream")
  })

  test("returns unknown when meta is missing and not own", () => {
    const input: RepoTypeInput = {
      url: "https://github.com/Effect-TS/effect.git",
      user,
      meta: Option.none()
    }
    expect(classifyRepo(input)).toBe("unknown")
  })

  test("returns non-github for non-github hosts", () => {
    const input: RepoTypeInput = {
      url: "https://gitlab.com/foo/bar.git",
      user,
      meta: Option.none()
    }
    expect(classifyRepo(input)).toBe("non-github")
  })
})

describe("fetchUserIdentity", () => {
  test("merges gh api user + gh api user/orgs into UserIdentity", async () => {
    const result = await Effect.runPromise(
      fetchUserIdentity().pipe(
        Effect.provideService(
          GitHubCli,
          GitHubCli.of({
            exec: (args) => {
              if (args[0] === "api" && args[1] === "user") {
                return Effect.succeed({
                  stdout: JSON.stringify({ login: "gunta" }),
                  stderr: "",
                  exitCode: 0
                })
              }
              if (args[0] === "api" && args[1] === "user/orgs") {
                return Effect.succeed({
                  stdout: JSON.stringify([{ login: "g-productions-studio" }]),
                  stderr: "",
                  exitCode: 0
                })
              }
              return Effect.die(`unexpected gh call: ${args.join(" ")}`)
            }
          })
        ),
        Effect.provideService(RuntimeConfig, runtime)
      )
    )

    expect(result.login).toBe("gunta")
    expect(result.orgs).toEqual(["g-productions-studio"])
  })
})

describe("fetchRepoMeta", () => {
  test("parses gh repo view JSON into RepoMeta", async () => {
    const result = await Effect.runPromise(
      fetchRepoMeta({ ownerName: "gunta/effect" }).pipe(
        Effect.provideService(
          GitHubCli,
          GitHubCli.of({
            exec: (args) => {
              expect(args).toEqual([
                "repo",
                "view",
                "gunta/effect",
                "--json",
                "isFork,parent,visibility,owner"
              ])
              return Effect.succeed({
                stdout: JSON.stringify({
                  isFork: true,
                  parent: { nameWithOwner: "Effect-TS/effect" },
                  visibility: "PUBLIC",
                  owner: { login: "gunta" }
                }),
                stderr: "",
                exitCode: 0
              })
            }
          })
        ),
        Effect.provideService(RuntimeConfig, runtime)
      )
    )

    expect(result.isFork).toBe(true)
    expect(result.parent).toBe("Effect-TS/effect")
    expect(result.owner).toBe("gunta")
    expect(result.visibility).toBe("public")
  })
})
