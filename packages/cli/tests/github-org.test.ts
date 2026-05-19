import { describe, expect, test } from "bun:test"

import { Effect, Exit } from "effect"

import { RuntimeConfig } from "../src/app/runtime.ts"
import { GitHubCli } from "../src/services/gh.ts"
import { GitHubOrg, GitHubOrgLive, listOrgRepos } from "../src/services/github-org.ts"

const runtime = RuntimeConfig.of({
  argv: ["bun", "vendor.ts"],
  colors: false,
  cwd: "/workspace",
  env: {},
  exit: (code) => Effect.die(`exit ${code}`)
})

const repoListJson = JSON.stringify([
  {
    name: "scratch",
    owner: { login: "gunta" },
    defaultBranchRef: null,
    pushedAt: null,
    primaryLanguage: null,
    isArchived: true,
    isFork: true,
    visibility: "PRIVATE",
    description: null,
    stargazerCount: 3,
    url: "https://github.com/gunta/scratch"
  },
  {
    name: "ingraft",
    owner: { login: "gunta" },
    defaultBranchRef: { name: "main" },
    pushedAt: "2026-05-18T00:00:00Z",
    primaryLanguage: { name: "TypeScript" },
    isArchived: false,
    isFork: false,
    visibility: "PUBLIC",
    description: "context router",
    stargazerCount: 4242,
    url: "https://github.com/gunta/ingraft"
  }
])

const provide = <A, E>(
  eff: Effect.Effect<A, E, GitHubCli | RuntimeConfig>,
  cliImpl: { readonly exec: GitHubCli["Service"]["exec"] }
) =>
  eff.pipe(
    Effect.provideService(GitHubCli, GitHubCli.of(cliImpl)),
    Effect.provideService(RuntimeConfig, runtime)
  )

describe("listOrgRepos", () => {
  test("parses gh repo list JSON into OrgRepository[]", async () => {
    const out = await Effect.runPromise(
      provide(listOrgRepos({ owner: "gunta" }), {
        exec: (args) => {
          expect(args).toEqual([
            "repo",
            "list",
            "gunta",
            "--json",
            "name,owner,defaultBranchRef,pushedAt,primaryLanguage,isArchived,isFork,visibility,description,stargazerCount,url",
            "--limit",
            "1000"
          ])
          return Effect.succeed({ stdout: repoListJson, stderr: "", exitCode: 0 })
        }
      })
    )

    expect(out.length).toBe(2)
    expect(out[0]).toEqual({
      name: "ingraft",
      owner: "gunta",
      defaultBranch: "main",
      pushedAt: "2026-05-18T00:00:00Z",
      primaryLanguage: "TypeScript",
      isArchived: false,
      isFork: false,
      visibility: "public",
      description: "context router",
      stars: 4242,
      url: "https://github.com/gunta/ingraft.git"
    })
    expect(out[1]).toEqual({
      name: "scratch",
      owner: "gunta",
      defaultBranch: null,
      pushedAt: null,
      primaryLanguage: null,
      isArchived: true,
      isFork: true,
      visibility: "private",
      description: null,
      stars: 3,
      url: "https://github.com/gunta/scratch.git"
    })
  })

  test("fails with GitHubCliMissing when gh exec rejects", async () => {
    const exit = await Effect.runPromiseExit(
      provide(listOrgRepos({ owner: "gunta" }), {
        exec: () => Effect.fail({ _tag: "SystemError" } as never)
      })
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain("GitHubCliMissing")
    }
  })

  test("fails with GitHubCliUnauthenticated on auth stderr", async () => {
    const exit = await Effect.runPromiseExit(
      provide(listOrgRepos({ owner: "gunta" }), {
        exec: () =>
          Effect.succeed({
            stdout: "",
            stderr: "error: authentication required. Run gh auth login",
            exitCode: 1
          })
      })
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain("GitHubCliUnauthenticated")
    }
  })

  test("fails with GitHubOrgNotFound on empty result", async () => {
    const exit = await Effect.runPromiseExit(
      provide(listOrgRepos({ owner: "ghost" }), {
        exec: () => Effect.succeed({ stdout: "[]", stderr: "", exitCode: 0 })
      })
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain("GitHubOrgNotFound")
    }
  })

  test("fails with GitHubCliMissing on unparseable gh stdout", async () => {
    const exit = await Effect.runPromiseExit(
      provide(listOrgRepos({ owner: "gunta" }), {
        exec: () => Effect.succeed({ stdout: "not-json", stderr: "", exitCode: 0 })
      })
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain("GitHubCliMissing")
    }
  })

  test("GitHubOrgLive provides listRepos via the GitHubOrg service", async () => {
    const program = Effect.gen(function* () {
      const org = yield* GitHubOrg
      return yield* org.listRepos({ owner: "gunta" })
    })

    const out = await Effect.runPromise(
      program.pipe(
        Effect.provide(GitHubOrgLive),
        Effect.provideService(
          GitHubCli,
          GitHubCli.of({
            exec: () => Effect.succeed({ stdout: repoListJson, stderr: "", exitCode: 0 })
          })
        ),
        Effect.provideService(RuntimeConfig, runtime)
      )
    )

    expect(out.length).toBe(2)
    expect(out[0]?.name).toBe("ingraft")
  })
})
