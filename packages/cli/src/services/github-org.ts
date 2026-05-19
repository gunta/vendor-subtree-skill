import { Context, Effect, Layer } from "effect"

import { GitHubCliMissing, GitHubCliUnauthenticated, GitHubOrgNotFound } from "../domain/errors.ts"
import { sortOrgReposByStars } from "../domain/org-sort.ts"
import { GitHubCli } from "./gh.ts"
import type { OrgRepository } from "./local-state.ts"

export { sortOrgReposByStars } from "../domain/org-sort.ts"

interface RawRepo {
  readonly name: string
  readonly owner: { readonly login: string }
  readonly defaultBranchRef: { readonly name: string } | null
  readonly pushedAt: string | null
  readonly primaryLanguage: { readonly name: string } | null
  readonly isArchived: boolean
  readonly isFork: boolean
  readonly visibility: string
  readonly description: string | null
  readonly stargazerCount: number
  readonly url: string
}

const FIELDS = [
  "name",
  "owner",
  "defaultBranchRef",
  "pushedAt",
  "primaryLanguage",
  "isArchived",
  "isFork",
  "visibility",
  "description",
  "stargazerCount",
  "url"
].join(",")

// `gh repo list` supports up to 1000 in a single page; orgs larger than this
// need pagination, which is out of scope for v1.
const HARD_LIMIT = 1000

const isAuthError = (stderr: string): boolean => {
  const lower = stderr.toLowerCase()
  return lower.includes("authentication") || lower.includes("gh auth login")
}

const normalizeUrl = (url: string): string => (url.endsWith(".git") ? url : `${url}.git`)

const parseRawRepo = (raw: RawRepo): OrgRepository => ({
  name: raw.name,
  owner: raw.owner.login,
  defaultBranch: raw.defaultBranchRef?.name ?? null,
  pushedAt: raw.pushedAt,
  primaryLanguage: raw.primaryLanguage?.name ?? null,
  isArchived: raw.isArchived,
  isFork: raw.isFork,
  visibility: raw.visibility.toLowerCase(),
  description: raw.description,
  stars: raw.stargazerCount,
  url: normalizeUrl(raw.url)
})

export const listOrgRepos = ({ owner }: { readonly owner: string }) =>
  Effect.gen(function* () {
    const gh = yield* GitHubCli
    const result = yield* gh
      .exec(["repo", "list", owner, "--json", FIELDS, "--limit", String(HARD_LIMIT)])
      .pipe(Effect.catch((cause) => Effect.fail(new GitHubCliMissing({ cause }))))
    if (result.exitCode !== 0) {
      if (isAuthError(result.stderr)) {
        return yield* Effect.fail(new GitHubCliUnauthenticated({ output: result.stderr }))
      }
      return yield* Effect.fail(new GitHubOrgNotFound({ owner }))
    }
    const parsed = yield* Effect.try({
      try: () => JSON.parse(result.stdout) as ReadonlyArray<RawRepo>,
      catch: (error) => new GitHubCliMissing({ cause: error })
    })
    if (parsed.length === 0) {
      return yield* Effect.fail(new GitHubOrgNotFound({ owner }))
    }
    return sortOrgReposByStars(parsed.map(parseRawRepo))
  })

export interface GitHubOrgShape {
  readonly listRepos: (params: {
    readonly owner: string
  }) => Effect.Effect<
    ReadonlyArray<OrgRepository>,
    GitHubCliMissing | GitHubCliUnauthenticated | GitHubOrgNotFound,
    GitHubCli
  >
}

export class GitHubOrg extends Context.Service<GitHubOrg, GitHubOrgShape>()("ingraft/GitHubOrg") {}

export const GitHubOrgLive = Layer.sync(GitHubOrg, () => ({
  listRepos: Effect.fn("GitHubOrg.listRepos")(({ owner }: { readonly owner: string }) =>
    listOrgRepos({ owner })
  )
}))
