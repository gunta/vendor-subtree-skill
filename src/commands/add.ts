import { Args, Command as Cli, Options } from "@effect/cli"
import { FileSystem, Path } from "@effect/platform"
import { Effect, Option } from "effect"
import {
  TRAILER_ACTION,
  TRAILER_DIR,
  TRAILER_REF,
  TRAILER_STRATEGY,
  TRAILER_URL,
  VENDOR_DIR
} from "../constants.ts"
import {
  SubtreeAddFailed,
  VendorPathAlreadyExists,
  VendorStrategyCommandFailed,
  VendoredRepoAlreadyExists
} from "../errors.ts"
import {
  assertCleanTree,
  commitPathsIfChanged,
  detectDefaultBranch,
  emptyCommit,
  git,
  repoRoot
} from "../git.ts"
import { updateGitignore } from "../gitignore.ts"
import { info, ok, warn, withCommandTelemetry } from "../log.ts"
import { inferRepoName, normalizeRepoUrl } from "../repo.ts"
import { refreshGeneratedFiles } from "../project-files.ts"
import { findByName, listVendored, type VendoredRepo } from "../vendor-state.ts"
import {
  DEFAULT_VENDOR_STRATEGY,
  type VendorStrategy
} from "../vendor-strategy.ts"

export interface AddCommandParams {
  readonly repo: string
  readonly ref: Option.Option<string>
  readonly prefix: Option.Option<string>
  readonly name: Option.Option<string>
  readonly strategy: VendorStrategy
}

interface SubtreeAddMessageParams {
  readonly name: string
  readonly prefix: string
  readonly ref: string
  readonly url: string
  readonly strategy: VendorStrategy
  readonly action?: "upsert" | "remove"
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
  readonly finalName: string
  readonly finalPrefix: string
  readonly finalRef: string
  readonly url: string
}

interface AddStrategyParams extends AddSubtreeParams {
  readonly strategy: VendorStrategy
  readonly existingRepos: ReadonlyArray<VendoredRepo>
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

interface ResolveRefParams {
  readonly url: string
  readonly ref: Option.Option<string>
}

const addRepoArg = Args.text({ name: "repo" }).pipe(
  Args.withDescription(
    "GitHub shorthand (owner/repo), HTTPS URL, or SSH URL of the upstream repository."
  )
)

const addRefOption = Options.text("ref").pipe(
  Options.withAlias("r"),
  Options.withDescription(
    "Branch, tag, or commit to vendor. Defaults to the upstream's default branch."
  ),
  Options.optional
)

const addPrefixOption = Options.text("prefix").pipe(
  Options.withAlias("p"),
  Options.withDescription(`Subtree prefix path. Defaults to '${VENDOR_DIR}/<name>'.`),
  Options.optional
)

const addNameOption = Options.text("name").pipe(
  Options.withAlias("n"),
  Options.withDescription(
    "Override the inferred name (used for the prefix path and lookups)."
  ),
  Options.optional
)

const addStrategyOption = Options.choiceWithValue("strategy", [
  ["subtree", "subtree"],
  ["submodule", "submodule"],
  ["clone-ignore", "clone-ignore"],
  ["clone", "clone-ignore"]
] as const).pipe(
  Options.withDefault(DEFAULT_VENDOR_STRATEGY),
  Options.withDescription(
    "Vendoring strategy: subtree commits source, submodule commits a gitlink, clone-ignore clones locally and gitignores it."
  )
)

const optionOrElseEffect = <A, E, R>(
  option: Option.Option<A>,
  orElse: Effect.Effect<A, E, R>
) =>
  Option.match(option, {
    onNone: () => orElse,
    onSome: Effect.succeed
  })

const resolveRef = ({ ref, url }: ResolveRefParams) =>
  optionOrElseEffect(
    ref,
    info(`Detecting default branch for ${url}...`).pipe(
      Effect.zipRight(detectDefaultBranch(url)),
      Effect.flatMap((detected) =>
        Option.match(detected, {
          onSome: (value) =>
            info(`Using ref '${value}' (detected from remote HEAD).`).pipe(
              Effect.as(value)
            ),
          onNone: () =>
            warn("Could not detect default branch; falling back to 'main'.").pipe(
              Effect.as("main")
            )
        })
      )
    )
  )

const subtreeAddMessage = ({
  action = "upsert",
  name,
  prefix,
  ref,
  strategy,
  url
}: SubtreeAddMessageParams) =>
  `vendor: add ${name} (${url}@${ref}) [${strategy}]\n\n${TRAILER_DIR}: ${prefix}\n${TRAILER_URL}: ${url}\n${TRAILER_REF}: ${ref}\n${TRAILER_STRATEGY}: ${strategy}\n${TRAILER_ACTION}: ${action}`

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
      return yield* Effect.fail(
        new VendorPathAlreadyExists({ prefix: finalPrefix })
      )
    }
  })

const addSubtree = ({
  cwd,
  finalName,
  finalPrefix,
  finalRef,
  url
}: AddSubtreeParams) =>
  git(
    [
      "subtree",
      "add",
      `--prefix=${finalPrefix}`,
      url,
      finalRef,
      "--squash",
      "-m",
      subtreeAddMessage({
          name: finalName,
          prefix: finalPrefix,
          ref: finalRef,
          strategy: "subtree",
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

const checkoutVendorRef = ({
  cwd,
  prefix,
  ref,
  strategy
}: CheckoutVendorRefParams) =>
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

const ensureParentDirectory = ({
  cwd,
  prefix
}: EnsureParentDirectoryParams) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    yield* fs.makeDirectory(path.dirname(path.resolve(cwd, prefix)), {
      recursive: true
    }).pipe(Effect.ignore)
  })

const addSubmodule = ({
  cwd,
  existingRepos: _existingRepos,
  finalName,
  finalPrefix,
  finalRef,
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
        prefix: finalPrefix,
        ref: finalRef,
        strategy,
        url
      })
    })
    if (!committed) {
      yield* emptyCommit({
        cwd,
        message: subtreeAddMessage({
          name: finalName,
          prefix: finalPrefix,
          ref: finalRef,
          strategy,
          url
        })
      })
    }
  })

const addCloneIgnore = ({
  cwd,
  existingRepos,
  finalName,
  finalPrefix,
  finalRef,
  strategy,
  url
}: AddStrategyParams) =>
  Effect.gen(function* () {
    yield* ensureParentDirectory({ cwd, prefix: finalPrefix })
    const result = yield* git(["clone", url, finalPrefix], { cwd })
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
    yield* updateGitignore({
      cwd,
      prefixes: [
        ...existingRepos
          .filter((repo) => repo.strategy === "clone-ignore")
          .map((repo) => repo.prefix),
        finalPrefix
      ]
    })
    const committed = yield* commitPathsIfChanged({
      cwd,
      paths: [".gitignore"],
      message: subtreeAddMessage({
        name: finalName,
        prefix: finalPrefix,
        ref: finalRef,
        strategy,
        url
      })
    })
    if (!committed) {
      yield* emptyCommit({
        cwd,
        message: subtreeAddMessage({
          name: finalName,
          prefix: finalPrefix,
          ref: finalRef,
          strategy,
          url
        })
      })
    }
  })

const addByStrategy = (params: AddStrategyParams) => {
  switch (params.strategy) {
    case "subtree":
      return addSubtree(params)
    case "submodule":
      return addSubmodule(params)
    case "clone-ignore":
      return addCloneIgnore(params)
  }
}

export const addImpl = ({
  name,
  prefix,
  ref,
  repo,
  strategy
}: AddCommandParams) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const cwd = yield* repoRoot
    yield* assertCleanTree(cwd)

    const url = normalizeRepoUrl(repo)
    const finalName = yield* optionOrElseEffect(name, inferRepoName(url))
    const finalPrefix = (
      Option.isSome(prefix) ? prefix.value : `${VENDOR_DIR}/${finalName}`
    ).replace(/\/+$/, "")
    const finalRef = yield* resolveRef({ url, ref })

    yield* ensureNewVendorTarget({ cwd, finalName, finalPrefix, fs, path })
    const existingRepos = yield* listVendored(cwd)

    yield* info(
      `Adding ${strategy}: ${url} @ ${finalRef} -> ${finalPrefix}/`
    )
    yield* addByStrategy({
      cwd,
      existingRepos,
      finalName,
      finalPrefix,
      finalRef,
      strategy,
      url
    })

    const repos = yield* listVendored(cwd)
    yield* refreshGeneratedFiles({
      cwd,
      repos,
      commitMessage: `vendor: register ${finalName}`,
      vscode: true
    })

    yield* ok(`Vendored '${finalName}' at ${finalPrefix}/ using ${strategy}.`)
  }).pipe(withCommandTelemetry("add"))

export const addCmd = Cli.make(
  "add",
  {
    repo: addRepoArg,
    ref: addRefOption,
    prefix: addPrefixOption,
    name: addNameOption,
    strategy: addStrategyOption
  },
  addImpl
).pipe(
  Cli.withDescription(
    "Add a new vendored repository using subtree, submodule, or clone-ignore strategy metadata."
  )
)
