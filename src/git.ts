import {
  Command as PlatformCommand,
  CommandExecutor,
  FileSystem
} from "@effect/platform"
import { Effect, Option, Stream, pipe } from "effect"
import {
  DirtyWorkingTree,
  GitCommandFailed,
  NotGitRepository
} from "./errors.ts"
import { RuntimeConfig } from "./runtime.ts"

export interface GitResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

const collect = <E, R>(stream: Stream.Stream<Uint8Array, E, R>) =>
  stream.pipe(Stream.decodeText("utf-8"), Stream.runFold("", (a, b) => a + b))

export interface GitOptions {
  readonly cwd?: string
}

export interface CommitConfigChangesParams {
  readonly cwd: string
  readonly message: string
}

const gitCommandLabel = (args: ReadonlyArray<string>) => `git ${args.join(" ")}`

const gitOutput = (result: GitResult) =>
  result.stderr.trim() || result.stdout.trim() || "unknown error"

const nonZeroExit = (
  args: ReadonlyArray<string>,
  result: GitResult,
  options: GitOptions
): GitCommandFailed => {
  const params = {
    args,
    exitCode: result.exitCode,
    output: gitOutput(result)
  }

  return new GitCommandFailed(
    options.cwd === undefined ? params : { ...params, cwd: options.cwd }
  )
}

const makeGitExec =
  (executor: CommandExecutor.CommandExecutor) =>
  (args: ReadonlyArray<string>, options: GitOptions = {}) =>
    Effect.scoped(
      Effect.gen(function* () {
        const base = PlatformCommand.make("git", ...args)
        const cmd = options.cwd
          ? pipe(base, PlatformCommand.workingDirectory(options.cwd))
          : base
        const proc = yield* executor.start(cmd)
        const [exitCode, stdout, stderr] = yield* Effect.all(
          [proc.exitCode, collect(proc.stdout), collect(proc.stderr)],
          { concurrency: 3 }
        )
        return { stdout, stderr, exitCode: Number(exitCode) } satisfies GitResult
      })
    )

export class Git extends Effect.Service<Git>()("vendor-subtree/Git", {
  accessors: true,
  effect: Effect.gen(function* () {
    const executor = yield* CommandExecutor.CommandExecutor
    return {
      exec: makeGitExec(executor)
    }
  })
}) {}

export const git = (args: ReadonlyArray<string>, options: GitOptions = {}) =>
  RuntimeConfig.pipe(
    Effect.flatMap((runtime) => {
      const cwd = options.cwd ?? runtime.cwd
      return Git.exec(args, options).pipe(
        Effect.withSpan("git.exec", {
          attributes: {
            args: args.join(" "),
            cwd
          }
        }),
        Effect.annotateLogs({
          git: gitCommandLabel(args),
          cwd
        })
      )
    })
  )

export const gitChecked = (
  args: ReadonlyArray<string>,
  options: GitOptions = {}
) =>
  git(args, options).pipe(
    Effect.filterOrFail(
      (result) => result.exitCode === 0,
      (result) => nonZeroExit(args, result, options)
    )
  )

export const repoRoot = git(["rev-parse", "--show-toplevel"]).pipe(
  Effect.filterOrFail(
    (result) => result.exitCode === 0,
    () => new NotGitRepository()
  ),
  Effect.map((result) => result.stdout.trim())
)

export const assertCleanTree = (cwd: string) =>
  gitChecked(["status", "--porcelain", "--untracked-files=no"], { cwd }).pipe(
    Effect.filterOrFail(
      (result) => result.stdout.trim() === "",
      () => new DirtyWorkingTree({ cwd })
    ),
    Effect.asVoid
  )

export const detectDefaultBranch = (url: string) =>
  git(["ls-remote", "--symref", url, "HEAD"]).pipe(
    Effect.map((result) => {
      if (result.exitCode !== 0) return Option.none<string>()
      const match = result.stdout.match(/^ref:\s+refs\/heads\/(\S+)\s+HEAD/m)
      return match?.[1] ? Option.some(match[1]) : Option.none<string>()
    })
  )

export const commitConfigChanges = ({
  cwd,
  message
}: CommitConfigChangesParams) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const candidates = [".vscode/settings.json", "AGENTS.md", "CLAUDE.md"]
    const toStage = yield* Effect.filter(candidates, (relativePath) =>
      fs.exists(`${cwd}/${relativePath}`)
    )
    if (toStage.length === 0) return
    yield* git(["add", "--", ...toStage], { cwd })
    const diff = yield* git(["diff", "--cached", "--quiet"], { cwd })
    if (diff.exitCode === 0) return
    yield* git(["commit", "-m", message], { cwd })
  })
