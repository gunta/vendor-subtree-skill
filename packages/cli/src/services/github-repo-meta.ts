import { Context, Effect, Layer, Option } from "effect"

import {
  GitHubCliMissing,
  GitHubCliUnauthenticated,
  GitHubOrgNotFound
} from "../domain/errors.ts"
import { githubRepoFromInput } from "../domain/repo.ts"
import { GitHubCli } from "./gh.ts"
import type { RepoMeta, UserIdentity } from "./local-state.ts"

export type RepoType = "own" | "fork" | "upstream" | "unknown" | "non-github"

export interface RepoTypeInput {
  readonly url: string
  readonly user: UserIdentity
  readonly meta: Option.Option<RepoMeta>
}

const ownerFromUrl = (url: string): string | null => {
  const repo = githubRepoFromInput(url)
  return repo?.owner ?? null
}

export const classifyRepo = ({ url, user, meta }: RepoTypeInput): RepoType => {
  const owner = ownerFromUrl(url)
  if (owner === null) return "non-github"
  if (owner === user.login) return "own"
  if (user.orgs.includes(owner)) return "own"
  if (Option.isNone(meta)) return "unknown"
  return meta.value.isFork ? "fork" : "upstream"
}

const REPO_VIEW_FIELDS = "isFork,parent,visibility,owner"

const isAuthError = (stderr: string): boolean => {
  const lower = stderr.toLowerCase()
  return lower.includes("authentication") || lower.includes("gh auth login")
}

const ghJson = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const gh = yield* GitHubCli
    const result = yield* gh
      .exec(args)
      .pipe(Effect.catch((cause) => Effect.fail(new GitHubCliMissing({ cause }))))
    if (result.exitCode !== 0) {
      if (isAuthError(result.stderr)) {
        return yield* Effect.fail(new GitHubCliUnauthenticated({ output: result.stderr }))
      }
      return yield* Effect.fail(new GitHubOrgNotFound({ owner: args.slice(-1)[0] ?? "?" }))
    }
    return yield* Effect.try({
      try: () => JSON.parse(result.stdout),
      catch: (error) => new GitHubCliMissing({ cause: error })
    })
  })

export const fetchUserIdentity = () =>
  Effect.gen(function* () {
    const user = (yield* ghJson(["api", "user"])) as { readonly login: string }
    const orgs = (yield* ghJson(["api", "user/orgs"])) as ReadonlyArray<{
      readonly login: string
    }>
    return {
      schemaVersion: 1,
      fetchedAt: new Date().toISOString(),
      login: user.login,
      orgs: orgs.map((o) => o.login)
    } satisfies UserIdentity
  })

export const fetchRepoMeta = ({ ownerName }: { readonly ownerName: string }) =>
  Effect.gen(function* () {
    const view = (yield* ghJson([
      "repo",
      "view",
      ownerName,
      "--json",
      REPO_VIEW_FIELDS
    ])) as {
      readonly isFork: boolean
      readonly parent: { readonly nameWithOwner: string } | null
      readonly visibility: string
      readonly owner: { readonly login: string }
    }
    return {
      fetchedAt: new Date().toISOString(),
      isFork: view.isFork,
      parent: view.parent?.nameWithOwner ?? null,
      owner: view.owner.login,
      visibility: view.visibility.toLowerCase()
    } satisfies RepoMeta
  })

export interface GitHubRepoMetaShape {
  readonly user: () => Effect.Effect<
    UserIdentity,
    GitHubCliMissing | GitHubCliUnauthenticated | GitHubOrgNotFound,
    GitHubCli
  >
  readonly repo: (params: { readonly ownerName: string }) => Effect.Effect<
    RepoMeta,
    GitHubCliMissing | GitHubCliUnauthenticated | GitHubOrgNotFound,
    GitHubCli
  >
}

export class GitHubRepoMeta extends Context.Service<
  GitHubRepoMeta,
  GitHubRepoMetaShape
>()("ingraft/GitHubRepoMeta") {}

export const GitHubRepoMetaLive = Layer.sync(GitHubRepoMeta, () => ({
  user: Effect.fn("GitHubRepoMeta.user")(() => fetchUserIdentity()),
  repo: Effect.fn("GitHubRepoMeta.repo")(({ ownerName }: { readonly ownerName: string }) =>
    fetchRepoMeta({ ownerName })
  )
}))
