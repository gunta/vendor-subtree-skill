import { Array as Arr, Effect, FileSystem, Option, Path } from "effect"
import { Argument, Command, Flag } from "effect/unstable/cli"

import { error, info, ok, warn, withCommandTelemetry } from "../app/log.tsx"
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
  UpdateFailed,
  UpdateTargetMissing,
  VendorStrategyCommandFailed,
  VendoredRepoNotFound
} from "../domain/errors.ts"
import { formatVendorFilterTrailer, hasVendorFilter } from "../domain/vendor-filter.ts"
import { listVendored, type VendoredRepo } from "../domain/vendor-state.ts"
import type { VendorStrategy } from "../domain/vendor-strategy.ts"
import { PackageVersionSync } from "../package-sync/service.ts"
import { ensureCacheLinkCheckout, linkCacheCheckout } from "../project/cache-link.ts"
import { checkoutFilteredRepo, materializeFilteredRepo } from "../project/filtered-checkout.ts"
import { ProjectFiles } from "../project/service.ts"
import {
  assertCleanTree,
  commitPathsIfChanged,
  emptyCommit,
  git,
  repoRoot
} from "../services/git.ts"
import { RepositoryHosts } from "../services/repository-hosts.ts"

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

interface StrategyGitFailureParams {
  readonly prefix: string
  readonly result: { readonly stdout: string; readonly stderr: string }
  readonly strategy: VendorStrategy
}

const updateNameArg = Argument.string("name").pipe(
  Argument.withDescription("Name (or prefix path) of the vendored repository to update."),
  Argument.optional
)

const updateAllOption = Flag.boolean("all").pipe(
  Flag.withAlias("a"),
  Flag.withDescription("Update every vendored repository.")
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
    return Effect.succeed(repos.length === 0 ? Option.none() : Option.some(repos))
  }

  return Effect.gen(function* () {
    const value = yield* Option.match(name, {
      onNone: () => Effect.fail(new UpdateTargetMissing()),
      onSome: Effect.succeed
    })
    const repo = yield* Option.match(
      Option.fromNullishOr(repos.find((repo) => repo.name === value || repo.prefix === value)),
      {
        onNone: () => Effect.fail(new VendoredRepoNotFound({ name: value })),
        onSome: Effect.succeed
      }
    )
    return Option.some([repo])
  })
}

const filterTrailer = (repo: VendoredRepo): string => {
  const value = formatVendorFilterTrailer(repo.filter)
  return value.length === 0 ? "" : `\n${TRAILER_FILTER}: ${value}`
}

const syncPackageTrailer = (repo: VendoredRepo): string =>
  repo.syncPackage === undefined ? "" : `\n${TRAILER_SYNC_PACKAGE}: ${repo.syncPackage}`

const resolvedRefTrailer = (repo: VendoredRepo): string =>
  repo.resolvedRef === undefined ? "" : `\n${TRAILER_RESOLVED_REF}: ${repo.resolvedRef}`

const updateMessage = (repo: VendoredRepo) =>
  `vendor: update ${repo.name} (${repo.url}@${repo.ref}) [${repo.strategy}]\n\n${TRAILER_DIR}: ${repo.prefix}\n${TRAILER_URL}: ${repo.url}\n${TRAILER_REF}: ${repo.ref}${resolvedRefTrailer(repo)}\n${TRAILER_STRATEGY}: ${repo.strategy}\n${TRAILER_ACTION}: upsert${filterTrailer(repo)}${syncPackageTrailer(repo)}`

const lastGitLine = ({ stdout, stderr }: GitOutputParams): string =>
  (stderr.trim() || stdout.trim()).split("\n").slice(-1)[0] ?? "unknown error"

const failureOutput = (cause: unknown): string => {
  if (typeof cause === "object" && cause !== null) {
    if ("output" in cause && typeof cause.output === "string") return cause.output
    if ("message" in cause && typeof cause.message === "string") {
      return cause.message
    }
  }
  return String(cause)
}

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

const strategyGitFailed = ({ prefix, result, strategy }: StrategyGitFailureParams) =>
  new VendorStrategyCommandFailed({
    action: "update",
    prefix,
    strategy,
    output: result.stderr.trim() || result.stdout.trim() || "unknown error"
  })

const checkedStrategyGit = (
  args: ReadonlyArray<string>,
  { cwd, repo }: VendoredRepoCommandParams
) =>
  git(args, { cwd }).pipe(
    Effect.filterOrFail(
      (result) => result.exitCode === 0,
      (result) =>
        strategyGitFailed({
          prefix: repo.prefix,
          result,
          strategy: repo.strategy
        })
    ),
    Effect.asVoid
  )

const checkoutRepoRef = (params: VendoredRepoCommandParams) =>
  Effect.gen(function* () {
    yield* checkedStrategyGit(
      ["-C", params.repo.prefix, "fetch", "--tags", "origin", params.repo.ref],
      params
    )
    yield* checkedStrategyGit(["-C", params.repo.prefix, "checkout", "FETCH_HEAD"], params)
  })

const updateSubmodule = (params: VendoredRepoCommandParams) =>
  Effect.gen(function* () {
    yield* checkedStrategyGit(
      ["submodule", "update", "--init", "--recursive", "--", params.repo.prefix],
      params
    )
    yield* checkoutRepoRef(params)
    yield* commitPathsIfChanged({
      cwd: params.cwd,
      paths: [params.repo.prefix],
      message: updateMessage(params.repo)
    })
  })

const updateCloneIgnore = (params: VendoredRepoCommandParams) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const target = path.resolve(params.cwd, params.repo.prefix)
    const exists = yield* fs.exists(target)
    if (!exists) {
      yield* fs.makeDirectory(path.dirname(target), { recursive: true }).pipe(Effect.ignore)
      const repoHosts = yield* RepositoryHosts
      const hostResult = yield* repoHosts.clone({
        cwd: params.cwd,
        input: params.repo.url,
        target: params.repo.prefix
      })
      if (Option.isNone(hostResult) || hostResult.value.exitCode !== 0) {
        yield* checkedStrategyGit(["clone", params.repo.url, params.repo.prefix], params)
      }
    }
    yield* checkoutRepoRef(params)
  })

const updateFilteredSubtree = ({ cwd, repo }: VendoredRepoCommandParams) =>
  Effect.gen(function* () {
    yield* materializeFilteredRepo({
      cwd,
      filter: repo.filter,
      prefix: repo.prefix,
      ref: repo.ref,
      url: repo.url
    })
    yield* commitPathsIfChanged({
      cwd,
      paths: [repo.prefix],
      message: updateMessage(repo)
    })
  })

const updateFilteredCloneIgnore = ({ cwd, repo }: VendoredRepoCommandParams) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    yield* fs.remove(path.resolve(cwd, repo.prefix), {
      force: true,
      recursive: true
    })
    yield* checkoutFilteredRepo({
      cwd,
      filter: repo.filter,
      ref: repo.ref,
      target: repo.prefix,
      url: repo.url
    })
  })

const updateCacheLink = ({ cwd, repo }: VendoredRepoCommandParams) =>
  Effect.gen(function* () {
    const checkout = yield* ensureCacheLinkCheckout({
      action: "update",
      cwd,
      ref: repo.ref,
      strategy: repo.strategy,
      url: repo.url
    })
    yield* linkCacheCheckout({
      cachePath: checkout.cachePath,
      cwd,
      prefix: repo.prefix
    })
    if (checkout.resolvedRef !== repo.resolvedRef) {
      yield* emptyCommit({
        cwd,
        message: updateMessage({ ...repo, resolvedRef: checkout.resolvedRef })
      })
    }
  })

const updateByStrategy = (params: VendoredRepoCommandParams) => {
  if (hasVendorFilter(params.repo.filter)) {
    switch (params.repo.strategy) {
      case "subtree":
        return updateFilteredSubtree(params)
      case "clone-ignore":
        return updateFilteredCloneIgnore(params)
      case "cache-link":
        return Effect.fail(
          new VendorStrategyCommandFailed({
            action: "update",
            prefix: params.repo.prefix,
            strategy: params.repo.strategy,
            output: "cache-link filter metadata cannot be applied to a shared checkout"
          })
        )
      case "submodule":
        return Effect.fail(
          new VendorStrategyCommandFailed({
            action: "update",
            prefix: params.repo.prefix,
            strategy: params.repo.strategy,
            output: "submodule filter metadata cannot be applied portably from a parent repository"
          })
        )
    }
  }

  switch (params.repo.strategy) {
    case "subtree":
      return pullSubtree(params).pipe(
        Effect.filterOrFail(
          (result) => result.exitCode === 0,
          (result) =>
            strategyGitFailed({
              prefix: params.repo.prefix,
              result,
              strategy: params.repo.strategy
            })
        ),
        Effect.asVoid
      )
    case "submodule":
      return updateSubmodule(params)
    case "clone-ignore":
      return updateCloneIgnore(params)
    case "cache-link":
      return updateCacheLink(params)
  }
}

const resolveRepoForUpdate = ({ cwd, repo }: VendoredRepoCommandParams) => {
  const syncPackage = repo.syncPackage
  if (syncPackage === undefined) return Effect.succeed(repo)

  return Effect.gen(function* () {
    const pkgSync = yield* PackageVersionSync
    yield* info(`Resolving package-synced ref for ${repo.name} from ${syncPackage}...`)
    const resolution = yield* pkgSync.resolve({
      cwd,
      packageName: syncPackage,
      repoUrl: repo.url
    })
    yield* info(
      `Using ${resolution.ref} from package.json ${syncPackage}@${resolution.version} (${resolution.source}).`
    )
    return { ...repo, ref: resolution.ref }
  })
}

const updateOne = ({ cwd, repo }: VendoredRepoCommandParams) =>
  resolveRepoForUpdate({ cwd, repo }).pipe(
    Effect.tap((resolvedRepo) =>
      info(`Updating ${resolvedRepo.name}: ${resolvedRepo.url} @ ${resolvedRepo.ref}`)
    ),
    Effect.flatMap((resolvedRepo) =>
      updateByStrategy({ cwd, repo: resolvedRepo }).pipe(Effect.as(resolvedRepo))
    ),
    Effect.result,
    Effect.flatMap((result) =>
      result._tag === "Success"
        ? ok(`updated ${result.success.name}`).pipe(Effect.as(Option.none<string>()))
        : error(
            `failed: ${lastGitLine({
              stdout: "",
              stderr: failureOutput(result.failure)
            })}`
          ).pipe(Effect.as(Option.some(repo.name)))
    )
  )

const refreshAfterUpdate = (cwd: string) =>
  Effect.gen(function* () {
    const projectFiles = yield* ProjectFiles
    const reposAfter = yield* listVendored(cwd)
    yield* projectFiles.refresh({
      cwd,
      repos: reposAfter,
      commitMessage: "vendor: refresh project vendor files after update",
      editorSettings: true
    })
  })

export const updateImpl = ({ all, name }: UpdateCommandParams) =>
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
            failed.length > 0 ? Effect.fail(new UpdateFailed({ names: failed })) : Effect.void
          )
        )
    })
  }).pipe(withCommandTelemetry("update"))

export const updateCmd = Command.make(
  "update",
  { name: updateNameArg, all: updateAllOption },
  updateImpl
).pipe(Command.withDescription("Pull upstream changes for one or all vendored repositories."))
