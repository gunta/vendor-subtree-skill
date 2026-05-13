import { VERSION } from "../domain/constants.ts"

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`
const green = (s: string) => `\x1b[32m${s}\x1b[0m`
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`

interface SubcommandEntry {
  readonly name: string
  readonly args?: string
  readonly description: string
}

const commands: readonly SubcommandEntry[] = [
  {
    name: "add",
    args: "<repo>...",
    description: "Add vendored repositories, aliases, or npm packages."
  },
  {
    name: "update",
    args: "[<name>]",
    description: "Pull upstream changes for one or all vendored repos."
  },
  { name: "remove", args: "<name>", description: "Remove a vendored repository." },
  { name: "list", description: "List vendored repositories." },
  { name: "deps", description: "Scan package manifests and vendor matched dependency sources." },
  {
    name: "init",
    description: "Bootstrap agent docs, gitignore, editor settings, and tool ignores."
  },
  { name: "refresh", description: "Re-generate project surfaces from current git state." },
  { name: "context", description: "Detect or run optional context tools (Repomix, OpenSrc)." },
  { name: "doctor", description: "Inspect vendored repos and detected tool status." }
]

export function printRootHelp(): void {
  const lines: string[] = []

  lines.push("")
  lines.push(
    `  ${bold("ingraft")} ${dim(`v${VERSION}`)} ${dim("— git reference manager for coding agents")}`
  )
  lines.push("")
  lines.push(`  ${bold("USAGE")}`)
  lines.push("")
  lines.push(`    ${dim("$")} ${cyan("ingraft")} ${dim("<repo>...")}       Add repos directly`)
  lines.push(`    ${dim("$")} ${cyan("ingraft")} ${dim("<command>")}       Run a subcommand`)
  lines.push(`    ${dim("$")} ${cyan("ingraft")}                 Open the interactive TUI`)
  lines.push("")
  lines.push(`  ${bold("COMMANDS")}`)
  lines.push("")

  const maxName = Math.max(...commands.map((c) => (c.args ? `${c.name} ${c.args}` : c.name).length))

  for (const cmd of commands) {
    const rawLabel = cmd.args ? `${cmd.name} ${cmd.args}` : cmd.name
    const padding = " ".repeat(maxName - rawLabel.length + 2)
    lines.push(
      `    ${green(cmd.name)}${cmd.args ? ` ${dim(cmd.args)}` : ""}${padding}${dim(cmd.description)}`
    )
  }

  lines.push("")
  lines.push(`  ${bold("OPTIONS")}`)
  lines.push("")
  lines.push(`    ${yellow("-h")}, ${yellow("--help")}             Show this help message.`)
  lines.push(`    ${yellow("--version")}              Show version number.`)
  lines.push("")
  lines.push(`  Run ${cyan("ingraft <command> --help")} for details on a specific command.`)
  lines.push("")

  console.log(lines.join("\n"))
}

const noisePatterns = [
  /^\s*A user-defined piece of text(?:\s+that is confidential)?\.$/,
  /^\s*A true or false value\.$/,
  /^\s*This setting is optional\.$/,
  /^\s*This argument (?:may|must) be repeated.*$/,
  /^\s*This option may be repeated.*$/,
  /^\s*One of the following:.*$/
]

export function cleanHelpOutput(text: string): string {
  return text
    .split("\n")
    .filter((line) => !noisePatterns.some((p) => p.test(line)))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
}

export function shouldShowRootHelp(argv: readonly string[]): boolean {
  const args = argv.slice(2)
  if (args.length === 0) return false
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) return true
  return false
}

export function isSubcommandHelp(argv: readonly string[]): boolean {
  const args = argv.slice(2)
  return args.length >= 2 && (args.includes("--help") || args.includes("-h"))
}
