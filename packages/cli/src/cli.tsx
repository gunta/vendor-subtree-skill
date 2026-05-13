import { NodeRuntime } from "@effect/platform-node"
import { Effect, Logger, Option } from "effect"
import { Argument, Command } from "effect/unstable/cli"

import { RepositoryAliases } from "./aliases/service.ts"
import { cleanHelpOutput, isSubcommandHelp, printRootHelp, shouldShowRootHelp } from "./app/help.ts"
import { ErrorView } from "./app/ink/error-view.tsx"
import { renderInkOnce } from "./app/ink/render.tsx"
import { LiveLayer } from "./app/layers.ts"
import { withCommandTelemetry } from "./app/log.tsx"
import { RuntimeConfig } from "./app/runtime.ts"
import { addCmd, addManyImpl } from "./commands/add.tsx"
import { contextCmd } from "./commands/context.tsx"
import { depsCmd } from "./commands/deps.tsx"
import { doctorCmd } from "./commands/doctor.tsx"
import { initCmd } from "./commands/init.tsx"
import { listCmd } from "./commands/list.tsx"
import { refreshCmd } from "./commands/refresh.tsx"
import { removeCmd } from "./commands/remove.tsx"
import { updateCmd } from "./commands/update.tsx"
import { VERSION } from "./domain/constants.ts"
import {
  InkRenderFailed,
  type VendorError,
  errorPresentation,
  exitCodeOf
} from "./domain/errors.ts"
import { GitMetadataLive } from "./services/git-metadata.ts"
import { launchTui } from "./tui/launcher.ts"

const openTui = Effect.promise(() => launchTui()).pipe(Effect.asVoid, withCommandTelemetry("tui"))

const rootTargetsArg = Argument.string("target").pipe(
  Argument.withDescription(
    "Optional repo URLs, GitHub shorthands, npm package names, or hex:<package> names to vendor."
  ),
  Argument.variadic()
)

export const vendorCommand = Command.make("ingraft", { targets: rootTargetsArg }, ({ targets }) =>
  Effect.gen(function* () {
    yield* RepositoryAliases
    return yield* targets.length === 0
      ? openTui
      : addManyImpl({
          cloudflareArtifact: false,
          cloudflareArtifactDepth: Option.none(),
          cloudflareArtifactName: Option.none(),
          exclude: [],
          excludeDirs: [],
          excludeExtensions: [],
          maxFileSize: Option.none(),
          name: Option.none(),
          prefix: Option.none(),
          ref: Option.none(),
          release: Option.none(),
          repos: targets,
          strategy: Option.none(),
          syncPackage: Option.none(),
          tag: Option.none()
        })
  })
).pipe(
  Command.withDescription(
    "Manage vendored external git repositories for coding agents using subtree, submodule, or clone-ignore strategies."
  ),
  Command.withSubcommands([
    initCmd,
    depsCmd,
    addCmd,
    updateCmd,
    removeCmd,
    listCmd,
    contextCmd,
    refreshCmd,
    doctorCmd
  ])
)

export const runCli = Command.runWith(vendorCommand, {
  version: VERSION
})

const handleVendorError = <E extends VendorError>(cause: E) =>
  Effect.gen(function* () {
    const runtime = yield* RuntimeConfig
    yield* Effect.tryPromise({
      try: () => renderInkOnce(<ErrorView presentation={errorPresentation(cause)} />),
      catch: (renderCause) => new InkRenderFailed({ view: "ErrorView", cause: renderCause })
    }).pipe(Effect.catchTag("InkRenderFailed", () => Effect.void))
    yield* runtime.exit(exitCodeOf(cause))
  })

const app = Effect.gen(function* () {
  const runtime = yield* RuntimeConfig
  yield* runCli(runtime.argv.slice(2))
}).pipe(
  Effect.catchTags({
    DirtyWorkingTree: handleVendorError,
    GitCommandFailed: handleVendorError,
    GitRemoveFailed: handleVendorError,
    HistoryRewriteFailed: handleVendorError,
    HistoryRewriteToolMissing: handleVendorError,
    InvalidVendorFilter: handleVendorError,
    InvalidAddTargets: handleVendorError,
    IngraftConfigFileFailed: handleVendorError,
    NotGitRepository: handleVendorError,
    PackageVersionSyncFailed: handleVendorError,
    RepositoryAliasDatabaseInvalid: handleVendorError,
    RepoNameInferenceFailed: handleVendorError,
    SubtreeAddFailed: handleVendorError,
    UnsupportedVendorFilter: handleVendorError,
    UpdateFailed: handleVendorError,
    UpdateTargetMissing: handleVendorError,
    VendorPathAlreadyExists: handleVendorError,
    VendorStrategyCommandFailed: handleVendorError,
    VendoredRepoAlreadyExists: handleVendorError,
    VendoredRepoNotFound: handleVendorError,
    VersionResolutionFailed: handleVendorError,
    VersionSelectorConflict: handleVendorError,
    BunRuntimeMissing: handleVendorError,
    InkRenderFailed: handleVendorError,
    JavaScriptParseFailed: handleVendorError,
    JsonParseFailed: handleVendorError,
    JsoncParseFailed: handleVendorError,
    PromptInputFailed: handleVendorError,
    SchemaDecodeFailed: handleVendorError,
    TomlParseFailed: handleVendorError,
    ToolIgnoreCheckFailed: handleVendorError,
    TuiLaunchFailed: handleVendorError,
    TuiRendererFailed: handleVendorError,
    TypeScriptParseFailed: handleVendorError,
    YamlParseFailed: handleVendorError,
    GitMetadataFailed: handleVendorError,
    MetadataFetchFailed: handleVendorError,
    VendorNotesFailed: handleVendorError
  })
)

export const main = app.pipe(
  Effect.provide(Logger.layer([Logger.withConsoleLog(Logger.formatSimple)])),
  Effect.provide(LiveLayer),
  Effect.provide(GitMetadataLive)
)

export const runMain = () => {
  if (shouldShowRootHelp(process.argv)) {
    printRootHelp()
    return
  }
  if (isSubcommandHelp(process.argv)) {
    const origLog = console.log.bind(console)
    console.log = (...args: any[]) => {
      const text = args.map((a) => (typeof a === "string" ? a : String(a))).join(" ")
      origLog(cleanHelpOutput(text))
    }
  }
  NodeRuntime.runMain(Effect.scoped(main))
}
