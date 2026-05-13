import { Data, type SchemaIssue } from "effect"

import type { VendorStrategy } from "./vendor-strategy.ts"

export interface ErrorPresentation {
  readonly title: string
  readonly detail?: string
  readonly hint?: string
  readonly code: number
}

export interface GitCommandFailedParams {
  readonly args: ReadonlyArray<string>
  readonly cwd?: string
  readonly exitCode: number
  readonly output: string
}

export interface DirtyWorkingTreeParams {
  readonly cwd: string
}

export interface RepoNameInferenceFailedParams {
  readonly url: string
}

export interface VendoredRepoAlreadyExistsParams {
  readonly name: string
  readonly prefix: string
}

export interface VendorPathAlreadyExistsParams {
  readonly prefix: string
}

export interface SubtreeAddFailedParams {
  readonly url: string
  readonly ref: string
  readonly prefix: string
  readonly output: string
}

export interface VendoredRepoNotFoundParams {
  readonly name: string
}

export interface GitRemoveFailedParams {
  readonly prefix: string
  readonly output: string
}

export interface UpdateFailedParams {
  readonly names: ReadonlyArray<string>
}

export interface VendorStrategyCommandFailedParams {
  readonly action: "add" | "update" | "remove"
  readonly strategy: VendorStrategy
  readonly prefix: string
  readonly output: string
}

export interface VersionSelectorConflictParams {
  readonly selectors: ReadonlyArray<string>
}

export interface VersionResolutionFailedParams {
  readonly selector: string
  readonly url: string
}

export interface PackageVersionSyncFailedParams {
  readonly packageName: string
  readonly reason: string
  readonly url: string
}

export interface InvalidVendorFilterParams {
  readonly value: string
  readonly reason: string
}

export interface UnsupportedVendorFilterParams {
  readonly strategy: VendorStrategy
  readonly reason: string
}

export interface InvalidAddTargetsParams {
  readonly reason: string
  readonly targets: ReadonlyArray<string>
}

export interface RepositoryAliasDatabaseInvalidParams {
  readonly reason: string
}

export interface IngraftConfigFileFailedParams {
  readonly path: string
  readonly cause: unknown
}

export interface HistoryRewriteToolMissingParams {
  readonly output: string
}

export interface HistoryRewriteFailedParams {
  readonly prefix: string
  readonly output: string
}

export interface CloudflareArtifactsConfigMissingParams {
  readonly reason: string
}

export interface CloudflareArtifactsRequestFailedParams {
  readonly action: string
  readonly status?: number
  readonly output: string
}

export interface TomlParseFailedParams {
  readonly source?: string
  readonly cause: unknown
}

export interface YamlParseFailedParams {
  readonly source?: string
  readonly cause: unknown
}

export interface JsonParseFailedParams {
  readonly source?: string
  readonly cause: unknown
}

export interface JsoncParseFailedParams {
  readonly source?: string
  readonly cause: unknown
}

export interface JavaScriptParseFailedParams {
  readonly source?: string
  readonly cause: unknown
}

export interface TypeScriptParseFailedParams {
  readonly source?: string
  readonly cause: unknown
}

export interface SchemaDecodeFailedParams {
  readonly source: string
  readonly issue: SchemaIssue.Issue
}

export interface InkRenderFailedParams {
  readonly view: string
  readonly cause: unknown
}

export interface PromptInputFailedParams {
  readonly cause: unknown
}

export interface TuiLaunchFailedParams {
  readonly command: string
  readonly cause: unknown
}

export interface TuiRendererFailedParams {
  readonly phase: "acquire" | "render" | "release"
  readonly cause: unknown
}

export interface ToolIgnoreCheckFailedParams {
  readonly tool: string
  readonly cause: unknown
}

export interface GitMetadataFailedParams {
  readonly operation: string
  readonly cwd?: string
  readonly filepath?: string
  readonly cause: unknown
}

export type MetadataFetchSource = "hex" | "maven-search" | "maven-pom"

export interface MetadataFetchFailedParams {
  readonly source: MetadataFetchSource
  readonly url?: string
  readonly cause: unknown
}

export interface VendorNotesFailedParams {
  readonly operation: "read" | "write"
  readonly cwd: string
  readonly oid?: string
  readonly cause: unknown
}

export interface CommandPlanFailedParams {
  readonly label: string
  readonly args: ReadonlyArray<string>
  readonly cause: unknown
}

export class GitCommandFailed extends Data.TaggedError(
  "GitCommandFailed"
)<GitCommandFailedParams> {}

export class NotGitRepository extends Data.TaggedError("NotGitRepository")<{}> {}

export class DirtyWorkingTree extends Data.TaggedError(
  "DirtyWorkingTree"
)<DirtyWorkingTreeParams> {}

export class RepoNameInferenceFailed extends Data.TaggedError(
  "RepoNameInferenceFailed"
)<RepoNameInferenceFailedParams> {}

export class VendoredRepoAlreadyExists extends Data.TaggedError(
  "VendoredRepoAlreadyExists"
)<VendoredRepoAlreadyExistsParams> {}

export class VendorPathAlreadyExists extends Data.TaggedError(
  "VendorPathAlreadyExists"
)<VendorPathAlreadyExistsParams> {}

export class SubtreeAddFailed extends Data.TaggedError(
  "SubtreeAddFailed"
)<SubtreeAddFailedParams> {}

export class VendoredRepoNotFound extends Data.TaggedError(
  "VendoredRepoNotFound"
)<VendoredRepoNotFoundParams> {}

export class GitRemoveFailed extends Data.TaggedError("GitRemoveFailed")<GitRemoveFailedParams> {}

export class UpdateTargetMissing extends Data.TaggedError("UpdateTargetMissing")<{}> {}

export class UpdateFailed extends Data.TaggedError("UpdateFailed")<UpdateFailedParams> {}

export class VendorStrategyCommandFailed extends Data.TaggedError(
  "VendorStrategyCommandFailed"
)<VendorStrategyCommandFailedParams> {}

export class VersionSelectorConflict extends Data.TaggedError(
  "VersionSelectorConflict"
)<VersionSelectorConflictParams> {}

export class VersionResolutionFailed extends Data.TaggedError(
  "VersionResolutionFailed"
)<VersionResolutionFailedParams> {}

export class PackageVersionSyncFailed extends Data.TaggedError(
  "PackageVersionSyncFailed"
)<PackageVersionSyncFailedParams> {}

export class InvalidVendorFilter extends Data.TaggedError(
  "InvalidVendorFilter"
)<InvalidVendorFilterParams> {}

export class UnsupportedVendorFilter extends Data.TaggedError(
  "UnsupportedVendorFilter"
)<UnsupportedVendorFilterParams> {}

export class InvalidAddTargets extends Data.TaggedError(
  "InvalidAddTargets"
)<InvalidAddTargetsParams> {}

export class RepositoryAliasDatabaseInvalid extends Data.TaggedError(
  "RepositoryAliasDatabaseInvalid"
)<RepositoryAliasDatabaseInvalidParams> {}

export class IngraftConfigFileFailed extends Data.TaggedError(
  "IngraftConfigFileFailed"
)<IngraftConfigFileFailedParams> {}

export class HistoryRewriteToolMissing extends Data.TaggedError(
  "HistoryRewriteToolMissing"
)<HistoryRewriteToolMissingParams> {}

export class HistoryRewriteFailed extends Data.TaggedError(
  "HistoryRewriteFailed"
)<HistoryRewriteFailedParams> {}

export class CloudflareArtifactsConfigMissing extends Data.TaggedError(
  "CloudflareArtifactsConfigMissing"
)<CloudflareArtifactsConfigMissingParams> {}

export class CloudflareArtifactsRequestFailed extends Data.TaggedError(
  "CloudflareArtifactsRequestFailed"
)<CloudflareArtifactsRequestFailedParams> {}

export class TomlParseFailed extends Data.TaggedError("TomlParseFailed")<TomlParseFailedParams> {}

export class YamlParseFailed extends Data.TaggedError("YamlParseFailed")<YamlParseFailedParams> {}

export class JsonParseFailed extends Data.TaggedError("JsonParseFailed")<JsonParseFailedParams> {}

export class JsoncParseFailed extends Data.TaggedError(
  "JsoncParseFailed"
)<JsoncParseFailedParams> {}

export class JavaScriptParseFailed extends Data.TaggedError(
  "JavaScriptParseFailed"
)<JavaScriptParseFailedParams> {}

export class TypeScriptParseFailed extends Data.TaggedError(
  "TypeScriptParseFailed"
)<TypeScriptParseFailedParams> {}

export class SchemaDecodeFailed extends Data.TaggedError(
  "SchemaDecodeFailed"
)<SchemaDecodeFailedParams> {}

export class InkRenderFailed extends Data.TaggedError("InkRenderFailed")<InkRenderFailedParams> {}

export class PromptInputFailed extends Data.TaggedError(
  "PromptInputFailed"
)<PromptInputFailedParams> {}

export class TuiLaunchFailed extends Data.TaggedError("TuiLaunchFailed")<TuiLaunchFailedParams> {}

export class TuiRendererFailed extends Data.TaggedError(
  "TuiRendererFailed"
)<TuiRendererFailedParams> {}

export class BunRuntimeMissing extends Data.TaggedError("BunRuntimeMissing")<
  Record<string, never>
> {}

export class ToolIgnoreCheckFailed extends Data.TaggedError(
  "ToolIgnoreCheckFailed"
)<ToolIgnoreCheckFailedParams> {}

export class GitMetadataFailed extends Data.TaggedError(
  "GitMetadataFailed"
)<GitMetadataFailedParams> {}

export class MetadataFetchFailed extends Data.TaggedError(
  "MetadataFetchFailed"
)<MetadataFetchFailedParams> {}

export class VendorNotesFailed extends Data.TaggedError(
  "VendorNotesFailed"
)<VendorNotesFailedParams> {}

export class CommandPlanFailed extends Data.TaggedError(
  "CommandPlanFailed"
)<CommandPlanFailedParams> {}

export type VendorError =
  | GitCommandFailed
  | NotGitRepository
  | DirtyWorkingTree
  | RepoNameInferenceFailed
  | VendoredRepoAlreadyExists
  | VendorPathAlreadyExists
  | SubtreeAddFailed
  | VendoredRepoNotFound
  | GitRemoveFailed
  | UpdateTargetMissing
  | UpdateFailed
  | VendorStrategyCommandFailed
  | VersionSelectorConflict
  | VersionResolutionFailed
  | PackageVersionSyncFailed
  | InvalidVendorFilter
  | UnsupportedVendorFilter
  | InvalidAddTargets
  | RepositoryAliasDatabaseInvalid
  | IngraftConfigFileFailed
  | HistoryRewriteToolMissing
  | HistoryRewriteFailed
  | CloudflareArtifactsConfigMissing
  | CloudflareArtifactsRequestFailed
  | TomlParseFailed
  | YamlParseFailed
  | JsonParseFailed
  | JsoncParseFailed
  | JavaScriptParseFailed
  | TypeScriptParseFailed
  | SchemaDecodeFailed
  | InkRenderFailed
  | PromptInputFailed
  | TuiLaunchFailed
  | TuiRendererFailed
  | BunRuntimeMissing
  | ToolIgnoreCheckFailed
  | GitMetadataFailed
  | MetadataFetchFailed
  | VendorNotesFailed
  | CommandPlanFailed

const gitCommand = (args: ReadonlyArray<string>) => `git ${args.join(" ")}`

const parseErrorPresentation = (
  format: string,
  source: string | undefined,
  cause: unknown
): ErrorPresentation => ({
  title: `${format} parse failed`,
  detail: source ? `Source: ${source}\n${String(cause)}` : String(cause),
  hint: `Inspect the file for invalid ${format} syntax.`,
  code: 2
})

const metadataFetchPresentation = (
  source: MetadataFetchSource,
  url: string | undefined,
  cause: unknown
): ErrorPresentation => {
  const label =
    source === "hex"
      ? "Hex package metadata"
      : source === "maven-search"
        ? "Maven Central search"
        : "Maven Central POM"
  return {
    title: `${label} request failed`,
    detail: url ? `URL: ${url}\n${String(cause)}` : String(cause),
    hint: "Check your network connection and that the upstream registry is reachable.",
    code: 3
  }
}

export const errorPresentation = (error: VendorError): ErrorPresentation => {
  switch (error._tag) {
    case "GitCommandFailed":
      return {
        title: "Git command failed",
        detail: `${gitCommand(error.args)} exited with ${error.exitCode}\n${error.output}`,
        hint: error.cwd
          ? `Run this from ${error.cwd} after checking the working tree.`
          : "Run the git command manually for the full git output.",
        code: 3
      }
    case "NotGitRepository":
      return {
        title: "Not inside a git repository",
        detail: "The ingraft command must run from a project that already has a git repository.",
        hint: "Run this from your project root, or run `git init` first.",
        code: 5
      }
    case "DirtyWorkingTree":
      return {
        title: "Working tree has uncommitted changes",
        detail:
          "git subtree refuses to run on dirty trees, and this command only ignores untracked files.",
        hint: "Commit or stash tracked changes before running subtree operations.",
        code: 4
      }
    case "RepoNameInferenceFailed":
      return {
        title: "Could not infer a repository name",
        detail: `No path segment could be used as a repo name in '${error.url}'.`,
        hint: "Pass --name to choose the vendored repository name explicitly.",
        code: 2
      }
    case "VendoredRepoAlreadyExists":
      return {
        title: `Vendored repo '${error.name}' already exists`,
        detail: `It is already registered at '${error.prefix}'.`,
        hint: `Use \`vendor update ${error.name}\` to pull upstream changes.`,
        code: 4
      }
    case "VendorPathAlreadyExists":
      return {
        title: `Path '${error.prefix}' already exists`,
        detail: "The subtree target must be an empty path managed by this tool.",
        hint: "Choose a different --prefix or remove the existing path first.",
        code: 4
      }
    case "SubtreeAddFailed":
      return {
        title: "git subtree add failed",
        detail: error.output,
        hint: "Check that the repo URL and ref are reachable, then retry.",
        code: 3
      }
    case "VendoredRepoNotFound":
      return {
        title: `No vendored repo named '${error.name}'`,
        hint: "Run `vendor list` to see the currently registered names and prefixes.",
        code: 4
      }
    case "GitRemoveFailed":
      return {
        title: "git rm failed",
        detail: error.output,
        hint: "Check the working tree and remove the path manually if needed.",
        code: 3
      }
    case "UpdateTargetMissing":
      return {
        title: "No update target specified",
        detail: "The update command needs one vendored repo name or --all.",
        hint: "Usage: vendor update <name> or vendor update --all",
        code: 2
      }
    case "UpdateFailed":
      return {
        title: "One or more updates failed",
        detail: `Failed repositories: ${error.names.join(", ")}`,
        hint: "Review the git error above, resolve conflicts if any, and retry the failed names.",
        code: 3
      }
    case "VendorStrategyCommandFailed":
      return {
        title: `${error.strategy} ${error.action} failed`,
        detail: error.output,
        hint: `Check ${error.prefix} and the git output above, then retry.`,
        code: 3
      }
    case "VersionSelectorConflict":
      return {
        title: "Conflicting version selectors",
        detail: `Received: ${error.selectors.join(", ")}`,
        hint: "Use only one of --ref, --tag, --release, or --sync-package.",
        code: 2
      }
    case "VersionResolutionFailed":
      return {
        title: "Could not resolve requested version",
        detail: `${error.selector} was not found for ${error.url}.`,
        hint: "Use --tag for an exact git tag, --release for a host release, --sync-package for a root package.json dependency, or --ref for a branch/commit/ref.",
        code: 2
      }
    case "PackageVersionSyncFailed":
      return {
        title: `Could not sync package '${error.packageName}'`,
        detail: `${error.reason}\nRepository: ${error.url}`,
        hint: "Check root package.json, npm registry metadata, and that the vendored repo has a matching published commit or tag.",
        code: 2
      }
    case "InvalidVendorFilter":
      return {
        title: "Invalid vendor filter",
        detail: `${error.value}: ${error.reason}`,
        hint: "Use patterns like --exclude '*.png', directories like --exclude-dir docs, extensions like --exclude-ext png, or sizes like --max-file-size 1MB.",
        code: 2
      }
    case "UnsupportedVendorFilter":
      return {
        title: "Vendor filter is not supported for this strategy",
        detail: `${error.strategy}: ${error.reason}`,
        hint: "Use --strategy subtree for filtered committed source, or --strategy clone-ignore for a filtered local reference clone.",
        code: 2
      }
    case "InvalidAddTargets":
      return {
        title: "Invalid add targets",
        detail: `${error.reason}\nTargets: ${error.targets.join(", ")}`,
        hint: "Use --name or --prefix with a single target, or run separate add commands for per-repo paths.",
        code: 2
      }
    case "RepositoryAliasDatabaseInvalid":
      return {
        title: "Repository alias database is invalid",
        detail: error.reason,
        hint: "Fix packages/cli/src/aliases/repository-aliases.json or .ingraft/config.toml and retry.",
        code: 2
      }
    case "IngraftConfigFileFailed":
      return {
        title: "Could not read ingraft config",
        detail: `${error.path}\n${String(error.cause)}`,
        hint: "Check file permissions or remove the optional .ingraft/config.toml file.",
        code: 2
      }
    case "HistoryRewriteToolMissing":
      return {
        title: "git-filter-repo is required for history rewrites",
        detail: error.output,
        hint: "Install git-filter-repo first, for example `brew install git-filter-repo`, then retry the dangerous remove command.",
        code: 2
      }
    case "HistoryRewriteFailed":
      return {
        title: "History rewrite failed",
        detail: `Path: ${error.prefix}\n${error.output}`,
        hint: "Review the git-filter-repo output. If this was not a fresh clone, rerun only after confirming that --force history rewriting is intentional.",
        code: 3
      }
    case "CloudflareArtifactsConfigMissing":
      return {
        title: "Cloudflare Artifacts is not configured",
        detail: error.reason,
        hint: "Set CLOUDFLARE_API_TOKEN plus ARTIFACTS_BASE_URL, or set ACCOUNT_ID/CLOUDFLARE_ACCOUNT_ID and ARTIFACTS_NAMESPACE.",
        code: 2
      }
    case "CloudflareArtifactsRequestFailed":
      return {
        title: `Cloudflare Artifacts ${error.action} failed`,
        detail: error.status === undefined ? error.output : `HTTP ${error.status}\n${error.output}`,
        hint: "Check the Artifacts namespace, API token permissions, repo name, and source repository URL.",
        code: 3
      }
    case "TomlParseFailed":
      return parseErrorPresentation("TOML", error.source, error.cause)
    case "YamlParseFailed":
      return parseErrorPresentation("YAML", error.source, error.cause)
    case "JsonParseFailed":
      return parseErrorPresentation("JSON", error.source, error.cause)
    case "JsoncParseFailed":
      return parseErrorPresentation("JSONC", error.source, error.cause)
    case "JavaScriptParseFailed":
      return parseErrorPresentation("JavaScript", error.source, error.cause)
    case "TypeScriptParseFailed":
      return parseErrorPresentation("TypeScript", error.source, error.cause)
    case "SchemaDecodeFailed":
      return {
        title: `Schema decode failed for ${error.source}`,
        detail: String(error.issue),
        hint: "The decoded value did not match the expected schema. Inspect the source for the expected shape.",
        code: 2
      }
    case "InkRenderFailed":
      return {
        title: `UI render failed: ${error.view}`,
        detail: String(error.cause),
        hint: "This is an internal error. Re-running the command usually recovers.",
        code: 3
      }
    case "PromptInputFailed":
      return {
        title: "Failed to read interactive prompt input",
        detail: String(error.cause),
        hint: "Re-run the command in an interactive terminal, or use non-interactive flags.",
        code: 3
      }
    case "TuiLaunchFailed":
      return {
        title: `TUI launch failed: ${error.command}`,
        detail: String(error.cause),
        hint: "Re-run with the non-interactive subcommands (e.g. `ingraft deps`).",
        code: 3
      }
    case "TuiRendererFailed":
      return {
        title: `TUI renderer failed (${error.phase})`,
        detail: String(error.cause),
        hint: "Re-run in a different terminal, or use the non-interactive subcommands.",
        code: 3
      }
    case "BunRuntimeMissing":
      return {
        title: "Bun runtime not found",
        detail: "ingraft's TUI requires Bun to be installed and on PATH.",
        hint: "Install Bun (https://bun.sh) or run `ingraft deps` for the non-interactive scanner.",
        code: 5
      }
    case "ToolIgnoreCheckFailed":
      return {
        title: `Tool ignore check failed: ${error.tool}`,
        detail: String(error.cause),
        hint: "Inspect the tool's config file in the project root.",
        code: 3
      }
    case "GitMetadataFailed":
      return {
        title: `Git metadata operation failed: ${error.operation}`,
        detail: [
          error.cwd ? `cwd: ${error.cwd}` : undefined,
          error.filepath ? `path: ${error.filepath}` : undefined,
          String(error.cause)
        ]
          .filter((line): line is string => line !== undefined)
          .join("\n"),
        hint: "Check that the working directory is a git repository and the path is accessible.",
        code: 3
      }
    case "MetadataFetchFailed":
      return metadataFetchPresentation(error.source, error.url, error.cause)
    case "VendorNotesFailed":
      return {
        title: `Vendor git note ${error.operation} failed`,
        detail: [
          `cwd: ${error.cwd}`,
          error.oid ? `oid: ${error.oid}` : undefined,
          String(error.cause)
        ]
          .filter((line): line is string => line !== undefined)
          .join("\n"),
        hint: "Re-run after confirming git notes can be read from this repository.",
        code: 3
      }
    case "CommandPlanFailed":
      return {
        title: `TUI command failed: ${error.label}`,
        detail: [`args: ${error.args.join(" ")}`, String(error.cause)].join("\n"),
        hint: "Re-run the underlying ingraft subcommand directly to see the full output.",
        code: 3
      }
  }
}

export const exitCodeOf = (error: VendorError): number => errorPresentation(error).code
