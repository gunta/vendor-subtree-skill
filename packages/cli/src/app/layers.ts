import { NodeServices } from "@effect/platform-node"
import { Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"

import { RepositoryAliasesLive } from "../aliases/service.ts"
import { IngraftConfigLive } from "../config/ingraft.ts"
import { IntellijSettingsLive } from "../editors/intellij.ts"
import { EditorSettingsLive } from "../editors/service.ts"
import { VscodeSettingsLive } from "../editors/vscode.ts"
import { ZedSettingsLive } from "../editors/zed.ts"
import { PackageVersionSyncLive } from "../package-sync/service.ts"
import { ProjectFilesLive } from "../project/service.ts"
import { ProjectSurfacesLive } from "../project/surfaces.ts"
import { CloudflareArtifactsLive } from "../services/cloudflare-artifacts.ts"
import { GitHubCliLive } from "../services/gh.ts"
import { GitMetadataLive } from "../services/git-metadata.ts"
import { GitLive } from "../services/git.ts"
import { GitLabCliLive } from "../services/glab.ts"
import { JujutsuLive } from "../services/jujutsu.ts"
import { PromptsLive } from "../services/prompts.tsx"
import { RepositoryHostsLive } from "../services/repository-hosts.ts"
import { VendorNotesLive } from "../services/vendor-notes.ts"
import { PrettierIgnoreLive } from "../tool-ignores/formatters/index.ts"
import {
  CargoIgnoreLive,
  ElixirIgnoreLive,
  MypyIgnoreLive,
  PyrightIgnoreLive,
  TypeScriptIgnoreLive,
  ZigIgnoreLive
} from "../tool-ignores/language-analyzers/index.ts"
import {
  BiomeIgnoreLive,
  CspellIgnoreLive,
  EslintIgnoreLive,
  GolangciLintIgnoreLive,
  MarkdownlintIgnoreLive,
  OxlintIgnoreLive,
  RuffIgnoreLive,
  StylelintIgnoreLive
} from "../tool-ignores/linters/index.ts"
import { MonorepoToolsLive } from "../tool-ignores/monorepo.ts"
import { ToolIgnoresLive as ToolIgnoresLayerLive } from "../tool-ignores/service.ts"
import { RuntimeConfigLive } from "./runtime.ts"

const PlatformLive = Layer.mergeAll(NodeServices.layer, RuntimeConfigLive)
const ConfigLive = IngraftConfigLive.pipe(Layer.provide(PlatformLive))
const AliasesLive = RepositoryAliasesLive.pipe(
  Layer.provide(Layer.mergeAll(PlatformLive, ConfigLive))
)
const ArtifactsLive = CloudflareArtifactsLive.pipe(Layer.provide(FetchHttpClient.layer))
const GitLayerLive = GitLive.pipe(Layer.provide(NodeServices.layer))
const MetadataLive = GitMetadataLive
const GhLive = GitHubCliLive.pipe(Layer.provide(NodeServices.layer))
const GlabLive = GitLabCliLive.pipe(Layer.provide(NodeServices.layer))
const JjLive = JujutsuLive.pipe(Layer.provide(PlatformLive))
const NotesLive = VendorNotesLive
const IntellijLive = IntellijSettingsLive.pipe(Layer.provide(PlatformLive))
const VscodeLive = VscodeSettingsLive.pipe(
  Layer.provide(Layer.mergeAll(PlatformLive, MetadataLive))
)
const ZedLive = ZedSettingsLive.pipe(Layer.provide(PlatformLive))
const ToolIgnoreProvidersLive = Layer.mergeAll(
  BiomeIgnoreLive.pipe(Layer.provide(NodeServices.layer)),
  CspellIgnoreLive.pipe(Layer.provide(NodeServices.layer)),
  EslintIgnoreLive.pipe(Layer.provide(NodeServices.layer)),
  GolangciLintIgnoreLive.pipe(Layer.provide(NodeServices.layer)),
  MarkdownlintIgnoreLive.pipe(Layer.provide(NodeServices.layer)),
  MonorepoToolsLive.pipe(Layer.provide(NodeServices.layer)),
  MypyIgnoreLive.pipe(Layer.provide(NodeServices.layer)),
  OxlintIgnoreLive.pipe(Layer.provide(NodeServices.layer)),
  PrettierIgnoreLive.pipe(Layer.provide(NodeServices.layer)),
  PyrightIgnoreLive.pipe(Layer.provide(NodeServices.layer)),
  RuffIgnoreLive.pipe(Layer.provide(NodeServices.layer)),
  StylelintIgnoreLive.pipe(Layer.provide(NodeServices.layer)),
  TypeScriptIgnoreLive.pipe(Layer.provide(NodeServices.layer)),
  CargoIgnoreLive.pipe(Layer.provide(NodeServices.layer)),
  ElixirIgnoreLive.pipe(Layer.provide(NodeServices.layer)),
  ZigIgnoreLive.pipe(Layer.provide(NodeServices.layer))
)
const ToolIgnoresLive = ToolIgnoresLayerLive.pipe(Layer.provide(ToolIgnoreProvidersLive))
const EditorToolsLive = Layer.mergeAll(IntellijLive, VscodeLive, ZedLive)
const EditorsLive = EditorSettingsLive.pipe(Layer.provide(EditorToolsLive))
const FilesLive = ProjectFilesLive.pipe(
  Layer.provide(Layer.mergeAll(PlatformLive, GitLayerLive, EditorsLive, ToolIgnoresLive, NotesLive))
)
const SurfacesLive = ProjectSurfacesLive.pipe(Layer.provide(PlatformLive))
const HostsLive = RepositoryHostsLive.pipe(Layer.provide(Layer.mergeAll(GhLive, GlabLive)))
const PkgSyncLive = PackageVersionSyncLive.pipe(
  Layer.provide(Layer.mergeAll(PlatformLive, GitLayerLive))
)
const PrmptsLive = PromptsLive

export const LiveLayer = Layer.mergeAll(
  PlatformLive,
  ConfigLive,
  AliasesLive,
  ArtifactsLive,
  GitLayerLive,
  MetadataLive,
  JjLive,
  EditorsLive,
  FilesLive,
  SurfacesLive,
  ToolIgnoresLive,
  HostsLive,
  NotesLive,
  PkgSyncLive,
  PrmptsLive
)
