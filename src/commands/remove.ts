import { Args, Command as Cli } from "@effect/cli"
import { Effect, Option } from "effect"
import { GitRemoveFailed, VendoredRepoNotFound } from "../errors.ts"
import {
  assertCleanTree,
  git,
  gitChecked,
  repoRoot
} from "../git.ts"
import { info, ok, withCommandTelemetry } from "../log.ts"
import { refreshGeneratedFiles } from "../project-files.ts"
import { findByName, listVendored, type VendoredRepo } from "../vendor-state.ts"

export interface RemoveCommandParams {
  readonly name: string
}

interface RemoveTargetParams {
  readonly cwd: string
  readonly name: string
}

interface RemoveFromGitParams {
  readonly cwd: string
  readonly target: VendoredRepo
}

const removeNameArg = Args.text({ name: "name" }).pipe(
  Args.withDescription("Name (or prefix path) of the vendored repository to remove.")
)

const removeTarget = ({ cwd, name }: RemoveTargetParams) =>
  findByName({ cwd, name }).pipe(
    Effect.flatMap((repo) =>
      Option.match(repo, {
        onNone: () => Effect.fail(new VendoredRepoNotFound({ name })),
        onSome: Effect.succeed
      })
    )
  )

const removeFromGit = ({ cwd, target }: RemoveFromGitParams) =>
  git(["rm", "-rf", target.prefix], { cwd }).pipe(
    Effect.filterOrFail(
      (result) => result.exitCode === 0,
      (result) =>
        new GitRemoveFailed({
          prefix: target.prefix,
          output: result.stderr.trim() || result.stdout.trim()
        })
    ),
    Effect.asVoid
  )

export const removeImpl = ({ name }: RemoveCommandParams) =>
  Effect.gen(function* () {
    const cwd = yield* repoRoot
    yield* assertCleanTree(cwd)

    const target = yield* removeTarget({ cwd, name })

    yield* info(`Removing ${target.prefix}/`)
    yield* removeFromGit({ cwd, target })
    yield* gitChecked(["commit", "-m", `vendor: remove ${target.name}`], { cwd })

    const reposAfter = yield* listVendored(cwd)
    yield* refreshGeneratedFiles({
      cwd,
      repos: reposAfter,
      commitMessage: `vendor: refresh agent doc after removing ${target.name}`
    })

    yield* ok(`Removed '${target.name}'.`)
  }).pipe(withCommandTelemetry("remove"))

export const removeCmd = Cli.make(
  "remove",
  { name: removeNameArg },
  removeImpl
).pipe(Cli.withDescription("Remove a vendored repository."))
