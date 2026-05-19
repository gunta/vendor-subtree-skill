import { describe, expect, test } from "bun:test"

import { Effect } from "effect"

import { RuntimeConfig } from "../src/app/runtime.ts"
import { GitHubCli } from "../src/services/gh.ts"
import {
  GitHubSearch,
  GitHubSearchLive,
  searchGitHubSuggestions
} from "../src/services/github-search.ts"

const runtime = RuntimeConfig.of({
  argv: ["bun", "vendor.ts"],
  colors: false,
  cwd: "/workspace",
  env: {},
  exit: (code) => Effect.die(`exit ${code}`)
})

const repoSearchJson = JSON.stringify([
  {
    description: "Composable source context",
    fullName: "gunta/confect",
    stargazersCount: 93,
    url: "https://github.com/gunta/confect",
    visibility: "PUBLIC"
  }
])

const orgSearchJson = JSON.stringify({
  items: [
    {
      html_url: "https://github.com/get-convex",
      login: "get-convex",
      type: "Organization"
    }
  ]
})

const provide = <A, E>(
  eff: Effect.Effect<A, E, GitHubCli | RuntimeConfig>,
  cliImpl: { readonly exec: GitHubCli["Service"]["exec"] }
) =>
  eff.pipe(
    Effect.provideService(GitHubCli, GitHubCli.of(cliImpl)),
    Effect.provideService(RuntimeConfig, runtime)
  )

describe("GitHub search autocomplete", () => {
  test("searches repositories and organizations through gh", async () => {
    const calls: Array<ReadonlyArray<string>> = []
    const suggestions = await Effect.runPromise(
      provide(searchGitHubSuggestions({ limit: 4, query: "confect" }), {
        exec: (args) => {
          calls.push(args)
          if (args[0] === "search") {
            return Effect.succeed({ exitCode: 0, stderr: "", stdout: repoSearchJson })
          }
          return Effect.succeed({ exitCode: 0, stderr: "", stdout: orgSearchJson })
        }
      })
    )

    expect(calls).toEqual([
      [
        "search",
        "repos",
        "confect",
        "--json",
        "fullName,description,stargazersCount,url,visibility",
        "--limit",
        "4",
        "--sort",
        "stars",
        "--order",
        "desc"
      ],
      [
        "api",
        "--method",
        "GET",
        "search/users",
        "-f",
        "q=confect type:org",
        "-f",
        "per_page=4",
        "-f",
        "sort=followers",
        "-f",
        "order=desc"
      ]
    ])
    expect(suggestions).toEqual([
      {
        detail: "93 stars public - Composable source context",
        kind: "repo",
        label: "gunta/confect",
        value: "gunta/confect"
      },
      {
        detail: "organization",
        kind: "org",
        label: "get-convex",
        value: "org:get-convex"
      }
    ])
  })

  test("GitHubSearchLive exposes the suggestion search service", async () => {
    const program = Effect.gen(function* () {
      const search = yield* GitHubSearch
      return yield* search.suggestions({ limit: 3, query: "convex" })
    })

    const out = await Effect.runPromise(
      program.pipe(
        Effect.provide(GitHubSearchLive),
        Effect.provideService(
          GitHubCli,
          GitHubCli.of({
            exec: (args) =>
              Effect.succeed({
                exitCode: 0,
                stderr: "",
                stdout: args[0] === "search" ? repoSearchJson : orgSearchJson
              })
          })
        ),
        Effect.provideService(RuntimeConfig, runtime)
      )
    )

    expect(out.map((suggestion) => suggestion.value)).toEqual(["gunta/confect", "org:get-convex"])
  })
})
