import { Context, Effect, FileSystem, Layer, Option, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"

import { RuntimeConfig } from "../app/runtime.ts"
import { AGENT_DOCS } from "../domain/constants.ts"
import { DirtyWorkingTree, GitCommandFailed, NotGitRepository } from "../domain/errors.ts"
import { GitMetadata } from "./git-metadata.ts"
import { RepositoryHosts } from "./repository-hosts.ts"

export interface GitResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

const collect = <E, R>(stream: Stream.Stream<Uint8Array, E, R>) =>
  stream.pipe(
    Stream.decodeText,
    Stream.runFold(
      () => "",
      (a, b) => a + b
    )
  )

export interface GitOptions {
  readonly cwd?: string
  readonly redactedArgs?: ReadonlyArray<string>
}

export interface CommitConfigChangesParams {
  readonly cwd: string
  readonly message: string
  readonly paths?: ReadonlyArray<string>
}

export interface CommitPathsIfChangedParams {
  readonly cwd: string
  readonly message: string
  readonly paths: ReadonlyArray<string>
}

export interface EmptyCommitParams {
  readonly cwd: string
  readonly message: string
}

const gitCommandLabel = (args: ReadonlyArray<string>) => `git ${args.join(" ")}`

const normalizeStagePath = (cwd: string, value: string): string => {
  const root = cwd.endsWith("/") ? cwd.slice(0, -1) : cwd
  return value.startsWith(`${root}/`) ? value.slice(root.length + 1) : value
}

const uniquePaths = (paths: ReadonlyArray<string>): ReadonlyArray<string> =>
  paths.filter((path, index) => paths.indexOf(path) === index)

const gitOutput = (result: GitResult) =>
  result.stderr.trim() || result.stdout.trim() || "unknown error"

const nonZeroExit = (
  args: ReadonlyArray<string>,
  result: GitResult,
  options: GitOptions
): GitCommandFailed => {
  const params = {
    args: options.redactedArgs ?? args,
    exitCode: result.exitCode,
    output: gitOutput(result)
  }

  return new GitCommandFailed(options.cwd === undefined ? params : { ...params, cwd: options.cwd })
}

const makeGitExec =
  (executor: ChildProcessSpawner.ChildProcessSpawner["Service"]) =>
  (args: ReadonlyArray<string>, options: GitOptions = {}) =>
    Effect.scoped(
      Effect.gen(function* () {
        const base = ChildProcess.make("git", Array.from(args))
        const cmd = options.cwd ? ChildProcess.setCwd(base, options.cwd) : base
        const proc = yield* executor.spawn(cmd)
        const [exitCode, stdout, stderr] = yield* Effect.all(
          [proc.exitCode, collect(proc.stdout), collect(proc.stderr)],
          { concurrency: 3 }
        )
        return { stdout, stderr, exitCode: Number(exitCode) } satisfies GitResult
      })
    )

export interface GitShape {
  readonly exec: (
    args: ReadonlyArray<string>,
    options?: GitOptions
  ) => Effect.Effect<GitResult, unknown>
}

export class Git extends Context.Service<Git, GitShape>()("ingraft/Git") {}

export const GitLive = Layer.effect(
  Git,
  Effect.gen(function* () {
    const executor = yield* ChildProcessSpawner.ChildProcessSpawner
    return {
      exec: makeGitExec(executor)
    }
  })
)

export const git = (args: ReadonlyArray<string>, options: GitOptions = {}) =>
  Effect.gen(function* () {
    const runtime = yield* RuntimeConfig
    const gitService = yield* Git
    const cwd = options.cwd ?? runtime.cwd
    const logArgs = options.redactedArgs ?? args
    return yield* gitService.exec(args, options).pipe(
      Effect.withSpan("git.exec", {
        attributes: {
          args: logArgs.join(" "),
          cwd
        }
      }),
      Effect.annotateLogs({
        git: gitCommandLabel(logArgs),
        cwd
      })
    )
  })

export const gitChecked = (args: ReadonlyArray<string>, options: GitOptions = {}) =>
  git(args, options).pipe(
    Effect.filterOrFail(
      (result) => result.exitCode === 0,
      (result) => nonZeroExit(args, result, options)
    )
  )

export const repoRoot = Effect.gen(function* () {
  const runtime = yield* RuntimeConfig
  const gitMetadata = yield* GitMetadata
  return yield* gitMetadata.findRoot(runtime.cwd).pipe(
    Effect.withSpan("git.findRoot", {
      attributes: {
        cwd: runtime.cwd
      }
    }),
    Effect.annotateLogs({
      git: "isomorphic-git findRoot",
      cwd: runtime.cwd
    }),
    Effect.catch(() => Effect.fail(new NotGitRepository()))
  )
})

export const assertCleanTree = (cwd: string) =>
  gitChecked(["status", "--porcelain", "--untracked-files=no"], { cwd }).pipe(
    Effect.filterOrFail(
      (result) => result.stdout.trim() === "",
      () => new DirtyWorkingTree({ cwd })
    ),
    Effect.asVoid
  )

export const detectDefaultBranch = (url: string) =>
  Effect.gen(function* () {
    const repoHosts = yield* RepositoryHosts
    const branch = yield* repoHosts.defaultBranch(url)
    if (Option.isSome(branch)) return branch
    const result = yield* git(["ls-remote", "--symref", url, "HEAD"])
    if (result.exitCode !== 0) return Option.none<string>()
    const match = result.stdout.match(/^ref:\s+refs\/heads\/(\S+)\s+HEAD/m)
    return match?.[1] ? Option.some(match[1]) : Option.none<string>()
  })

export const commitConfigChanges = ({ cwd, message, paths = [] }: CommitConfigChangesParams) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const gitMetadata = yield* GitMetadata
    const candidates = uniquePaths([
      ".gitignore",
      ".ignore",
      ".bazelignore",
      ".eslintignore",
      ".eslintrc.json",
      ".markdownlintignore",
      ".moon/workspace.yml",
      ".moon/workspace.yaml",
      ".prettierignore",
      ".oxlintrc.json",
      ".stylelintrc.json",
      ".zed/settings.json",
      ".vscode/settings.json",
      "biome.json",
      "biome.jsonc",
      "cspell.json",
      "cspell.jsonc",
      "cspell.config.json",
      "nx.json",
      "pnpm-workspace.yaml",
      "pyrightconfig.json",
      "stylelint.config.json",
      "turbo.json",
      "turbo.jsonc",
      ...AGENT_DOCS,
      ...paths.map((path) => normalizeStagePath(cwd, path))
    ])
    const toStage = yield* Effect.filter(candidates, (relativePath) =>
      fs
        .exists(`${cwd}/${relativePath}`)
        .pipe(
          Effect.flatMap((exists) =>
            exists
              ? Effect.succeed(true)
              : gitMetadata
                  .pathKnownToGit(cwd, relativePath)
                  .pipe(Effect.catch(() => Effect.succeed(false)))
          )
        )
    )
    if (toStage.length === 0) return
    yield* commitPathsIfChanged({ cwd, paths: toStage, message })
  })

export const commitPathsIfChanged = ({ cwd, message, paths }: CommitPathsIfChangedParams) =>
  Effect.gen(function* () {
    if (paths.length === 0) return false
    yield* git(["add", "--", ...paths], { cwd })
    const diff = yield* git(["diff", "--cached", "--quiet"], { cwd })
    if (diff.exitCode === 0) return false
    yield* gitChecked(["commit", "-m", message], { cwd })
    return true
  })

export const emptyCommit = ({ cwd, message }: EmptyCommitParams) =>
  gitChecked(["commit", "--allow-empty", "-m", message], { cwd }).pipe(Effect.asVoid)
