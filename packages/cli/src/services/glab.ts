import { Context, Effect, Layer, Stream, pipe } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"

import { RuntimeConfig } from "../app/runtime.ts"

export interface GitLabCliResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

export interface GitLabCliOptions {
  readonly cwd?: string
}

const collect = <E, R>(stream: Stream.Stream<Uint8Array, E, R>) =>
  stream.pipe(
    Stream.decodeText,
    Stream.runFold(
      () => "",
      (a, b) => a + b
    )
  )

const makeGitLabCliExec =
  (executor: ChildProcessSpawner.ChildProcessSpawner["Service"]) =>
  (args: ReadonlyArray<string>, options: GitLabCliOptions = {}) =>
    Effect.scoped(
      Effect.gen(function* () {
        const base = ChildProcess.make("glab", Array.from(args))
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
        } satisfies GitLabCliResult
      })
    )

export interface GitLabCliShape {
  readonly exec: (
    args: ReadonlyArray<string>,
    options?: GitLabCliOptions
  ) => Effect.Effect<GitLabCliResult, unknown>
}

export class GitLabCli extends Context.Service<GitLabCli, GitLabCliShape>()("ingraft/GitLabCli") {}

export const GitLabCliLive = Layer.effect(
  GitLabCli,
  Effect.gen(function* () {
    const executor = yield* ChildProcessSpawner.ChildProcessSpawner
    return {
      exec: makeGitLabCliExec(executor)
    }
  })
)

export const glab = (args: ReadonlyArray<string>, options: GitLabCliOptions = {}) =>
  Effect.gen(function* () {
    const runtime = yield* RuntimeConfig
    const gitlabCli = yield* GitLabCli
    const cwd = options.cwd ?? runtime.cwd
    return yield* gitlabCli.exec(args, options).pipe(
      Effect.withSpan("glab.exec", {
        attributes: {
          args: args.join(" "),
          cwd
        }
      }),
      Effect.annotateLogs({
        glab: `glab ${args.join(" ")}`,
        cwd
      })
    )
  })
