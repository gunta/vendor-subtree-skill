import { describe, expect, test } from "bun:test"

import { Effect, Option } from "effect"

import { RuntimeConfig } from "../src/app/runtime.ts"
import { GitHubCli } from "../src/services/gh.ts"
import { GitLabCli } from "../src/services/glab.ts"
import { RepositoryHosts, RepositoryHostsLive } from "../src/services/repository-hosts.ts"

const runtime = RuntimeConfig.of({
  argv: ["bun", "vendor.ts"],
  colors: false,
  cwd: "/workspace",
  exit: (code) => Effect.die(`exit ${code}`)
})

describe("repository hosts", () => {
  test("identifies popular hosted git providers", async () => {
    const hosts = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* RepositoryHosts
        return yield* Effect.all([
          svc.identify("https://github.com/Effect-TS/effect.git"),
          svc.identify("https://gitlab.com/gitlab-org/cli.git"),
          svc.identify("https://bitbucket.org/team/repo.git"),
          svc.identify("https://codeberg.org/forgejo/forgejo.git"),
          svc.identify("https://git.sr.ht/~sircmpwn/git.sr.ht")
        ])
      }).pipe(
        Effect.provide(RepositoryHostsLive),
        Effect.provideService(
          GitHubCli,
          GitHubCli.of({
            exec: () => Effect.die("gh should not run for identify")
          })
        ),
        Effect.provideService(
          GitLabCli,
          GitLabCli.of({
            exec: () => Effect.die("glab should not run for identify")
          })
        )
      )
    )

    expect(hosts.map((host) => Option.getOrUndefined(host)?.kind)).toEqual([
      "github",
      "gitlab",
      "bitbucket",
      "codeberg",
      "sourcehut"
    ])
  })

  test("uses glab for GitLab clone when available", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* RepositoryHosts
        return yield* svc.clone({
          cwd: "/workspace",
          input: "https://gitlab.com/gitlab-org/cli.git",
          target: "vendor/glab"
        })
      }).pipe(
        Effect.provide(RepositoryHostsLive),
        Effect.provideService(
          GitLabCli,
          GitLabCli.of({
            exec: (args, options) => {
              expect(args).toEqual([
                "repo",
                "clone",
                "https://gitlab.com/gitlab-org/cli.git",
                "vendor/glab"
              ])
              expect(options?.cwd).toBe("/workspace")
              return Effect.succeed({ stdout: "", stderr: "", exitCode: 0 })
            }
          })
        ),
        Effect.provideService(
          GitHubCli,
          GitHubCli.of({
            exec: () => Effect.die("gh should not run for GitLab")
          })
        ),
        Effect.provideService(RuntimeConfig, runtime)
      )
    )

    expect(Option.isSome(result)).toBe(true)
  })

  test("uses glab to detect GitLab default branches", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* RepositoryHosts
        return yield* svc.defaultBranch("https://gitlab.com/gitlab-org/cli.git")
      }).pipe(
        Effect.provide(RepositoryHostsLive),
        Effect.provideService(
          GitLabCli,
          GitLabCli.of({
            exec: (args) => {
              expect(args).toEqual([
                "repo",
                "view",
                "https://gitlab.com/gitlab-org/cli.git",
                "--output",
                "json"
              ])
              return Effect.succeed({
                stdout: JSON.stringify({ default_branch: "main" }),
                stderr: "",
                exitCode: 0
              })
            }
          })
        ),
        Effect.provideService(
          GitHubCli,
          GitHubCli.of({
            exec: () => Effect.die("gh should not run for GitLab")
          })
        ),
        Effect.provideService(RuntimeConfig, runtime)
      )
    )

    expect(Option.getOrUndefined(result)).toBe("main")
  })

  test("uses gh to resolve GitHub latest releases", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* RepositoryHosts
        return yield* svc.releaseTag({
          input: "https://github.com/Effect-TS/effect.git",
          release: "latest"
        })
      }).pipe(
        Effect.provide(RepositoryHostsLive),
        Effect.provideService(
          GitHubCli,
          GitHubCli.of({
            exec: (args) => {
              expect(args).toEqual([
                "release",
                "view",
                "--repo",
                "Effect-TS/effect",
                "--json",
                "tagName",
                "--jq",
                ".tagName"
              ])
              return Effect.succeed({ stdout: "v3.21.2\n", stderr: "", exitCode: 0 })
            }
          })
        ),
        Effect.provideService(
          GitLabCli,
          GitLabCli.of({
            exec: () => Effect.die("glab should not run for GitHub")
          })
        ),
        Effect.provideService(RuntimeConfig, runtime)
      )
    )

    expect(Option.getOrUndefined(result)).toBe("v3.21.2")
  })

  test("uses glab to resolve GitLab releases", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* RepositoryHosts
        return yield* svc.releaseTag({
          input: "https://gitlab.com/gitlab-org/cli.git",
          release: "v1.2.3"
        })
      }).pipe(
        Effect.provide(RepositoryHostsLive),
        Effect.provideService(
          GitLabCli,
          GitLabCli.of({
            exec: (args) => {
              expect(args).toEqual([
                "release",
                "view",
                "v1.2.3",
                "--repo",
                "https://gitlab.com/gitlab-org/cli.git",
                "--output",
                "json"
              ])
              return Effect.succeed({
                stdout: JSON.stringify({ tag_name: "v1.2.3" }),
                stderr: "",
                exitCode: 0
              })
            }
          })
        ),
        Effect.provideService(
          GitHubCli,
          GitHubCli.of({
            exec: () => Effect.die("gh should not run for GitLab")
          })
        ),
        Effect.provideService(RuntimeConfig, runtime)
      )
    )

    expect(Option.getOrUndefined(result)).toBe("v1.2.3")
  })
})
