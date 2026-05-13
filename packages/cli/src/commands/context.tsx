import { Console, Effect } from "effect"
import { Argument, Command, Flag } from "effect/unstable/cli"

import {
  contextPackPlan,
  contextSourcePlan,
  detectContextTools,
  formatContextCommandPlan,
  runContextCommandPlan,
  type ContextToolReport
} from "../context-tools/service.ts"
import { repoRoot } from "../services/git.ts"

export interface ContextToolsCommandParams {
  readonly json: boolean
}

export interface ContextPackCommandParams {
  readonly compress: boolean
  readonly paths: ReadonlyArray<string>
}

export interface ContextSourceCommandParams {
  readonly target: string
}

const contextJsonOption = Flag.boolean("json").pipe(
  Flag.withDescription("Output machine-readable JSON to stdout.")
)

const contextCompressOption = Flag.boolean("compress").pipe(
  Flag.withDescription("Ask Repomix to use Tree-sitter compression.")
)

const contextPackPathsArg = Argument.string("path").pipe(
  Argument.withDescription("Path to pack. Defaults to vendor/."),
  Argument.variadic()
)

const contextSourceTargetArg = Argument.string("target").pipe(
  Argument.withDescription(
    "OpenSrc package or repository target, for example zod or pypi:requests."
  )
)

const statusLabel = (tool: ContextToolReport): string => (tool.detected ? tool.status : "available")

const renderSection = ({ content, title }: { readonly content: string; readonly title: string }) =>
  `== ${title} ==\n${content}`

const renderKeyValues = (
  entries: ReadonlyArray<{ readonly label: string; readonly value: string }>
) => {
  const width = entries.reduce((max, entry) => Math.max(max, entry.label.length), 0)
  return entries.map((entry) => `${entry.label.padEnd(width)}  ${entry.value}`).join("\n")
}

const renderToolTable = (tools: ReadonlyArray<ContextToolReport>) => {
  if (tools.length === 0) return "No optional context tools configured."
  return tools
    .map((tool) => {
      const evidence = tool.evidence.length === 0 ? "-" : tool.evidence.join(", ")
      return `${tool.name.padEnd(8)} ${statusLabel(tool).padEnd(10)} ${tool.command.padEnd(32)} ${evidence}`
    })
    .join("\n")
}

const renderContextTools = (tools: ReadonlyArray<ContextToolReport>): string =>
  [
    renderSection({
      title: "Context tools",
      content: renderKeyValues([
        { label: "State model", value: "git-native vendor metadata" },
        { label: "Curated wrappers", value: "Repomix, OpenSrc, Repobase" }
      ])
    }),
    renderSection({
      title: "Optional tools",
      content: [
        "Tool     Status     Command                          Evidence",
        renderToolTable(tools)
      ].join("\n")
    })
  ].join("\n\n")

export const contextToolsImpl = ({ json }: ContextToolsCommandParams) =>
  Effect.gen(function* () {
    const cwd = yield* repoRoot
    const tools = yield* detectContextTools({ cwd })
    if (json) {
      yield* Console.log(JSON.stringify({ tools }, null, 2))
      return
    }
    yield* Console.log(renderContextTools(tools))
  })

export const contextPackImpl = ({ compress, paths }: ContextPackCommandParams) =>
  Effect.gen(function* () {
    const cwd = yield* repoRoot
    const plan = contextPackPlan({ compress, paths })
    yield* Console.log(`Running ${plan.label}: ${formatContextCommandPlan(plan)}`)
    yield* runContextCommandPlan({ cwd, plan })
  })

export const contextSourceImpl = ({ target }: ContextSourceCommandParams) =>
  Effect.gen(function* () {
    const cwd = yield* repoRoot
    const plan = contextSourcePlan({ target })
    yield* runContextCommandPlan({ cwd, plan })
  })

const contextPackCmd = Command.make(
  "pack",
  {
    compress: contextCompressOption,
    paths: contextPackPathsArg
  },
  contextPackImpl
).pipe(Command.withDescription("Run Repomix against vendor/ or selected paths."))

const contextSourceCmd = Command.make(
  "source",
  {
    target: contextSourceTargetArg
  },
  contextSourceImpl
).pipe(
  Command.withDescription("Run OpenSrc and print the cached source path for a package or repo.")
)

export const contextCmd = Command.make(
  "context",
  { json: contextJsonOption },
  contextToolsImpl
).pipe(
  Command.withDescription(
    "Detect curated optional context tools that complement vendored source."
  ),
  Command.withSubcommands([contextPackCmd, contextSourceCmd])
)
