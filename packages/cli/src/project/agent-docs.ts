import { Array as Arr, Effect, FileSystem, Option, Path } from "effect"

import {
  AGENT_DOC_FILES,
  AGENT_DOC_RULE_DIRECTORIES,
  DEFAULT_AGENT_DOC,
  SECTION_BEGIN,
  SECTION_END,
  VENDOR_DIR
} from "../domain/constants.ts"
import { hasVendorFilter } from "../domain/vendor-filter.ts"
import type { VendoredRepo } from "../domain/vendor-state.ts"

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

interface AgentDocRuleDirectoryTargetsParams extends AgentDocTargetsParams {
  readonly directory: (typeof AGENT_DOC_RULE_DIRECTORIES)[number]
}

interface WriteSectionIfChangedParams {
  readonly fs: FileSystem.FileSystem
  readonly section: string
  readonly target: string
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const isFileTarget = (fs: FileSystem.FileSystem, target: string) =>
  fs.stat(target).pipe(
    Effect.map((info) => info.type !== "Directory"),
    Effect.catch(() => Effect.succeed(false))
  )

const existingAgentDocFileTargets = ({ cwd, fs, path }: AgentDocTargetsParams) =>
  Effect.filter(
    AGENT_DOC_FILES.map((spec) => path.resolve(cwd, spec.path)),
    (target) => isFileTarget(fs, target)
  )

const normalizePath = (value: string): string => value.replaceAll("\\", "/")

const matchesRuleFile = (
  relativePath: string,
  directory: (typeof AGENT_DOC_RULE_DIRECTORIES)[number]
) => {
  const normalized = normalizePath(relativePath)
  return directory.suffixes.some((suffix) => normalized.endsWith(suffix))
}

const agentDocRuleDirectoryTargets = ({
  cwd,
  directory,
  fs,
  path
}: AgentDocRuleDirectoryTargetsParams): Effect.Effect<ReadonlyArray<string>> =>
  Effect.gen(function* () {
    const absoluteDirectory = path.resolve(cwd, directory.path)
    const info = yield* fs.stat(absoluteDirectory).pipe(Effect.option)
    if (Option.isNone(info) || info.value.type !== "Directory") return []

    const entries = yield* fs
      .readDirectory(absoluteDirectory, { recursive: true })
      .pipe(Effect.catch(() => Effect.succeed([] as ReadonlyArray<string>)))

    return entries
      .filter((entry) => matchesRuleFile(entry, directory))
      .map((entry) => path.resolve(absoluteDirectory, entry))
  })

const vendorRepoLines = (
  invocation: string,
  repos: ReadonlyArray<VendoredRepo>
): ReadonlyArray<string> =>
  repos.length === 0
    ? [`_No durable source routes yet. Run \`${invocation} add <repo>\`._`]
    : [
        "**Durable source routes:**",
        "",
        ...repos.map(
          (repo) =>
            `- **\`${repo.prefix}\`** — ${repo.strategy}${hasVendorFilter(repo.filter) ? " filtered" : ""} — \`${repo.url}\` @ \`${repo.ref}\``
        )
      ]

export const renderVendorSection = ({
  command,
  repos,
  scriptRel
}: RenderVendorSectionParams): string => {
  const invocation = command ?? (scriptRel ? `bun ${scriptRel}` : "bunx @ingraft/cli@latest")
  return [
    SECTION_BEGIN,
    "## Durable Source Routes",
    "",
    `This project routes durable upstream source under \`${VENDOR_DIR}/\` via \`ingraft\`.`,
    "Treat these as **read-only reference material**, not as part of the application codebase.",
    "",
    "**Rules:**",
    `- Do NOT edit files under \`${VENDOR_DIR}/\` unless explicitly asked.`,
    `- Do NOT import from \`${VENDOR_DIR}/\` — application code imports from normal package dependencies.`,
    `- Prefer examples and patterns from \`${VENDOR_DIR}/\` over web search or generated guesses.`,
    `- \`${VENDOR_DIR}/\` stays visible to agents and language tooling; generated ignores target formatters, linters, and analyzers only.`,
    "- Committed subtree sources are marked in `.gitattributes` as vendored/generated so GitHub PR diffs stay focused on project code.",
    "- Strategies: `subtree` is committed source, `submodule` is a gitlink, `clone-ignore` is a local ignored clone, and `cache-link` is an ignored symlink to a shared cache checkout.",
    "- Some repos may be filtered to omit media, generated directories, archives, fixtures, or oversized files.",
    `- Use \`${invocation} list\` to see durable source routes.`,
    `- To add or update durable source routes, run \`${invocation} add <repo>\`, \`update\`, or \`update <name>\`.`,
    "",
    ...vendorRepoLines(invocation, repos),
    "",
    SECTION_END
  ].join("\n")
}

export const injectSection = ({ content, section }: InjectSectionParams): string => {
  const managedSection = new RegExp(
    `${escapeRegex(SECTION_BEGIN)}[\\s\\S]*?${escapeRegex(SECTION_END)}`
  )
  if (managedSection.test(content)) return content.replace(managedSection, section)

  const normalized = content && !content.endsWith("\n") ? `${content}\n` : content
  const prefix = normalized ? `${normalized}\n` : ""
  return `${prefix}${section}\n`
}

const agentDocTargets = ({ cwd, fs, path }: AgentDocTargetsParams) =>
  Effect.gen(function* () {
    const fileTargets = yield* existingAgentDocFileTargets({ cwd, fs, path })
    const directoryTargets = yield* Effect.forEach(
      AGENT_DOC_RULE_DIRECTORIES,
      (directory) => agentDocRuleDirectoryTargets({ cwd, directory, fs, path }),
      { concurrency: 4 }
    )
    const targets = [...fileTargets, ...directoryTargets.flat()]
    return targets.length > 0 ? targets : [path.resolve(cwd, DEFAULT_AGENT_DOC)]
  })

const targetWithRealPath = ({ fs, target }: TargetWithRealPathParams) =>
  fs.exists(target).pipe(
    Effect.flatMap((exists) =>
      exists ? fs.realPath(target).pipe(Effect.orElseSucceed(() => target)) : Effect.succeed(target)
    ),
    Effect.map((real) => ({ real, target }))
  )

const uniqueTargets = (targets: ReadonlyArray<AgentDocTarget>): ReadonlyArray<AgentDocTarget> =>
  targets.filter((target, index) => targets.findIndex((it) => it.real === target.real) === index)

const writeSectionIfChanged = ({ fs, section, target }: WriteSectionIfChangedParams) =>
  fs.stat(target).pipe(
    Effect.option,
    Effect.flatMap((info) => {
      if (Option.isSome(info) && info.value.type === "Directory") {
        return Effect.succeed(Option.none<string>())
      }
      return (Option.isSome(info) ? fs.readFileString(target) : Effect.succeed("")).pipe(
        Effect.flatMap((content) => {
          const next = injectSection({ content, section })
          return next === content
            ? Effect.succeed(Option.none<string>())
            : fs.writeFileString(target, next).pipe(Effect.as(Option.some(target)))
        })
      )
    })
  )

export const updateAgentDocs = ({ command, cwd, repos }: UpdateAgentDocsParams) =>
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
        Effect.forEach(targets, ({ target }) => writeSectionIfChanged({ fs, section, target }))
      ),
      Effect.map(Arr.getSomes)
    )
  })
