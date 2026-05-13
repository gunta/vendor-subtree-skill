import { Effect, FileSystem, Option, Path } from "effect"
import { Argument, Command, Flag } from "effect/unstable/cli"

import { info, ok, withCommandTelemetry } from "../app/log.tsx"
import {
  TRAILER_ACTION,
  TRAILER_DIR,
  TRAILER_FILTER,
  TRAILER_REF,
  TRAILER_RESOLVED_REF,
  TRAILER_STRATEGY,
  TRAILER_SYNC_PACKAGE,
  TRAILER_URL
} from "../domain/constants.ts"
import {
  GitRemoveFailed,
  HistoryRewriteFailed,
  HistoryRewriteToolMissing,
  VendoredRepoNotFound
} from "../domain/errors.ts"
import { formatVendorFilterTrailer } from "../domain/vendor-filter.ts"
import { findByName, listVendored, type VendoredRepo } from "../domain/vendor-state.ts"
import { isLocalIgnoredVendorStrategy } from "../domain/vendor-strategy.ts"
import { updateGitignore } from "../project/gitignore.ts"
import { ProjectFiles } from "../project/service.ts"
import {
  assertCleanTree,
  commitPathsIfChanged,
  emptyCommit,
  git,
  gitChecked,
  repoRoot
} from "../services/git.ts"

export interface RemoveCommandParams {
  readonly dangerouslyRewriteHistory: boolean
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

interface RemoveCloneIgnoreParams {
  readonly cwd: string
  readonly reposBefore: ReadonlyArray<VendoredRepo>
  readonly target: VendoredRepo
}

const removeNameArg = Argument.string("name").pipe(
  Argument.withDescription("Name (or prefix path) of the vendored repository to remove.")
)

const dangerouslyRewriteHistoryOption = Flag.boolean("dangerously-rewrite-history").pipe(
  Flag.withDescription(
    "DANGER: after removing the vendor, rewrite every local ref with git-filter-repo so the vendor path disappears from all repository history. This changes commit SHAs and requires coordinated force-pushes/re-clones."
  )
)

export const normalizeHistoryRewritePath = (prefix: string): string =>
  `${prefix.replace(/^\/+/, "").replace(/\/+$/, "")}/`

export const gitFilterRepoRemovePathArgs = (prefix: string): ReadonlyArray<string> => [
  "filter-repo",
  "--force",
  "--path",
  normalizeHistoryRewritePath(prefix),
  "--invert-paths"
]

const gitOutput = (result: { readonly stderr: string; readonly stdout: string }) =>
  result.stderr.trim() || result.stdout.trim() || "unknown error"

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
  git(
    target.strategy === "submodule" ? ["rm", "-f", target.prefix] : ["rm", "-rf", target.prefix],
    { cwd }
  ).pipe(
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

const filterTrailer = (target: VendoredRepo): string => {
  const value = formatVendorFilterTrailer(target.filter)
  return value.length === 0 ? "" : `\n${TRAILER_FILTER}: ${value}`
}

const syncPackageTrailer = (target: VendoredRepo): string =>
  target.syncPackage === undefined ? "" : `\n${TRAILER_SYNC_PACKAGE}: ${target.syncPackage}`

const resolvedRefTrailer = (target: VendoredRepo): string =>
  target.resolvedRef === undefined ? "" : `\n${TRAILER_RESOLVED_REF}: ${target.resolvedRef}`

const removeMessage = (target: VendoredRepo) =>
  `vendor: remove ${target.name} (${target.url}@${target.ref}) [${target.strategy}]\n\n${TRAILER_DIR}: ${target.prefix}\n${TRAILER_URL}: ${target.url}\n${TRAILER_REF}: ${target.ref}${resolvedRefTrailer(target)}\n${TRAILER_STRATEGY}: ${target.strategy}\n${TRAILER_ACTION}: remove${filterTrailer(target)}${syncPackageTrailer(target)}`

const removeCloneIgnore = ({ cwd, reposBefore, target }: RemoveCloneIgnoreParams) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    yield* fs.remove(path.resolve(cwd, target.prefix), {
      force: true,
      recursive: true
    })
    yield* updateGitignore({
      cwd,
      prefixes: reposBefore
        .filter(
          (repo) => isLocalIgnoredVendorStrategy(repo.strategy) && repo.prefix !== target.prefix
        )
        .map((repo) => repo.prefix)
    })
    const committed = yield* commitPathsIfChanged({
      cwd,
      paths: [".gitignore"],
      message: removeMessage(target)
    })
    if (!committed) yield* emptyCommit({ cwd, message: removeMessage(target) })
  })

const assertGitFilterRepoInstalled = (cwd: string) =>
  git(["filter-repo", "--version"], { cwd }).pipe(
    Effect.flatMap((result) =>
      result.exitCode === 0
        ? Effect.void
        : Effect.fail(new HistoryRewriteToolMissing({ output: gitOutput(result) }))
    )
  )

const rewriteVendorPathHistory = ({
  cwd,
  target
}: {
  readonly cwd: string
  readonly target: VendoredRepo
}) =>
  git(gitFilterRepoRemovePathArgs(target.prefix), { cwd }).pipe(
    Effect.flatMap((result) =>
      result.exitCode === 0
        ? Effect.void
        : Effect.fail(
            new HistoryRewriteFailed({
              prefix: normalizeHistoryRewritePath(target.prefix),
              output: gitOutput(result)
            })
          )
    )
  )

export const removeImpl = ({ dangerouslyRewriteHistory, name }: RemoveCommandParams) =>
  Effect.gen(function* () {
    const cwd = yield* repoRoot
    yield* assertCleanTree(cwd)

    const target = yield* removeTarget({ cwd, name })
    const reposBefore = yield* listVendored(cwd)

    if (dangerouslyRewriteHistory) {
      yield* assertGitFilterRepoInstalled(cwd)
      yield* info(
        `DANGER: removing ${target.prefix}/ from every local git ref with git-filter-repo. Commit SHAs will change and collaborators must re-clone or carefully rebase.`
      )
    }

    yield* info(`Removing ${target.prefix}/`)
    if (isLocalIgnoredVendorStrategy(target.strategy)) {
      yield* removeCloneIgnore({ cwd, reposBefore, target })
    } else {
      yield* removeFromGit({ cwd, target })
      yield* gitChecked(["commit", "-m", removeMessage(target)], { cwd })
    }

    const projectFiles = yield* ProjectFiles
    const reposAfter = yield* listVendored(cwd)
    yield* projectFiles.refresh({
      cwd,
      repos: reposAfter,
      commitMessage: `vendor: refresh project vendor files after removing ${target.name}`,
      editorSettings: true
    })

    if (dangerouslyRewriteHistory) {
      yield* rewriteVendorPathHistory({ cwd, target })
      yield* ok(
        `Removed '${target.name}' and rewrote local history to drop ${target.prefix}/. Force-push rewritten refs only after coordinating with collaborators.`
      )
      return
    }

    yield* ok(`Removed '${target.name}'.`)
  }).pipe(withCommandTelemetry("remove"))

export const removeCmd = Command.make(
  "remove",
  {
    dangerouslyRewriteHistory: dangerouslyRewriteHistoryOption,
    name: removeNameArg
  },
  removeImpl
).pipe(Command.withDescription("Remove a vendored repository."))
