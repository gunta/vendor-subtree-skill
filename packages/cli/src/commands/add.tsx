import { Effect, FileSystem, Option, Path } from "effect"
import { Argument, Command, Flag } from "effect/unstable/cli"

import { RepositoryAliases } from "../aliases/service.ts"
import { mountProgress } from "../app/ink/progress.tsx"
import { info, ok, warn, withCommandTelemetry } from "../app/log.tsx"
import { applyAddDefaults, IngraftConfig } from "../config/ingraft.ts"
import {
  TRAILER_ACTION,
  TRAILER_DIR,
  TRAILER_FILTER,
  TRAILER_REF,
  TRAILER_RESOLVED_REF,
  TRAILER_STRATEGY,
  TRAILER_SYNC_PACKAGE,
  TRAILER_URL,
  VENDOR_DIR
} from "../domain/constants.ts"
import {
  InkRenderFailed,
  InvalidAddTargets,
  InvalidLocalOnlyStrategy,
  SubtreeAddFailed,
  UnsupportedVendorFilter,
  VendorPathAlreadyExists,
  VendorStrategyCommandFailed,
  VendoredRepoAlreadyExists,
  VersionResolutionFailed
} from "../domain/errors.ts"
import { readForkMode } from "../domain/fork-mode.ts"
import { upsertLocalVendorEntry } from "../domain/local-state.ts"
import { hostedRepoFromInput, inferRepoName, repositoryTargetFromInput } from "../domain/repo.ts"
import {
  formatVendorFilterTrailer,
  hasVendorFilter,
  type VendorFilter,
  vendorFilterFromOptions
} from "../domain/vendor-filter.ts"
import { findByName, listVendored, type VendoredRepo } from "../domain/vendor-state.ts"
import {
  effectiveVendorStrategy,
  isLocalIgnoredVendorStrategy,
  resolveVendorStrategyPreference,
  type VendorStrategy
} from "../domain/vendor-strategy.ts"
import {
  resolveVersion,
  type VersionSelector,
  versionSelectorFromOptions
} from "../domain/version.ts"
import {
  packageIdentityFromInput,
  PackageVersionSync,
  syncPackageName,
  type PackageEcosystem,
  type PackageVersionResolution
} from "../package-sync/service.ts"
import { ensureCacheLinkCheckout, linkCacheCheckout } from "../project/cache-link.ts"
import { checkoutFilteredRepo, materializeFilteredRepo } from "../project/filtered-checkout.ts"
import { updateGitignore, updateIgnoreFile } from "../project/gitignore.ts"
import { ProjectFiles } from "../project/service.ts"
import {
  artifactRemoteWithCredentials,
  CloudflareArtifacts
} from "../services/cloudflare-artifacts.ts"
import {
  assertCleanTree,
  commitPathsIfChanged,
  detectDefaultBranch,
  emptyCommit,
  git,
  readResolvedRef,
  repoRoot
} from "../services/git.ts"
import { Jujutsu } from "../services/jujutsu.ts"
import { RepositoryHosts } from "../services/repository-hosts.ts"

export interface AddCommandParams {
  readonly repo: string
  readonly ref: Option.Option<string>
  readonly tag: Option.Option<string>
  readonly release: Option.Option<string>
  readonly syncPackage: Option.Option<string>
  readonly cloudflareArtifact: boolean
  readonly cloudflareArtifactDepth: Option.Option<string>
  readonly cloudflareArtifactName: Option.Option<string>
  readonly exclude: ReadonlyArray<string>
  readonly excludeDirs: ReadonlyArray<string>
  readonly excludeExtensions: ReadonlyArray<string>
  readonly include: ReadonlyArray<string>
  readonly includeDirs: ReadonlyArray<string>
  readonly maxFileSize: Option.Option<string>
  readonly prefix: Option.Option<string>
  readonly name: Option.Option<string>
  readonly strategy: VendorStrategy
  readonly localOnly: boolean
}

export interface AddManyCommandParams extends Omit<AddCommandParams, "repo" | "strategy"> {
  readonly repos: ReadonlyArray<string>
  readonly strategy: Option.Option<VendorStrategy>
}

export type AddTarget =
  | {
      readonly _tag: "RepositoryTarget"
      readonly input: string
      readonly ref?: string
      readonly url: string
    }
  | {
      readonly _tag: "PackageTarget"
      readonly ecosystem: PackageEcosystem
      readonly input: string
      readonly packageName: string
    }

interface SubtreeAddMessageParams {
  readonly name: string
  readonly prefix: string
  readonly ref: string
  readonly resolvedRef?: Option.Option<string>
  readonly url: string
  readonly strategy: VendorStrategy
  readonly filter: VendorFilter
  readonly action?: "upsert" | "remove"
  readonly syncPackage: Option.Option<string>
}

interface EnsureNewVendorTargetParams {
  readonly cwd: string
  readonly finalName: string
  readonly finalPrefix: string
  readonly fs: FileSystem.FileSystem
  readonly path: Path.Path
}

interface AddSubtreeParams {
  readonly cwd: string
  readonly cloudflareArtifact: CloudflareArtifactOptions
  readonly finalName: string
  readonly finalPrefix: string
  readonly finalRef: string
  readonly filter: VendorFilter
  readonly syncPackage: Option.Option<string>
  readonly url: string
}

interface AddStrategyParams extends AddSubtreeParams {
  readonly strategy: VendorStrategy
  readonly existingRepos: ReadonlyArray<VendoredRepo>
  readonly localOnly: boolean
}

interface CheckoutVendorRefParams {
  readonly cwd: string
  readonly prefix: string
  readonly ref: string
  readonly strategy: VendorStrategy
}

interface EnsureParentDirectoryParams {
  readonly cwd: string
  readonly prefix: string
}

interface CloneVendorRepoParams {
  readonly artifact: CloudflareArtifactOptions
  readonly cwd: string
  readonly name: string
  readonly prefix: string
  readonly ref: string
  readonly strategy: VendorStrategy
  readonly url: string
}

interface ImportArtifactRemoteParams {
  readonly artifact: CloudflareArtifactOptions
  readonly name: string
  readonly ref: string
  readonly url: string
}

interface ImportedArtifactRemote {
  readonly cloneUrl: string
  readonly redactedUrl: string
}

interface SetCloneOriginParams {
  readonly cwd: string
  readonly prefix: string
  readonly strategy: VendorStrategy
  readonly url: string
}

interface ResolveRefParams {
  readonly cwd: string
  readonly url: string
  readonly selector: VersionSelector
}

interface CloudflareArtifactOptions {
  readonly depth: Option.Option<number>
  readonly enabled: boolean
  readonly name: Option.Option<string>
}

const addRepoArg = Argument.string("repo").pipe(
  Argument.withDescription(
    "GitHub shorthand (owner/repo), HTTPS/SSH URL, npm package name, or hex:<package> to vendor."
  )
)

const addRepoArgs = addRepoArg.pipe(Argument.atLeast(1))

const addRefOption = Flag.string("ref").pipe(
  Flag.withAlias("r"),
  Flag.withDescription(
    "Branch, tag, or commit to vendor. Defaults to the upstream's default branch."
  ),
  Flag.optional
)

const addTagOption = Flag.string("tag").pipe(
  Flag.withDescription("Git tag to vendor, for example v3.21.2."),
  Flag.optional
)

const addReleaseOption = Flag.string("release").pipe(
  Flag.withDescription(
    "Host release to vendor. Use a release tag/name or 'latest' for the latest GitHub/GitLab release."
  ),
  Flag.optional
)

const addSyncPackageOption = Flag.string("sync-package").pipe(
  Flag.withDescription(
    "Resolve the vendored ref from the root package.json dependency version and persist that sync intent for future updates."
  ),
  Flag.optional
)

const addCloudflareArtifactOption = Flag.boolean("cloudflare-artifact").pipe(
  Flag.withDescription(
    "Import the source repository into Cloudflare Artifacts and clone the short-lived Artifacts remote locally. Implies clone-ignore."
  )
)

const addCloudflareArtifactNameOption = Flag.string("cloudflare-artifact-name").pipe(
  Flag.withDescription(
    "Cloudflare Artifacts repository name. Defaults to the durable source route name."
  ),
  Flag.optional
)

const addCloudflareArtifactDepthOption = Flag.string("cloudflare-artifact-depth").pipe(
  Flag.withDescription(
    "Optional import depth to pass to the Cloudflare Artifacts REST import API."
  ),
  Flag.optional
)

const addExcludeOption = Flag.string("exclude").pipe(
  Flag.withDescription(
    "Repo-relative glob to omit from materialized source. Repeatable, for example --exclude '*.png'."
  ),
  Flag.atLeast(0)
)

const addExcludeDirOption = Flag.string("exclude-dir").pipe(
  Flag.withDescription(
    "Repo-relative directory to omit from materialized source. Repeatable, for example --exclude-dir docs."
  ),
  Flag.atLeast(0)
)

const addExcludeExtOption = Flag.string("exclude-ext").pipe(
  Flag.withDescription(
    "File extension to omit from materialized source. Repeatable, for example --exclude-ext png."
  ),
  Flag.atLeast(0)
)

const addMaxFileSizeOption = Flag.string("max-file-size").pipe(
  Flag.withDescription(
    "Omit files larger than this size from materialized source, for example 1MB or 512KB."
  ),
  Flag.optional
)

const addIncludeOption = Flag.string("include").pipe(
  Flag.withDescription(
    "Repo-relative glob to keep from materialized source. Repeatable, for example --include 'src/**/*.ts'. When set, only matching paths are vendored (allow-list)."
  ),
  Flag.atLeast(0)
)

const addIncludeDirOption = Flag.string("include-dir").pipe(
  Flag.withDescription(
    "Repo-relative directory to keep from materialized source. Repeatable, for example --include-dir src. When set, only matching subtrees are vendored (allow-list)."
  ),
  Flag.atLeast(0)
)

const addLocalOnlyOption = Flag.boolean("local-only").pipe(
  Flag.withAlias("no-commit"),
  Flag.withDescription(
    "Vendor entirely outside tracked git state. Writes the ignore block to .git/info/exclude, persists metadata in .git/ingraft/state.json, and skips host repository commits. Valid only with clone-ignore or cache-link."
  )
)

const addPrefixOption = Flag.string("prefix").pipe(
  Flag.withAlias("p"),
  Flag.withDescription(`Vendor prefix path. Defaults to '${VENDOR_DIR}/<name>'.`),
  Flag.optional
)

const addNameOption = Flag.string("name").pipe(
  Flag.withAlias("n"),
  Flag.withDescription("Override the inferred name (used for the prefix path and lookups)."),
  Flag.optional
)

const addStrategyOption = Flag.choiceWithValue("strategy", [
  ["subtree", "subtree"],
  ["submodule", "submodule"],
  ["clone-ignore", "clone-ignore"],
  ["clone", "clone-ignore"],
  ["cache-link", "cache-link"]
] as const).pipe(
  Flag.withDescription(
    "Vendoring strategy: subtree commits source, submodule commits a gitlink, clone-ignore clones locally, cache-link uses a shared cache symlink."
  ),
  Flag.optional
)

const optionOrElseEffect = <A, E, R>(option: Option.Option<A>, orElse: Effect.Effect<A, E, R>) =>
  Option.match(option, {
    onNone: () => orElse,
    onSome: Effect.succeed
  })

const syncPackageLabel = (packageName: string) => `--sync-package ${packageName}`

export const classifyAddTarget = (input: string): AddTarget => {
  const trimmed = input.trim()
  const identity = packageIdentityFromInput(trimmed)
  const repositoryTarget = repositoryTargetFromInput(trimmed)
  if (identity.ecosystem !== "npm") {
    return {
      _tag: "PackageTarget",
      ecosystem: identity.ecosystem,
      input,
      packageName: identity.name
    }
  }
  return repositoryTarget === null
    ? {
        _tag: "PackageTarget",
        ecosystem: identity.ecosystem,
        input,
        packageName: identity.name
      }
    : {
        _tag: "RepositoryTarget",
        input,
        ...(Option.isSome(repositoryTarget.ref) ? { ref: repositoryTarget.ref.value } : {}),
        url: repositoryTarget.url
      }
}

const resolutionVersionSource = (resolution: PackageVersionResolution): string =>
  resolution.versionSource === "package-json" ? "package.json range" : resolution.versionSource

const resolvePackageTarget = ({
  cwd,
  ecosystem,
  packageName
}: {
  readonly cwd: string
  readonly ecosystem: PackageEcosystem
  readonly packageName: string
}) =>
  Effect.gen(function* () {
    const pkgSync = yield* PackageVersionSync
    yield* info(
      `Resolving ${ecosystem} package '${packageName}' from installed metadata and lockfiles...`
    )
    const resolution = yield* pkgSync.resolvePackageSource({
      cwd,
      packageName: syncPackageName({ ecosystem, name: packageName })
    })
    yield* info(
      `Using ${resolution.ref} from ${packageName}@${resolution.version} (${resolutionVersionSource(resolution)}, ${resolution.source}).`
    )
    return resolution
  })

const parseOptionalPositiveInteger = (value: Option.Option<string>) =>
  Option.match(value, {
    onNone: () => Effect.succeed(Option.none<number>()),
    onSome: (text) => {
      const parsed = Number.parseInt(text, 10)
      return Number.isInteger(parsed) && parsed > 0
        ? Effect.succeed(Option.some(parsed))
        : Effect.fail(
            new VersionResolutionFailed({
              selector: `--cloudflare-artifact-depth ${text}`,
              url: "Cloudflare Artifacts"
            })
          )
    }
  })

const resolveSyncedPackageRef = ({
  cwd,
  packageName,
  url
}: {
  readonly cwd: string
  readonly packageName: string
  readonly url: string
}) =>
  Effect.gen(function* () {
    const pkgSync = yield* PackageVersionSync
    const resolution = yield* pkgSync.resolve({
      cwd,
      packageName,
      repoUrl: url
    })
    yield* info(
      `Using ${resolution.ref} from ${packageName}@${resolution.version} (${resolutionVersionSource(resolution)}, ${resolution.source}).`
    )
    return resolution
  })

const resolveRef = ({ cwd, selector, url }: ResolveRefParams) => {
  switch (selector._tag) {
    case "Ref":
      return info(`Using ref '${selector.value}'.`).pipe(Effect.as(selector.value))
    case "Tag":
      return info(`Using tag '${selector.value}'.`).pipe(Effect.as(selector.value))
    case "Release":
      return info(`Resolving release '${selector.value}' for ${url}...`).pipe(
        Effect.andThen(resolveVersion({ url, selector })),
        Effect.flatMap((resolved) =>
          Option.match(resolved, {
            onNone: (): Effect.Effect<string, VersionResolutionFailed | InkRenderFailed> =>
              Effect.fail(
                new VersionResolutionFailed({
                  selector: `--release ${selector.value}`,
                  url
                })
              ),
            onSome: (value) => info(`Using release tag '${value}'.`).pipe(Effect.as(value))
          })
        )
      )
    case "SyncPackage":
      return info(`Resolving ${syncPackageLabel(selector.value)} for ${url}...`).pipe(
        Effect.andThen(
          resolveSyncedPackageRef({
            cwd,
            packageName: selector.value,
            url
          })
        ),
        Effect.map((resolution: PackageVersionResolution) => resolution.ref)
      )
    case "Default":
      return info(`Detecting default branch for ${url}...`).pipe(
        Effect.andThen(detectDefaultBranch(url)),
        Effect.flatMap((detected) =>
          Option.match(detected, {
            onSome: (value) =>
              info(`Using ref '${value}' (detected from remote HEAD).`).pipe(Effect.as(value)),
            onNone: () =>
              warn("Could not detect default branch; falling back to 'main'.").pipe(
                Effect.as("main")
              )
          })
        )
      )
  }
}

const filterTrailer = (filter: VendorFilter): string => {
  const value = formatVendorFilterTrailer(filter)
  return value.length === 0 ? "" : `\n${TRAILER_FILTER}: ${value}`
}

const syncPackageTrailer = (syncPackage: Option.Option<string>): string =>
  Option.match(syncPackage, {
    onNone: () => "",
    onSome: (value) => `\n${TRAILER_SYNC_PACKAGE}: ${value}`
  })

const resolvedRefTrailer = (resolvedRef: Option.Option<string> | undefined): string =>
  resolvedRef === undefined
    ? ""
    : Option.match(resolvedRef, {
        onNone: () => "",
        onSome: (value) => `\n${TRAILER_RESOLVED_REF}: ${value}`
      })

const subtreeAddMessage = ({
  action = "upsert",
  filter,
  name,
  prefix,
  ref,
  resolvedRef,
  strategy,
  syncPackage,
  url
}: SubtreeAddMessageParams) =>
  `vendor: add ${name} (${url}@${ref}) [${strategy}]\n\n${TRAILER_DIR}: ${prefix}\n${TRAILER_URL}: ${url}\n${TRAILER_REF}: ${ref}${resolvedRefTrailer(resolvedRef)}\n${TRAILER_STRATEGY}: ${strategy}\n${TRAILER_ACTION}: ${action}${filterTrailer(filter)}${syncPackageTrailer(syncPackage)}`

const ensureNewVendorTarget = ({
  cwd,
  finalName,
  finalPrefix,
  fs,
  path
}: EnsureNewVendorTargetParams) =>
  Effect.gen(function* () {
    const existing = yield* findByName({ cwd, name: finalName })
    if (Option.isSome(existing)) {
      return yield* Effect.fail(
        new VendoredRepoAlreadyExists({
          name: finalName,
          prefix: existing.value.prefix
        })
      )
    }
    const exists = yield* fs.exists(path.resolve(cwd, finalPrefix))
    if (exists) {
      return yield* Effect.fail(new VendorPathAlreadyExists({ prefix: finalPrefix }))
    }
  })

const addSubtree = ({
  cloudflareArtifact: _cloudflareArtifact,
  cwd,
  finalName,
  finalPrefix,
  finalRef,
  filter,
  syncPackage,
  url
}: AddSubtreeParams) =>
  hasVendorFilter(filter)
    ? Effect.gen(function* () {
        yield* materializeFilteredRepo({
          cwd,
          filter,
          prefix: finalPrefix,
          ref: finalRef,
          url
        })
        const message = subtreeAddMessage({
          filter,
          name: finalName,
          prefix: finalPrefix,
          ref: finalRef,
          strategy: "subtree",
          syncPackage,
          url
        })
        const committed = yield* commitPathsIfChanged({
          cwd,
          paths: [finalPrefix],
          message
        })
        if (!committed) yield* emptyCommit({ cwd, message })
      })
    : git(
        [
          "subtree",
          "add",
          `--prefix=${finalPrefix}`,
          url,
          finalRef,
          "--squash",
          "-m",
          subtreeAddMessage({
            filter,
            name: finalName,
            prefix: finalPrefix,
            ref: finalRef,
            strategy: "subtree",
            syncPackage,
            url
          })
        ],
        { cwd }
      ).pipe(
        Effect.filterOrFail(
          (subtree) => subtree.exitCode === 0,
          (subtree) =>
            new SubtreeAddFailed({
              url,
              ref: finalRef,
              prefix: finalPrefix,
              output: subtree.stderr.trim() || subtree.stdout.trim()
            })
        ),
        Effect.asVoid
      )

const strategyGitFailed = ({
  action,
  prefix,
  result,
  strategy
}: {
  readonly action: "add" | "update" | "remove"
  readonly prefix: string
  readonly result: { readonly stdout: string; readonly stderr: string }
  readonly strategy: VendorStrategy
}) =>
  new VendorStrategyCommandFailed({
    action,
    prefix,
    strategy,
    output: result.stderr.trim() || result.stdout.trim() || "unknown error"
  })

const checkoutVendorRef = ({ cwd, prefix, ref, strategy }: CheckoutVendorRefParams) =>
  Effect.gen(function* () {
    const fetch = yield* git(["-C", prefix, "fetch", "--tags", "origin", ref], {
      cwd
    })
    if (fetch.exitCode !== 0) {
      return yield* Effect.fail(
        strategyGitFailed({ action: "add", prefix, result: fetch, strategy })
      )
    }

    const checkout = yield* git(["-C", prefix, "checkout", "FETCH_HEAD"], {
      cwd
    })
    if (checkout.exitCode !== 0) {
      return yield* Effect.fail(
        strategyGitFailed({ action: "add", prefix, result: checkout, strategy })
      )
    }
  })

const ensureParentDirectory = ({ cwd, prefix }: EnsureParentDirectoryParams) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    yield* fs
      .makeDirectory(path.dirname(path.resolve(cwd, prefix)), {
        recursive: true
      })
      .pipe(Effect.ignore)
  })

const importArtifactRemote = ({ artifact, name, ref, url }: ImportArtifactRemoteParams) =>
  Effect.gen(function* () {
    const cfArtifacts = yield* CloudflareArtifacts
    const importName = Option.getOrElse(artifact.name, () => name)
    const imported = yield* cfArtifacts.importRepo({
      branch: ref,
      depth: artifact.depth,
      name: importName,
      url
    })
    return {
      cloneUrl: artifactRemoteWithCredentials(imported),
      redactedUrl: imported.remote
    } satisfies ImportedArtifactRemote
  })

const setCloneOrigin = ({ cwd, prefix, strategy, url }: SetCloneOriginParams) =>
  Effect.gen(function* () {
    const result = yield* git(["-C", prefix, "remote", "set-url", "origin", url], {
      cwd
    })
    if (result.exitCode !== 0) {
      return yield* Effect.fail(strategyGitFailed({ action: "add", prefix, result, strategy }))
    }
  })

const cloneVendorRepo = ({
  artifact,
  cwd,
  name,
  prefix,
  ref,
  strategy,
  url
}: CloneVendorRepoParams) =>
  Effect.gen(function* () {
    if (artifact.enabled) {
      const imported = yield* importArtifactRemote({
        artifact,
        name,
        ref,
        url
      })
      const result = yield* git(["clone", imported.cloneUrl, prefix], {
        cwd,
        redactedArgs: ["clone", imported.redactedUrl, prefix]
      })
      if (result.exitCode !== 0) {
        return yield* Effect.fail(
          strategyGitFailed({
            action: "add",
            prefix,
            result,
            strategy
          })
        )
      }
      return result
    }

    const repoHosts = yield* RepositoryHosts
    const hostResult = yield* repoHosts.clone({
      cwd,
      input: url,
      target: prefix
    })
    if (Option.isSome(hostResult) && hostResult.value.exitCode === 0) {
      return hostResult.value
    }

    const result = yield* git(["clone", url, prefix], { cwd })
    if (result.exitCode !== 0) {
      return yield* Effect.fail(
        strategyGitFailed({
          action: "add",
          prefix,
          result,
          strategy
        })
      )
    }
    return result
  })

const addSubmodule = ({
  cwd,
  existingRepos: _existingRepos,
  filter,
  finalName,
  finalPrefix,
  finalRef,
  syncPackage,
  strategy,
  url
}: AddStrategyParams) =>
  Effect.gen(function* () {
    yield* ensureParentDirectory({ cwd, prefix: finalPrefix })
    const result = yield* git(["submodule", "add", url, finalPrefix], { cwd })
    if (result.exitCode !== 0) {
      return yield* Effect.fail(
        strategyGitFailed({
          action: "add",
          prefix: finalPrefix,
          result,
          strategy
        })
      )
    }

    yield* checkoutVendorRef({
      cwd,
      prefix: finalPrefix,
      ref: finalRef,
      strategy
    })
    const committed = yield* commitPathsIfChanged({
      cwd,
      paths: [".gitmodules", finalPrefix],
      message: subtreeAddMessage({
        name: finalName,
        filter,
        prefix: finalPrefix,
        ref: finalRef,
        strategy,
        syncPackage,
        url
      })
    })
    if (!committed) {
      yield* emptyCommit({
        cwd,
        message: subtreeAddMessage({
          name: finalName,
          filter,
          prefix: finalPrefix,
          ref: finalRef,
          strategy,
          syncPackage,
          url
        })
      })
    }
  })

const addCloneIgnore = ({
  cloudflareArtifact,
  cwd,
  existingRepos,
  filter,
  finalName,
  finalPrefix,
  finalRef,
  localOnly,
  syncPackage,
  strategy,
  url
}: AddStrategyParams) =>
  Effect.gen(function* () {
    yield* ensureParentDirectory({ cwd, prefix: finalPrefix })
    if (hasVendorFilter(filter)) {
      if (cloudflareArtifact.enabled) {
        const imported = yield* importArtifactRemote({
          artifact: cloudflareArtifact,
          name: finalName,
          ref: finalRef,
          url
        })
        yield* checkoutFilteredRepo({
          cwd,
          filter,
          redactedUrl: imported.redactedUrl,
          ref: finalRef,
          storedRemoteUrl: url,
          target: finalPrefix,
          url: imported.cloneUrl
        })
      } else {
        yield* checkoutFilteredRepo({
          cwd,
          filter,
          ref: finalRef,
          target: finalPrefix,
          url
        })
      }
    } else {
      yield* cloneVendorRepo({
        artifact: cloudflareArtifact,
        cwd,
        name: finalName,
        prefix: finalPrefix,
        ref: finalRef,
        strategy,
        url
      })
      yield* checkoutVendorRef({
        cwd,
        prefix: finalPrefix,
        ref: finalRef,
        strategy
      })
      if (cloudflareArtifact.enabled) {
        yield* setCloneOrigin({
          cwd,
          prefix: finalPrefix,
          strategy,
          url
        })
      }
    }

    const resolvedRefValue = yield* readResolvedRef({ cwd, prefix: finalPrefix })

    if (localOnly) {
      yield* updateIgnoreFile({
        cwd,
        target: "info-exclude",
        prefixes: [
          ...existingRepos
            .filter(
              (repo) => isLocalIgnoredVendorStrategy(repo.strategy) && repo.localOnly === true
            )
            .map((repo) => repo.prefix),
          finalPrefix
        ]
      })
      yield* upsertLocalVendorEntry({
        cwd,
        entry: {
          name: finalName,
          prefix: finalPrefix,
          url,
          ref: finalRef,
          ...(resolvedRefValue === undefined ? {} : { resolvedRef: resolvedRefValue }),
          strategy,
          filter,
          ...(Option.isSome(syncPackage) ? { syncPackage: syncPackage.value } : {}),
          addedAt: new Date().toISOString()
        }
      })
      return
    }

    yield* updateGitignore({
      cwd,
      prefixes: [
        ...existingRepos
          .filter((repo) => isLocalIgnoredVendorStrategy(repo.strategy) && repo.localOnly !== true)
          .map((repo) => repo.prefix),
        finalPrefix
      ]
    })
    const committed = yield* commitPathsIfChanged({
      cwd,
      paths: [".gitignore"],
      message: subtreeAddMessage({
        filter,
        name: finalName,
        prefix: finalPrefix,
        ref: finalRef,
        strategy,
        syncPackage,
        url
      })
    })
    if (!committed) {
      yield* emptyCommit({
        cwd,
        message: subtreeAddMessage({
          filter,
          name: finalName,
          prefix: finalPrefix,
          ref: finalRef,
          strategy,
          syncPackage,
          url
        })
      })
    }
  })

const addCacheLink = ({
  cwd,
  existingRepos,
  filter,
  finalName,
  finalPrefix,
  finalRef,
  localOnly,
  syncPackage,
  strategy,
  url
}: AddStrategyParams) =>
  Effect.gen(function* () {
    const checkout = yield* ensureCacheLinkCheckout({
      action: "add",
      cwd,
      ref: finalRef,
      strategy,
      url
    })
    yield* linkCacheCheckout({
      cachePath: checkout.cachePath,
      cwd,
      prefix: finalPrefix
    })

    if (localOnly) {
      yield* updateIgnoreFile({
        cwd,
        target: "info-exclude",
        prefixes: [
          ...existingRepos
            .filter(
              (repo) => isLocalIgnoredVendorStrategy(repo.strategy) && repo.localOnly === true
            )
            .map((repo) => repo.prefix),
          finalPrefix
        ]
      })
      yield* upsertLocalVendorEntry({
        cwd,
        entry: {
          name: finalName,
          prefix: finalPrefix,
          url,
          ref: finalRef,
          resolvedRef: checkout.resolvedRef,
          strategy,
          filter,
          ...(Option.isSome(syncPackage) ? { syncPackage: syncPackage.value } : {}),
          addedAt: new Date().toISOString()
        }
      })
      return
    }

    yield* updateGitignore({
      cwd,
      prefixes: [
        ...existingRepos
          .filter((repo) => isLocalIgnoredVendorStrategy(repo.strategy) && repo.localOnly !== true)
          .map((repo) => repo.prefix),
        finalPrefix
      ]
    })
    const message = subtreeAddMessage({
      filter,
      name: finalName,
      prefix: finalPrefix,
      ref: finalRef,
      resolvedRef: Option.some(checkout.resolvedRef),
      strategy,
      syncPackage,
      url
    })
    const committed = yield* commitPathsIfChanged({
      cwd,
      paths: [".gitignore"],
      message
    })
    if (!committed) yield* emptyCommit({ cwd, message })
  })

const addByStrategy = (params: AddStrategyParams) => {
  switch (params.strategy) {
    case "subtree":
      return addSubtree(params)
    case "submodule":
      return addSubmodule(params)
    case "clone-ignore":
      return addCloneIgnore(params)
    case "cache-link":
      return addCacheLink(params)
  }
}

export const addImpl = ({
  cloudflareArtifact,
  cloudflareArtifactDepth,
  cloudflareArtifactName,
  exclude,
  excludeDirs,
  excludeExtensions,
  include,
  includeDirs,
  localOnly,
  maxFileSize,
  name,
  prefix,
  release,
  ref,
  repo,
  strategy,
  syncPackage,
  tag
}: AddCommandParams) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const cwd = yield* repoRoot
    yield* assertCleanTree(cwd)
    const jj = yield* Jujutsu
    const jjColocated = yield* jj.isColocated(cwd)
    const jjStrategy = effectiveVendorStrategy({
      jjColocated,
      requested: strategy
    })
    if (jjStrategy !== strategy) {
      yield* warn(
        "Detected a colocated jj workspace; using clone-ignore because jj does not support git submodule workflows and mutating git subtree history is fragile there."
      )
    }
    const finalStrategy = cloudflareArtifact ? "clone-ignore" : jjStrategy
    if (cloudflareArtifact && finalStrategy !== jjStrategy) {
      yield* warn(
        "Using clone-ignore because Cloudflare Artifacts is a remote clone accelerator for local vendored checkouts."
      )
    }

    const target = classifyAddTarget(repo)
    const requestedSelector = yield* versionSelectorFromOptions({
      ref,
      tag,
      release,
      syncPackage
    })
    const selector =
      requestedSelector._tag === "Default" &&
      target._tag === "RepositoryTarget" &&
      target.ref !== undefined
        ? ({ _tag: "Ref", value: target.ref } satisfies VersionSelector)
        : requestedSelector
    const packageResolution =
      target._tag === "PackageTarget"
        ? Option.some(
            yield* resolvePackageTarget({
              cwd,
              ecosystem: target.ecosystem,
              packageName: target.packageName
            })
          )
        : Option.none<PackageVersionResolution>()
    const url =
      target._tag === "RepositoryTarget"
        ? target.url
        : Option.getOrThrow(Option.getOrThrow(packageResolution).repositoryUrl)
    const finalName = yield* optionOrElseEffect(name, inferRepoName(url))
    const ownerSegment = (() => {
      if (Option.isSome(prefix)) return null
      const hosted = hostedRepoFromInput(url)
      const owner = hosted?.nameWithOwner?.split("/")[0]
      return owner ?? null
    })()
    const defaultPrefix =
      ownerSegment === null
        ? `${VENDOR_DIR}/${finalName}`
        : `${VENDOR_DIR}/${ownerSegment}/${finalName}`
    const finalPrefix = (Option.isSome(prefix) ? prefix.value : defaultPrefix).replace(/\/+$/, "")
    const finalRef =
      target._tag === "PackageTarget" && selector._tag === "Default"
        ? Option.getOrThrow(packageResolution).ref
        : yield* resolveRef({ cwd, url, selector })
    const resolvedSyncPackage =
      selector._tag === "SyncPackage"
        ? Option.some(selector.value)
        : target._tag === "PackageTarget" && selector._tag === "Default"
          ? Option.some(syncPackageName({ ecosystem: target.ecosystem, name: target.packageName }))
          : Option.none<string>()
    const artifactDepth = yield* parseOptionalPositiveInteger(cloudflareArtifactDepth)
    const artifactOptions = {
      depth: artifactDepth,
      enabled: cloudflareArtifact,
      name: cloudflareArtifactName
    } satisfies CloudflareArtifactOptions
    const filter = yield* vendorFilterFromOptions({
      exclude,
      excludeDirs,
      excludeExtensions,
      include,
      includeDirs,
      maxFileSize: Option.getOrNull(maxFileSize)
    })
    if (
      (finalStrategy === "submodule" || finalStrategy === "cache-link") &&
      hasVendorFilter(filter)
    ) {
      return yield* Effect.fail(
        new UnsupportedVendorFilter({
          strategy: finalStrategy,
          reason:
            finalStrategy === "submodule"
              ? "submodules commit a gitlink to the upstream repository, so ignored files cannot be represented portably in the parent repo"
              : "cache-link points vendor paths at a shared read-only checkout; filtered materialization needs a project-local strategy"
        })
      )
    }
    const forkMode = yield* readForkMode({ cwd })
    const effectiveLocalOnly = localOnly || forkMode === "personal"
    if (effectiveLocalOnly && !localOnly) {
      yield* info("ingraft.forkMode=personal → using --local-only by default.")
    }

    if (effectiveLocalOnly && (finalStrategy === "subtree" || finalStrategy === "submodule")) {
      return yield* Effect.fail(new InvalidLocalOnlyStrategy({ strategy: finalStrategy }))
    }

    yield* ensureNewVendorTarget({ cwd, finalName, finalPrefix, fs, path })
    const existingRepos = yield* listVendored(cwd)

    yield* info(`Adding ${finalStrategy}: ${url} @ ${finalRef} -> ${finalPrefix}/`)
    yield* addByStrategy({
      cwd,
      cloudflareArtifact: artifactOptions,
      existingRepos,
      finalName,
      finalPrefix,
      finalRef,
      filter,
      localOnly: effectiveLocalOnly,
      strategy: finalStrategy,
      syncPackage: resolvedSyncPackage,
      url
    })

    if (!effectiveLocalOnly) {
      const projectFiles = yield* ProjectFiles
      const repos = yield* listVendored(cwd)
      yield* projectFiles.refresh({
        cwd,
        repos,
        commitMessage: `vendor: register ${finalName}`,
        editorSettings: true
      })
    }

    yield* ok(`Vendored '${finalName}' at ${finalPrefix}/ using ${finalStrategy}.`)
  }).pipe(withCommandTelemetry("add"))

export const addManyImpl = ({ repos, ...params }: AddManyCommandParams) =>
  Effect.gen(function* () {
    const repoAliases = yield* RepositoryAliases
    const config = yield* IngraftConfig
    const addParams = applyAddDefaults(params, config.defaults)
    const expandedTargets = yield* repoAliases.expand(repos)
    const expandedRepos = expandedTargets.map((target) => target.target)

    if (expandedRepos.length === 0) {
      return yield* Effect.fail(
        new InvalidAddTargets({
          reason: "No add targets remain after alias expansion.",
          targets: repos
        })
      )
    }

    yield* Effect.forEach(
      expandedTargets,
      (target) =>
        target.alias === undefined
          ? Effect.void
          : info(`Alias '${target.alias}' -> ${target.target}`),
      { discard: true }
    )

    if (expandedRepos.length > 1 && (Option.isSome(params.name) || Option.isSome(params.prefix))) {
      return yield* Effect.fail(
        new InvalidAddTargets({
          reason: "--name and --prefix can only be used when adding one target.",
          targets: expandedRepos
        })
      )
    }

    const cwd = yield* repoRoot
    const forkMode = yield* readForkMode({ cwd })
    const effectiveLocalOnly = addParams.localOnly || forkMode === "personal"

    if (expandedRepos.length === 1) {
      const target = expandedTargets[0]!
      yield* addImpl({
        ...addParams,
        repo: target.target,
        strategy:
          effectiveLocalOnly && Option.isNone(addParams.strategy)
            ? "clone-ignore"
            : resolveVendorStrategyPreference({
                recommended: target.strategy,
                requested: addParams.strategy
              })
      })
      return
    }

    const progress = yield* Effect.tryPromise({
      try: () => mountProgress(),
      catch: (cause) => new InkRenderFailed({ view: "AddProgressMount", cause })
    })
    yield* Effect.forEach(
      expandedRepos,
      (repo) =>
        Effect.gen(function* () {
          const target = expandedTargets.find((expanded) => expanded.target === repo)!
          progress.setCurrent(repo)
          yield* addImpl({
            ...addParams,
            repo,
            strategy:
              effectiveLocalOnly && Option.isNone(addParams.strategy)
                ? "clone-ignore"
                : resolveVendorStrategyPreference({
                    recommended: target.strategy,
                    requested: addParams.strategy
                  })
          }).pipe(
            Effect.match({
              onSuccess: () => progress.complete({ id: repo, label: repo, status: "success" }),
              onFailure: () => progress.complete({ id: repo, label: repo, status: "error" })
            })
          )
        }),
      { concurrency: 1, discard: true }
    )
    progress.setCurrent(undefined)
    yield* Effect.tryPromise({
      try: () => progress.unmount(),
      catch: (cause) => new InkRenderFailed({ view: "AddProgressUnmount", cause })
    })
    yield* ok(`Processed ${expandedRepos.length} vendor add target(s).`)
  }).pipe(withCommandTelemetry("add-many"))

export const addCmd = Command.make(
  "add",
  {
    repos: addRepoArgs,
    ref: addRefOption,
    tag: addTagOption,
    release: addReleaseOption,
    syncPackage: addSyncPackageOption,
    cloudflareArtifact: addCloudflareArtifactOption,
    cloudflareArtifactDepth: addCloudflareArtifactDepthOption,
    cloudflareArtifactName: addCloudflareArtifactNameOption,
    exclude: addExcludeOption,
    excludeDirs: addExcludeDirOption,
    excludeExtensions: addExcludeExtOption,
    include: addIncludeOption,
    includeDirs: addIncludeDirOption,
    maxFileSize: addMaxFileSizeOption,
    prefix: addPrefixOption,
    name: addNameOption,
    strategy: addStrategyOption,
    localOnly: addLocalOnlyOption
  },
  addManyImpl
).pipe(
  Command.withDescription(
    "Add one or more repositories, aliases, npm packages, or hex:<package> packages as durable source context using subtree, submodule, clone-ignore, or cache-link strategy metadata."
  )
)
