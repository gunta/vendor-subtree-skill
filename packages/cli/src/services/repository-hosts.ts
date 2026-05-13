import { Context, Effect, Layer, Option } from "effect"

import {
  hostedRepoFromInput,
  type HostedRepository,
  type RepositoryHostKind
} from "../domain/repo.ts"
import { GitHubCli, type GitHubCliOptions, type GitHubCliResult } from "./gh.ts"
import { GitLabCli, type GitLabCliOptions, type GitLabCliResult } from "./glab.ts"

export type HostCommandResult = GitHubCliResult | GitLabCliResult

type GitHubExec = (
  args: ReadonlyArray<string>,
  options?: GitHubCliOptions
) => Effect.Effect<GitHubCliResult, unknown>

type GitLabExec = (
  args: ReadonlyArray<string>,
  options?: GitLabCliOptions
) => Effect.Effect<GitLabCliResult, unknown>

export interface HostCloneParams {
  readonly cwd: string
  readonly input: string
  readonly target: string
}

export interface HostReleaseParams {
  readonly input: string
  readonly release: string
}

export interface RepositoryHostInfo {
  readonly kind: RepositoryHostKind
  readonly host: string
  readonly path: string
  readonly name: string
}

const resultOption = <A, E, R>(
  effect: Effect.Effect<Option.Option<A>, E, R>
): Effect.Effect<Option.Option<A>, never, R> =>
  effect.pipe(Effect.catch(() => Effect.succeed(Option.none<A>())))

const parseJson = (text: string): unknown =>
  Option.liftThrowable((value: string) => JSON.parse(value))(text).pipe(
    Option.getOrElse(() => ({}))
  )

const stringField = (value: unknown, fields: ReadonlyArray<string>): Option.Option<string> => {
  if (typeof value !== "object" || value === null) return Option.none()
  for (const field of fields) {
    if (!(field in value)) continue
    const current = (value as Record<string, unknown>)[field]
    if (typeof current === "string" && current.length > 0) {
      return Option.some(current)
    }
    if (typeof current === "object" && current !== null) {
      const nested = stringField(current, ["name"])
      if (Option.isSome(nested)) return nested
    }
  }
  return Option.none()
}

const githubDefaultBranch = (exec: GitHubExec, repo: HostedRepository) =>
  repo.nameWithOwner
    ? exec([
        "repo",
        "view",
        repo.nameWithOwner,
        "--json",
        "defaultBranchRef",
        "--jq",
        ".defaultBranchRef.name"
      ]).pipe(
        Effect.map((result) => {
          const branch = result.stdout.trim()
          return result.exitCode === 0 && branch.length > 0
            ? Option.some(branch)
            : Option.none<string>()
        })
      )
    : Effect.succeed(Option.none<string>())

const gitlabDefaultBranch = (exec: GitLabExec, repo: HostedRepository) =>
  exec(["repo", "view", repo.cloneSpec, "--output", "json"]).pipe(
    Effect.map((result) => {
      if (result.exitCode !== 0) return Option.none<string>()
      return stringField(parseJson(result.stdout), [
        "default_branch",
        "defaultBranch",
        "defaultBranchRef"
      ])
    })
  )

const releaseTagFromJson = (stdout: string): Option.Option<string> =>
  stringField(parseJson(stdout), ["tagName", "tag_name", "tag"])

const githubReleaseTag = (exec: GitHubExec, repo: HostedRepository, release: string) =>
  repo.nameWithOwner
    ? exec([
        "release",
        "view",
        ...(release === "latest" ? [] : [release]),
        "--repo",
        repo.nameWithOwner,
        "--json",
        "tagName",
        "--jq",
        ".tagName"
      ]).pipe(
        Effect.map((result) => {
          const tag = result.stdout.trim()
          return result.exitCode === 0 && tag.length > 0 ? Option.some(tag) : Option.none<string>()
        })
      )
    : Effect.succeed(Option.none<string>())

const gitlabReleaseTag = (exec: GitLabExec, repo: HostedRepository, release: string) =>
  exec([
    "release",
    "view",
    ...(release === "latest" ? [] : [release]),
    "--repo",
    repo.cloneSpec,
    "--output",
    "json"
  ]).pipe(
    Effect.map((result) =>
      result.exitCode === 0 ? releaseTagFromJson(result.stdout) : Option.none()
    )
  )

const hostInfo = (repo: HostedRepository): RepositoryHostInfo => ({
  kind: repo.kind,
  host: repo.host,
  path: repo.path,
  name: repo.name
})

const hostDefaultBranch = (githubExec: GitHubExec, gitlabExec: GitLabExec, input: string) =>
  Option.fromNullishOr(hostedRepoFromInput(input)).pipe(
    Option.match({
      onNone: () => Effect.succeed(Option.none<string>()),
      onSome: (repo) => {
        switch (repo.kind) {
          case "github":
            return resultOption(githubDefaultBranch(githubExec, repo))
          case "gitlab":
            return resultOption(gitlabDefaultBranch(gitlabExec, repo))
          case "bitbucket":
          case "codeberg":
          case "sourcehut":
          case "gitea":
          case "forgejo":
          case "generic":
            return Effect.succeed(Option.none<string>())
        }
      }
    })
  )

const hostClone = (
  githubExec: GitHubExec,
  gitlabExec: GitLabExec,
  { cwd, input, target }: HostCloneParams
) =>
  Option.fromNullishOr(hostedRepoFromInput(input)).pipe(
    Option.match({
      onNone: () => Effect.succeed(Option.none<HostCommandResult>()),
      onSome: (repo) => {
        switch (repo.kind) {
          case "github":
            return repo.nameWithOwner
              ? resultOption(
                  githubExec(["repo", "clone", repo.nameWithOwner, target], {
                    cwd
                  }).pipe(Effect.map(Option.some))
                )
              : Effect.succeed(Option.none<HostCommandResult>())
          case "gitlab":
            return resultOption(
              gitlabExec(["repo", "clone", repo.cloneSpec, target], { cwd }).pipe(
                Effect.map(Option.some)
              )
            )
          case "bitbucket":
          case "codeberg":
          case "sourcehut":
          case "gitea":
          case "forgejo":
          case "generic":
            return Effect.succeed(Option.none<HostCommandResult>())
        }
      }
    })
  )

const hostReleaseTag = (
  githubExec: GitHubExec,
  gitlabExec: GitLabExec,
  { input, release }: HostReleaseParams
) =>
  Option.fromNullishOr(hostedRepoFromInput(input)).pipe(
    Option.match({
      onNone: () => Effect.succeed(Option.none<string>()),
      onSome: (repo) => {
        switch (repo.kind) {
          case "github":
            return resultOption(githubReleaseTag(githubExec, repo, release))
          case "gitlab":
            return resultOption(gitlabReleaseTag(gitlabExec, repo, release))
          case "bitbucket":
          case "codeberg":
          case "sourcehut":
          case "gitea":
          case "forgejo":
          case "generic":
            return Effect.succeed(Option.none<string>())
        }
      }
    })
  )

const identifyHost = (input: string): Option.Option<RepositoryHostInfo> =>
  Option.fromNullishOr(hostedRepoFromInput(input)).pipe(Option.map(hostInfo))

export interface RepositoryHostsShape {
  readonly clone: (
    params: HostCloneParams
  ) => Effect.Effect<Option.Option<HostCommandResult>, never>
  readonly defaultBranch: (input: string) => Effect.Effect<Option.Option<string>, never>
  readonly identify: (input: string) => Effect.Effect<Option.Option<RepositoryHostInfo>, never>
  readonly releaseTag: (params: HostReleaseParams) => Effect.Effect<Option.Option<string>, never>
}

export class RepositoryHosts extends Context.Service<RepositoryHosts, RepositoryHostsShape>()(
  "ingraft/RepositoryHosts"
) {}

export const RepositoryHostsLive = Layer.effect(
  RepositoryHosts,
  Effect.gen(function* () {
    const github = yield* GitHubCli
    const gitlab = yield* GitLabCli
    return {
      clone: (params: HostCloneParams) => hostClone(github.exec, gitlab.exec, params),
      defaultBranch: (input: string) => hostDefaultBranch(github.exec, gitlab.exec, input),
      identify: (input: string) => Effect.succeed(identifyHost(input)),
      releaseTag: (params: HostReleaseParams) => hostReleaseTag(github.exec, gitlab.exec, params)
    }
  })
)
