import { Context, Effect, FileSystem, Layer, Option, Path } from "effect"

import { RuntimeConfig, type RuntimeConfigShape } from "../app/runtime.ts"
import type { VendoredRepo } from "../domain/vendor-state.ts"
import { EditorSettings, type RefreshEditorSettingsParams } from "../editors/service.ts"
import { GitMetadata } from "../services/git-metadata.ts"
import { Git, commitConfigChanges } from "../services/git.ts"
import { VendorNotes } from "../services/vendor-notes.ts"
import { ToolIgnores, type RefreshToolIgnoresParams } from "../tool-ignores/service.ts"
import { updateAgentDocs } from "./agent-docs.ts"
import { updateGitattributes } from "./gitattributes.ts"
import { updateGitignore } from "./gitignore.ts"
import { reportWritten } from "./reports.ts"
import { commandInvocation } from "./script.ts"

export interface RefreshGeneratedFilesParams {
  readonly cwd: string
  readonly repos: ReadonlyArray<VendoredRepo>
  readonly commitMessage: string
  readonly editorSettings?: boolean
}

interface ProjectFilesDependencies {
  readonly editorSettings: {
    readonly refresh: (
      params: RefreshEditorSettingsParams
    ) => Effect.Effect<ReadonlyArray<string>, unknown>
  }
  readonly runtime: RuntimeConfigShape
  readonly toolIgnores: {
    readonly refresh: (
      params: RefreshToolIgnoresParams
    ) => Effect.Effect<ReadonlyArray<string>, unknown>
  }
  readonly vendorNotes: {
    readonly sync: (params: {
      readonly cwd: string
      readonly repos: ReadonlyArray<VendoredRepo>
    }) => Effect.Effect<void, never>
  }
}

const refreshGeneratedFilesWith = (
  { editorSettings: editorService, runtime, toolIgnores, vendorNotes }: ProjectFilesDependencies,
  { commitMessage, cwd, editorSettings = false, repos }: RefreshGeneratedFilesParams
) =>
  Effect.gen(function* () {
    const command = yield* commandInvocation({ cwd, argv: runtime.argv })
    const written = yield* updateAgentDocs({ cwd, repos, command })
    const gitignore = yield* updateGitignore({
      cwd,
      prefixes: repos.filter((repo) => repo.strategy === "clone-ignore").map((repo) => repo.prefix)
    })
    const gitattributes = yield* updateGitattributes({
      cwd,
      prefixes: repos.filter((repo) => repo.strategy === "subtree").map((repo) => repo.prefix)
    })
    let generatedPaths = [
      ...written,
      ...Option.match(gitignore, {
        onNone: () => [],
        onSome: (path) => [path]
      }),
      ...Option.match(gitattributes, {
        onNone: () => [],
        onSome: (path) => [path]
      })
    ]
    yield* reportWritten({ cwd, paths: generatedPaths })
    if (editorSettings) {
      const editorPaths = yield* editorService.refresh({ cwd })
      yield* reportWritten({ cwd, paths: editorPaths })
      generatedPaths = [...generatedPaths, ...editorPaths]
    }
    const toolIgnorePaths = yield* toolIgnores.refresh({ cwd })
    yield* reportWritten({ cwd, paths: toolIgnorePaths })
    generatedPaths = [...generatedPaths, ...toolIgnorePaths]
    yield* vendorNotes.sync({ cwd, repos })
    yield* commitConfigChanges({ cwd, message: commitMessage, paths: generatedPaths })
  })

export interface ProjectFilesShape {
  readonly refresh: (params: RefreshGeneratedFilesParams) => Effect.Effect<void, unknown>
}

export class ProjectFiles extends Context.Service<ProjectFiles, ProjectFilesShape>()(
  "ingraft/ProjectFiles"
) {}

export const ProjectFilesLive = Layer.effect(
  ProjectFiles,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const git = yield* Git
    const gitMetadata = yield* GitMetadata
    const path = yield* Path.Path
    const runtime = yield* RuntimeConfig
    const editorSettings = yield* EditorSettings
    const toolIgnores = yield* ToolIgnores
    const vendorNotes = yield* VendorNotes
    return {
      refresh: (params: RefreshGeneratedFilesParams) =>
        refreshGeneratedFilesWith(
          { editorSettings, runtime, toolIgnores, vendorNotes },
          params
        ).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Git, git),
          Effect.provideService(GitMetadata, gitMetadata),
          Effect.provideService(Path.Path, path),
          Effect.provideService(RuntimeConfig, runtime)
        )
    }
  })
)
