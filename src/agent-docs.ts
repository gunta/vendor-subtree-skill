import { FileSystem, Path } from "@effect/platform"
import { Array as Arr, Effect, Option } from "effect"
import {
  AGENT_DOCS,
  SECTION_BEGIN,
  SECTION_END,
  VENDOR_DIR
} from "./constants.ts"
import type { VendoredRepo } from "./vendor-state.ts"

export interface RenderVendorSectionParams {
  readonly command?: string
  readonly repos: ReadonlyArray<VendoredRepo>
  readonly scriptRel?: string
}

export interface UpdateAgentDocsParams {
  readonly cwd: string
  readonly command: string
  readonly repos: ReadonlyArray<VendoredRepo>
}

export interface InjectSectionParams {
  readonly content: string
  readonly section: string
}

interface AgentDocTarget {
  readonly target: string
  readonly real: string
}

interface TargetWithRealPathParams {
  readonly fs: FileSystem.FileSystem
  readonly target: string
}

interface AgentDocTargetsParams {
  readonly cwd: string
  readonly fs: FileSystem.FileSystem
  readonly path: Path.Path
}

interface WriteSectionIfChangedParams {
  readonly fs: FileSystem.FileSystem
  readonly section: string
  readonly target: string
}

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const vendorRepoLines = (
  invocation: string,
  repos: ReadonlyArray<VendoredRepo>
): ReadonlyArray<string> =>
  repos.length === 0
    ? [`_No repositories vendored yet. Run \`${invocation} add <repo>\`._`]
    : [
        "**Vendored repositories:**",
        "",
        ...repos.map(
          (repo) => `- **\`${repo.prefix}\`** — \`${repo.url}\` @ \`${repo.ref}\``
        )
      ]

export const renderVendorSection = ({
  command,
  repos,
  scriptRel
}: RenderVendorSectionParams): string => {
  const invocation = command ?? `bun ${scriptRel ?? "scripts/vendor.ts"}`
  return [
    SECTION_BEGIN,
    "## Vendored Repositories",
    "",
    `This project vendors external repositories under \`${VENDOR_DIR}/\` via \`git subtree\`.`,
    "Treat these as **read-only reference material**, not as part of the application codebase.",
    "",
    "**Rules:**",
    `- Do NOT edit files under \`${VENDOR_DIR}/\` unless explicitly asked.`,
    `- Do NOT import from \`${VENDOR_DIR}/\` — application code imports from normal package dependencies.`,
    `- Prefer examples and patterns from \`${VENDOR_DIR}/\` over web search or generated guesses.`,
    `- Use \`${invocation} list\` to see what is vendored.`,
    `- To add or update vendored repos, run \`${invocation} add <repo>\` or \`update <name>\`.`,
    "",
    ...vendorRepoLines(invocation, repos),
    "",
    SECTION_END
  ].join("\n")
}

export const injectSection = ({
  content,
  section
}: InjectSectionParams): string => {
  const managedSection = new RegExp(
    `${escapeRegex(SECTION_BEGIN)}[\\s\\S]*?${escapeRegex(SECTION_END)}`
  )
  if (managedSection.test(content)) return content.replace(managedSection, section)

  const normalized = content && !content.endsWith("\n") ? `${content}\n` : content
  const prefix = normalized ? `${normalized}\n` : ""
  return `${prefix}${section}\n`
}

const agentDocTargets = ({ cwd, fs, path }: AgentDocTargetsParams) =>
  Effect.filter(AGENT_DOCS, (name) => fs.exists(path.resolve(cwd, name))).pipe(
    Effect.map((names) =>
      names.length > 0
        ? names.map((name) => path.resolve(cwd, name))
        : [path.resolve(cwd, "AGENTS.md")]
    )
  )

const targetWithRealPath = ({ fs, target }: TargetWithRealPathParams) =>
  fs.exists(target).pipe(
    Effect.flatMap((exists) =>
      exists
        ? fs.realPath(target).pipe(Effect.orElseSucceed(() => target))
        : Effect.succeed(target)
    ),
    Effect.map((real) => ({ real, target }))
  )

const uniqueTargets = (
  targets: ReadonlyArray<AgentDocTarget>
): ReadonlyArray<AgentDocTarget> =>
  targets.filter(
    (target, index) => targets.findIndex((it) => it.real === target.real) === index
  )

const writeSectionIfChanged = ({
  fs,
  section,
  target
}: WriteSectionIfChangedParams) =>
  fs.exists(target).pipe(
    Effect.flatMap((exists) =>
      exists ? fs.readFileString(target) : Effect.succeed("")
    ),
    Effect.flatMap((content) => {
      const next = injectSection({ content, section })
      return next === content
        ? Effect.succeed(Option.none())
        : fs.writeFileString(target, next).pipe(Effect.as(Option.some(target)))
    })
  )

export const updateAgentDocs = ({
  command,
  cwd,
  repos
}: UpdateAgentDocsParams) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const section = renderVendorSection({ command, repos })

    return yield* agentDocTargets({ cwd, fs, path }).pipe(
      Effect.flatMap((targets) =>
        Effect.forEach(targets, (target) => targetWithRealPath({ fs, target }))
      ),
      Effect.map(uniqueTargets),
      Effect.flatMap((targets) =>
        Effect.forEach(targets, ({ target }) =>
          writeSectionIfChanged({ fs, section, target })
        )
      ),
      Effect.map(Arr.getSomes)
    )
  })
