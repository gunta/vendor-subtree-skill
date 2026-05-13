import { Context, Effect, Layer, Option, type PlatformError, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"

import { RuntimeConfig } from "../app/runtime.ts"
import { githubRepoFromInput, type GitHubRepository } from "../domain/repo.ts"

export interface GitHubCliResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

export interface GitHubCliOptions {
  readonly cwd?: string
}

export interface GitHubCloneParams {
  readonly cwd: string
  readonly repo: GitHubRepository
  readonly target: string
}

export interface GitHubCloneFromInputParams {
  readonly cwd: string
  readonly input: string
  readonly target: string
}

const collect = <E, R>(stream: Stream.Stream<Uint8Array, E, R>) =>
  stream.pipe(
    Stream.decodeText,
    Stream.runFold(
      () => "",
      (a, b) => a + b
    )
  )

const makeGitHubCliExec =
  (executor: ChildProcessSpawner.ChildProcessSpawner["Service"]) =>
  (args: ReadonlyArray<string>, options: GitHubCliOptions = {}) =>
    Effect.scoped(
      Effect.gen(function* () {
        const base = ChildProcess.make("gh", Array.from(args))
        const cmd = options.cwd ? ChildProcess.setCwd(base, options.cwd) : base
        const proc = yield* executor.spawn(cmd)
        const [exitCode, stdout, stderr] = yield* Effect.all(
          [proc.exitCode, collect(proc.stdout), collect(proc.stderr)],
          { concurrency: 3 }
        )
        return {
          stdout,
          stderr,
          exitCode: Number(exitCode)
        } satisfies GitHubCliResult
      })
    )

export interface GitHubCliShape {
  readonly exec: (
    args: ReadonlyArray<string>,
    options?: GitHubCliOptions
  ) => Effect.Effect<GitHubCliResult, PlatformError.PlatformError>
}

export class GitHubCli extends Context.Service<GitHubCli, GitHubCliShape>()("ingraft/GitHubCli") {}

export const GitHubCliLive = Layer.effect(
  GitHubCli,
  Effect.gen(function* () {
    const executor = yield* ChildProcessSpawner.ChildProcessSpawner
    return {
      exec: makeGitHubCliExec(executor)
    }
  })
)

export const gh = (args: ReadonlyArray<string>, options: GitHubCliOptions = {}) =>
  Effect.gen(function* () {
    const runtime = yield* RuntimeConfig
    const githubCli = yield* GitHubCli
    const cwd = options.cwd ?? runtime.cwd
    return yield* githubCli.exec(args, options).pipe(
      Effect.withSpan("gh.exec", {
        attributes: {
          args: args.join(" "),
          cwd
        }
      }),
      Effect.annotateLogs({
        gh: `gh ${args.join(" ")}`,
        cwd
      })
    )
  })

export const ghDefaultBranch = (repo: GitHubRepository) =>
  gh([
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

export const ghDefaultBranchFromInput = (input: string) =>
  Option.fromNullishOr(githubRepoFromInput(input)).pipe(
    Option.match({
      onNone: () => Effect.succeed(Option.none<string>()),
      onSome: ghDefaultBranch
    })
  )

export const ghRepoClone = ({ cwd, repo, target }: GitHubCloneParams) =>
  gh(["repo", "clone", repo.nameWithOwner, target], { cwd })

export const ghRepoCloneFromInput = ({ cwd, input, target }: GitHubCloneFromInputParams) =>
  Option.fromNullishOr(githubRepoFromInput(input)).pipe(
    Option.match({
      onNone: () => Effect.succeed(Option.none<GitHubCliResult>()),
      onSome: (repo) => ghRepoClone({ cwd, repo, target }).pipe(Effect.map(Option.some))
    })
  )
