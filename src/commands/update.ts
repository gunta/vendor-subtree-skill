import { Args, Command as Cli, Options } from "@effect/cli"
import { Array as Arr, Effect, Option } from "effect"
import { TRAILER_DIR, TRAILER_REF, TRAILER_URL } from "../constants.ts"
import {
  UpdateFailed,
  UpdateTargetMissing,
  VendoredRepoNotFound
} from "../errors.ts"
import { assertCleanTree, git, repoRoot } from "../git.ts"
import { error, info, ok, warn, withCommandTelemetry } from "../log.ts"
import { refreshGeneratedFiles } from "../project-files.ts"
import { listVendored, type VendoredRepo } from "../vendor-state.ts"

export interface SelectUpdateTargetsParams {
  readonly all: boolean
  readonly name: Option.Option<string>
  readonly repos: ReadonlyArray<VendoredRepo>
}

export interface UpdateCommandParams {
  readonly name: Option.Option<string>
  readonly all: boolean
}

interface GitOutputParams {
  readonly stdout: string
  readonly stderr: string
}

interface VendoredRepoCommandParams {
  readonly cwd: string
  readonly repo: VendoredRepo
}

const updateNameArg = Args.text({ name: "name" }).pipe(
  Args.withDescription("Name (or prefix path) of the vendored repository to update."),
  Args.optional
)

const updateAllOption = Options.boolean("all").pipe(
  Options.withAlias("a"),
  Options.withDescription("Update every vendored repository.")
)

type UpdateTargetSelectionError = UpdateTargetMissing | VendoredRepoNotFound

export const selectUpdateTargets = ({
  all,
  name,
  repos
}: SelectUpdateTargetsParams): Effect.Effect<
  Option.Option<ReadonlyArray<VendoredRepo>>,
  UpdateTargetSelectionError
> => {
  if (all) {
    return Effect.succeed(
      repos.length === 0 ? Option.none() : Option.some(repos)
    )
  }

  return Effect.gen(function* () {
    const value = yield* Option.match(name, {
      onNone: () => Effect.fail(new UpdateTargetMissing()),
      onSome: Effect.succeed
    })
    const repo = yield* Option.match(
      Option.fromNullable(
        repos.find((repo) => repo.name === value || repo.prefix === value)
      ),
      {
        onNone: () => Effect.fail(new VendoredRepoNotFound({ name: value })),
        onSome: Effect.succeed
      }
    )
    return Option.some([repo])
  })
}

const updateMessage = (repo: VendoredRepo) =>
  `vendor: update ${repo.name} (${repo.url}@${repo.ref})\n\n${TRAILER_DIR}: ${repo.prefix}\n${TRAILER_URL}: ${repo.url}\n${TRAILER_REF}: ${repo.ref}`

const lastGitLine = ({ stdout, stderr }: GitOutputParams): string =>
  (stderr.trim() || stdout.trim()).split("\n").slice(-1)[0] ?? "unknown error"

const pullSubtree = ({ cwd, repo }: VendoredRepoCommandParams) =>
  git(
    [
      "subtree",
      "pull",
      `--prefix=${repo.prefix}`,
      repo.url,
      repo.ref,
      "--squash",
      "-m",
      updateMessage(repo)
    ],
    { cwd }
  )

const updateOne = ({ cwd, repo }: VendoredRepoCommandParams) =>
  info(`Updating ${repo.name}: ${repo.url} @ ${repo.ref}`).pipe(
    Effect.zipRight(pullSubtree({ cwd, repo })),
    Effect.flatMap((subtree) =>
      subtree.exitCode === 0
        ? ok(`updated ${repo.name}`).pipe(Effect.as(Option.none<string>()))
        : error(
            `failed: ${lastGitLine({
              stdout: subtree.stdout,
              stderr: subtree.stderr
            })}`
          ).pipe(Effect.as(Option.some(repo.name)))
    )
  )

const refreshAfterUpdate = (cwd: string) =>
  Effect.gen(function* () {
    const reposAfter = yield* listVendored(cwd)
    yield* refreshGeneratedFiles({
      cwd,
      repos: reposAfter,
      commitMessage: "vendor: refresh agent doc after update"
    })
  })

export const updateImpl = ({
  all,
  name
}: UpdateCommandParams) =>
  Effect.gen(function* () {
    const cwd = yield* repoRoot
    yield* assertCleanTree(cwd)

    const targets = yield* listVendored(cwd).pipe(
      Effect.flatMap((repos) => selectUpdateTargets({ all, name, repos }))
    )

    yield* Option.match(targets, {
      onNone: () => warn("No vendored repos to update."),
      onSome: (repos) =>
        Effect.forEach(repos, (repo) => updateOne({ cwd, repo }), {
          concurrency: 1
        }).pipe(
          Effect.map(Arr.getSomes),
          Effect.tap(() => refreshAfterUpdate(cwd)),
          Effect.flatMap((failed) =>
            failed.length > 0
              ? Effect.fail(new UpdateFailed({ names: failed }))
              : Effect.void
          )
        )
    })
  }).pipe(withCommandTelemetry("update"))

export const updateCmd = Cli.make(
  "update",
  { name: updateNameArg, all: updateAllOption },
  updateImpl
).pipe(
  Cli.withDescription(
    "Pull upstream changes for one or all vendored repositories."
  )
)
