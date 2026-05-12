import { Args, Command as Cli, Options } from "@effect/cli"
import { FileSystem, Path } from "@effect/platform"
import { Effect, Option } from "effect"
import { TRAILER_DIR, TRAILER_REF, TRAILER_URL, VENDOR_DIR } from "../constants.ts"
import {
  SubtreeAddFailed,
  VendorPathAlreadyExists,
  VendoredRepoAlreadyExists
} from "../errors.ts"
import {
  assertCleanTree,
  detectDefaultBranch,
  git,
  repoRoot
} from "../git.ts"
import { info, ok, warn, withCommandTelemetry } from "../log.ts"
import { inferRepoName, normalizeRepoUrl } from "../repo.ts"
import { refreshGeneratedFiles } from "../project-files.ts"
import { findByName, listVendored } from "../vendor-state.ts"

export interface AddCommandParams {
  readonly repo: string
  readonly ref: Option.Option<string>
  readonly prefix: Option.Option<string>
  readonly name: Option.Option<string>
}

interface SubtreeAddMessageParams {
  readonly name: string
  readonly prefix: string
  readonly ref: string
  readonly url: string
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
  name,
  prefix,
  ref,
  url
}: SubtreeAddMessageParams) =>
  `vendor: add ${name} (${url}@${ref})\n\n${TRAILER_DIR}: ${prefix}\n${TRAILER_URL}: ${url}\n${TRAILER_REF}: ${ref}`

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

export const addImpl = ({
  name,
  prefix,
  ref,
  repo
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

    yield* info(`Adding subtree: ${url} @ ${finalRef} -> ${finalPrefix}/`)
    yield* addSubtree({ cwd, finalName, finalPrefix, finalRef, url })

    const repos = yield* listVendored(cwd)
    yield* refreshGeneratedFiles({
      cwd,
      repos,
      commitMessage: `vendor: register ${finalName}`,
      vscode: true
    })

    yield* ok(`Vendored '${finalName}' at ${finalPrefix}/.`)
  }).pipe(withCommandTelemetry("add"))

export const addCmd = Cli.make(
  "add",
  {
    repo: addRepoArg,
    ref: addRefOption,
    prefix: addPrefixOption,
    name: addNameOption
  },
  addImpl
).pipe(
  Cli.withDescription(
    "Add a new vendored repository as a squashed git subtree, with metadata trailers."
  )
)
