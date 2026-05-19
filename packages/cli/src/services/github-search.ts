import { Context, Effect, Layer } from "effect"

import { GitHubCliMissing, GitHubCliUnauthenticated } from "../domain/errors.ts"
import { GitHubCli } from "./gh.ts"

export type GitHubSuggestionKind = "repo" | "org"

export interface GitHubSuggestion {
  readonly detail: string
  readonly kind: GitHubSuggestionKind
  readonly label: string
  readonly value: string
}

export interface GitHubSearchParams {
  readonly limit?: number
  readonly query: string
}

interface RawRepoSearchItem {
  readonly description: string | null
  readonly fullName: string
  readonly stargazersCount: number
  readonly url: string
  readonly visibility: string
}

interface RawUserSearchItem {
  readonly html_url: string
  readonly login: string
  readonly type: string
}

interface RawUserSearchResponse {
  readonly items: ReadonlyArray<RawUserSearchItem>
}

const REPO_SEARCH_FIELDS = ["fullName", "description", "stargazersCount", "url", "visibility"].join(
  ","
)

const defaultLimit = 5

const isAuthError = (stderr: string): boolean => {
  const lower = stderr.toLowerCase()
  return lower.includes("authentication") || lower.includes("gh auth login")
}

const formatCount = (value: number): string =>
  Math.trunc(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")

const starLabel = (stars: number): string =>
  stars === 1 ? "1 star" : `${formatCount(stars)} stars`

const parseJson = <A>(stdout: string): Effect.Effect<A, GitHubCliMissing> =>
  Effect.try({
    try: () => JSON.parse(stdout) as A,
    catch: (cause) => new GitHubCliMissing({ cause })
  })

const failForNonZero = (stderr: string) =>
  isAuthError(stderr)
    ? new GitHubCliUnauthenticated({ output: stderr })
    : new GitHubCliMissing({ cause: stderr })

const repoSuggestion = (raw: RawRepoSearchItem): GitHubSuggestion => {
  const visibility = raw.visibility.toLowerCase()
  const suffix =
    raw.description === null || raw.description.trim().length === 0
      ? ""
      : ` - ${raw.description.trim()}`
  return {
    detail: `${starLabel(raw.stargazersCount)} ${visibility}${suffix}`,
    kind: "repo",
    label: raw.fullName,
    value: raw.fullName
  }
}

const orgSuggestion = (raw: RawUserSearchItem): GitHubSuggestion => ({
  detail: "organization",
  kind: "org",
  label: raw.login,
  value: `org:${raw.login}`
})

const searchRepositories = ({ limit, query }: Required<GitHubSearchParams>) =>
  Effect.gen(function* () {
    const gh = yield* GitHubCli
    const result = yield* gh
      .exec([
        "search",
        "repos",
        query,
        "--json",
        REPO_SEARCH_FIELDS,
        "--limit",
        String(limit),
        "--sort",
        "stars",
        "--order",
        "desc"
      ])
      .pipe(Effect.catch((cause) => Effect.fail(new GitHubCliMissing({ cause }))))
    if (result.exitCode !== 0) return yield* Effect.fail(failForNonZero(result.stderr))
    const parsed = yield* parseJson<ReadonlyArray<RawRepoSearchItem>>(result.stdout)
    return parsed.map(repoSuggestion)
  })

const searchOrganizations = ({ limit, query }: Required<GitHubSearchParams>) =>
  Effect.gen(function* () {
    const gh = yield* GitHubCli
    const result = yield* gh
      .exec([
        "api",
        "--method",
        "GET",
        "search/users",
        "-f",
        `q=${query} type:org`,
        "-f",
        `per_page=${limit}`,
        "-f",
        "sort=followers",
        "-f",
        "order=desc"
      ])
      .pipe(Effect.catch((cause) => Effect.fail(new GitHubCliMissing({ cause }))))
    if (result.exitCode !== 0) return yield* Effect.fail(failForNonZero(result.stderr))
    const parsed = yield* parseJson<RawUserSearchResponse>(result.stdout)
    return parsed.items.filter((item) => item.type === "Organization").map(orgSuggestion)
  })

export const searchGitHubSuggestions = ({ limit = defaultLimit, query }: GitHubSearchParams) =>
  Effect.gen(function* () {
    const trimmed = query.trim()
    if (trimmed.length === 0) return []
    const params = { limit, query: trimmed }
    const [repos, orgs] = yield* Effect.all(
      [searchRepositories(params), searchOrganizations(params)],
      {
        concurrency: 1
      }
    )
    return [...repos, ...orgs]
  })

export interface GitHubSearchShape {
  readonly suggestions: (
    params: GitHubSearchParams
  ) => Effect.Effect<
    ReadonlyArray<GitHubSuggestion>,
    GitHubCliMissing | GitHubCliUnauthenticated,
    GitHubCli
  >
}

export class GitHubSearch extends Context.Service<GitHubSearch, GitHubSearchShape>()(
  "ingraft/GitHubSearch"
) {}

export const GitHubSearchLive = Layer.sync(GitHubSearch, () => ({
  suggestions: Effect.fn("GitHubSearch.suggestions")(searchGitHubSuggestions)
}))
