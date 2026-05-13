import { Context, Effect, FileSystem, Layer, Option, Path } from "effect"

import {
  AGENT_DOC_FILES,
  AGENT_DOC_RULE_DIRECTORIES,
  SECTION_BEGIN,
  SECTION_END
} from "../domain/constants.ts"
import type { VendoredRepo } from "../domain/vendor-state.ts"
import { mergeIntellijFileColorsText, mergeIntellijVendorScopeText } from "../editors/intellij.ts"
import { mergeVscodeSettingsText } from "../editors/vscode.ts"
import {
  GITATTRIBUTES_VENDOR_BEGIN,
  GITATTRIBUTES_VENDOR_END,
  mergeGitattributesText
} from "./gitattributes.ts"

export type ProjectSurfaceKind = "agent" | "editor" | "repository"

export type ProjectSurfaceStatus = "absent" | "configured" | "invalid" | "managed" | "present"

export interface ProjectSurfaceReport {
  readonly _tag: "ProjectSurfaceReport"
  readonly kind: ProjectSurfaceKind
  readonly message: string
  readonly name: string
  readonly path: string
  readonly present: boolean
  readonly status: ProjectSurfaceStatus
}

export interface ProjectSurfacesReport {
  readonly agentFiles: ReadonlyArray<ProjectSurfaceReport>
  readonly editorFiles: ReadonlyArray<ProjectSurfaceReport>
  readonly repositoryFiles: ReadonlyArray<ProjectSurfaceReport>
}

export interface ProjectSurfacesDoctorParams {
  readonly cwd: string
  readonly repos?: ReadonlyArray<VendoredRepo>
}

interface SurfaceSpec {
  readonly absentMessage?: string
  readonly kind: ProjectSurfaceKind
  readonly name: string
  readonly path: string
  readonly expectedType?: "directory" | "file"
  readonly detector?: (content: string) => Pick<ProjectSurfaceReport, "message" | "status">
}

interface DetectSurfaceParams {
  readonly cwd: string
  readonly fs: FileSystem.FileSystem
  readonly path: Path.Path
  readonly spec: SurfaceSpec
}

const managedMarkdownAgentDetector = (content: string) =>
  content.includes(SECTION_BEGIN) && content.includes(SECTION_END)
    ? {
        message: "managed vendor section present",
        status: "managed" as const
      }
    : {
        message: "present without managed vendor section",
        status: "present" as const
      }

const markdownAgentSpecs: ReadonlyArray<SurfaceSpec> = AGENT_DOC_FILES.map((spec) => ({
  kind: "agent" as const,
  name: spec.name,
  path: spec.path,
  expectedType: "file" as const,
  detector: managedMarkdownAgentDetector
}))

const agentSpecs: ReadonlyArray<SurfaceSpec> = [
  ...markdownAgentSpecs,
  ...AGENT_DOC_RULE_DIRECTORIES.map((directory) => ({
    kind: "agent" as const,
    name: directory.name,
    path: directory.path,
    expectedType: "directory" as const
  }))
]

const vscodeDetector = (content: string): Pick<ProjectSurfaceReport, "message" | "status"> => {
  const merged = mergeVscodeSettingsText(content)
  switch (merged._tag) {
    case "Invalid":
      return {
        message: `invalid settings: ${merged.message}`,
        status: "invalid"
      }
    case "Unchanged":
      return {
        message: "vendor settings present",
        status: "configured"
      }
    case "Updated":
      return {
        message: "present; refresh can update vendor settings",
        status: "present"
      }
  }
}

const mergeDetector =
  (merge: (content: string) => ReturnType<typeof mergeVscodeSettingsText>, invalidLabel: string) =>
  (content: string): Pick<ProjectSurfaceReport, "message" | "status"> => {
    const merged = merge(content)
    switch (merged._tag) {
      case "Invalid":
        return {
          message: `invalid ${invalidLabel}: ${merged.message}`,
          status: "invalid"
        }
      case "Unchanged":
        return {
          message: "vendor settings present",
          status: "configured"
        }
      case "Updated":
        return {
          message: "present; refresh can update vendor settings",
          status: "present"
        }
    }
  }

const intellijScopeDetector = mergeDetector(mergeIntellijVendorScopeText, "scope")
const intellijFileColorsDetector = mergeDetector(mergeIntellijFileColorsText, "file colors")

const gitattributesDetector =
  (
    repos: ReadonlyArray<VendoredRepo> | undefined
  ): ((content: string) => Pick<ProjectSurfaceReport, "message" | "status">) =>
  (content: string) => {
    const hasManagedSection =
      content.includes(GITATTRIBUTES_VENDOR_BEGIN) && content.includes(GITATTRIBUTES_VENDOR_END)
    if (repos === undefined) {
      return hasManagedSection
        ? {
            message: "GitHub diff hiding configured for subtree vendor paths",
            status: "configured"
          }
        : {
            message: "present; refresh can add GitHub diff hiding",
            status: "present"
          }
    }

    const prefixes = repos.filter((repo) => repo.strategy === "subtree").map((repo) => repo.prefix)
    return mergeGitattributesText({ content, prefixes }) === content
      ? {
          message: "GitHub diff hiding configured for subtree vendor paths",
          status: "configured"
        }
      : {
          message: "present; refresh can update GitHub diff hiding",
          status: "present"
        }
  }

const editorSpecs: ReadonlyArray<SurfaceSpec> = [
  {
    kind: "editor",
    name: "VS Code settings",
    path: ".vscode/settings.json",
    detector: vscodeDetector
  },
  {
    kind: "editor",
    name: "Zed settings",
    path: ".zed/settings.json"
  },
  {
    kind: "editor",
    name: "JetBrains project",
    path: ".idea"
  },
  {
    kind: "editor",
    name: "JetBrains vendor scope",
    path: ".idea/scopes/Vendor.xml",
    detector: intellijScopeDetector
  },
  {
    kind: "editor",
    name: "JetBrains file colors",
    path: ".idea/fileColors.xml",
    detector: intellijFileColorsDetector
  },
  {
    kind: "editor",
    name: "Vim config",
    path: ".vimrc"
  },
  {
    kind: "editor",
    name: "Coc settings",
    path: ".vim/coc-settings.json"
  }
]

const repositorySpecs = (
  repos: ReadonlyArray<VendoredRepo> | undefined
): ReadonlyArray<SurfaceSpec> => {
  const subtreeCount = repos?.filter((repo) => repo.strategy === "subtree").length ?? undefined
  return [
    {
      absentMessage:
        subtreeCount === 0
          ? "not needed; no subtree vendor paths"
          : "refresh can create GitHub diff hiding for subtree vendor paths",
      kind: "repository",
      name: ".gitattributes",
      path: ".gitattributes",
      detector: gitattributesDetector(repos)
    }
  ]
}

const absentReport = (absolutePath: string, spec: SurfaceSpec): ProjectSurfaceReport => ({
  _tag: "ProjectSurfaceReport",
  kind: spec.kind,
  message: spec.absentMessage ?? "not found",
  name: spec.name,
  path: absolutePath,
  present: false,
  status: "absent"
})

const presentReport = (
  absolutePath: string,
  spec: SurfaceSpec,
  content: string
): ProjectSurfaceReport => {
  const detected = spec.detector?.(content) ?? {
    message: "present",
    status: "present" as const
  }
  return {
    _tag: "ProjectSurfaceReport",
    kind: spec.kind,
    message: detected.message,
    name: spec.name,
    path: absolutePath,
    present: true,
    status: detected.status
  }
}

const detectSurface = ({ cwd, fs, path, spec }: DetectSurfaceParams) =>
  Effect.gen(function* () {
    const target = path.resolve(cwd, spec.path)
    const info = yield* fs.stat(target).pipe(Effect.option)
    if (Option.isNone(info)) return absentReport(target, spec)
    if (spec.expectedType === "directory" && info.value.type !== "Directory") {
      return absentReport(target, spec)
    }
    if (spec.expectedType === "file" && info.value.type === "Directory") {
      return absentReport(target, spec)
    }
    const content =
      spec.detector && info.value.type !== "Directory"
        ? yield* fs.readFileString(target).pipe(Effect.orElseSucceed(() => ""))
        : ""
    return presentReport(target, spec, content)
  })

const detectSurfacesWith = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  { cwd, repos }: ProjectSurfacesDoctorParams
) =>
  Effect.gen(function* () {
    const [agentFiles, editorFiles, repositoryFiles] = yield* Effect.all(
      [
        Effect.forEach(agentSpecs, (spec) => detectSurface({ cwd, fs, path, spec })),
        Effect.forEach(editorSpecs, (spec) => detectSurface({ cwd, fs, path, spec })),
        Effect.forEach(repositorySpecs(repos), (spec) => detectSurface({ cwd, fs, path, spec }))
      ],
      { concurrency: 3 }
    )
    return { agentFiles, editorFiles, repositoryFiles } satisfies ProjectSurfacesReport
  })

export interface ProjectSurfacesShape {
  readonly doctor: (
    params: ProjectSurfacesDoctorParams
  ) => Effect.Effect<ProjectSurfacesReport, unknown>
}

export class ProjectSurfaces extends Context.Service<ProjectSurfaces, ProjectSurfacesShape>()(
  "ingraft/ProjectSurfaces"
) {}

export const ProjectSurfacesLive = Layer.effect(
  ProjectSurfaces,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    return {
      doctor: (params: ProjectSurfacesDoctorParams) => detectSurfacesWith(fs, path, params)
    }
  })
)
