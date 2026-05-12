import { Data } from "effect"
import { style, type StyleOptions } from "./styles.ts"

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

export class GitRemoveFailed extends Data.TaggedError(
  "GitRemoveFailed"
)<GitRemoveFailedParams> {}

export class UpdateTargetMissing extends Data.TaggedError(
  "UpdateTargetMissing"
)<{}> {}

export class UpdateFailed extends Data.TaggedError(
  "UpdateFailed"
)<UpdateFailedParams> {}

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

const gitCommand = (args: ReadonlyArray<string>) => `git ${args.join(" ")}`

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
        detail:
          "The vendor-subtree command must run from a project that already has a git repository.",
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
  }
}

export const exitCodeOf = (error: VendorError): number =>
  errorPresentation(error).code

export const formatVendorError = (
  error: VendorError,
  options: StyleOptions = {}
): string => {
  const presentation = errorPresentation(error)
  const lines = [
    `${style.red("Error:", options)} ${style.bold(presentation.title, options)}`
  ]
  if (presentation.detail) lines.push(presentation.detail)
  if (presentation.hint) {
    lines.push(`${style.yellow("Hint:", options)} ${presentation.hint}`)
  }
  return lines.join("\n")
}
