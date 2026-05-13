import { Effect, FileSystem, Option, Path } from "effect"

import { packageJsonHasDependency } from "../config/package-json.ts"
import { VENDOR_DIR } from "../domain/constants.ts"

export { VENDOR_DIR }
export const VENDOR_IGNORE_DIR = `${VENDOR_DIR}/`
export const VENDOR_GLOB = `${VENDOR_DIR}/**`
export const VENDOR_NEGATED_GLOB = `!${VENDOR_GLOB}`

export type ToolIgnoreStatus = "absent" | "configured" | "missing" | "visible" | "unsupported"

export interface ToolIgnoreReport {
  readonly _tag: "ToolIgnoreReport"
  readonly tool: string
  readonly detected: boolean
  readonly ignored: boolean
  readonly status: ToolIgnoreStatus
  readonly message: string
  readonly configPath?: string
}

export interface ToolIgnoreIntegration {
  readonly doctor: (cwd: string) => Effect.Effect<ToolIgnoreReport, unknown>
  readonly refresh: (cwd: string) => Effect.Effect<Option.Option<string>, unknown>
}

export interface ToolFileContext {
  readonly fs: FileSystem.FileSystem
  readonly path: Path.Path
}

export const report = (params: Omit<ToolIgnoreReport, "_tag">): ToolIgnoreReport => ({
  _tag: "ToolIgnoreReport",
  ...params
})

export const firstExisting = (
  { fs, path }: ToolFileContext,
  cwd: string,
  candidates: ReadonlyArray<string>
) =>
  Effect.gen(function* () {
    for (const candidate of candidates) {
      const absolute = path.resolve(cwd, candidate)
      if (yield* fs.exists(absolute)) return Option.some(absolute)
    }
    return Option.none<string>()
  })

export const packageHasDependency = (
  { fs, path }: ToolFileContext,
  cwd: string,
  names: ReadonlyArray<string>
) =>
  Effect.gen(function* () {
    const target = path.resolve(cwd, "package.json")
    if (!(yield* fs.exists(target))) return false
    return yield* packageJsonHasDependency(yield* fs.readFileString(target), names).pipe(
      Effect.orElseSucceed(() => false)
    )
  })

export const hasVendorPattern = (
  content: string,
  patterns: ReadonlyArray<string> = [VENDOR_GLOB, VENDOR_IGNORE_DIR, VENDOR_DIR]
): boolean => patterns.some((pattern) => content.includes(pattern))

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const trimTrailingBlankLines = (content: string): string => content.replace(/\n+$/g, "")

export const mergeManagedIgnoreSection = ({
  begin,
  content,
  end,
  lines
}: {
  readonly begin: string
  readonly content: string
  readonly end: string
  readonly lines: ReadonlyArray<string>
}): string => {
  const normalized = trimTrailingBlankLines(content)
  const section = [begin, ...lines, end].join("\n")
  const sectionRegex = new RegExp(`(?:^|\\n)${escapeRegex(begin)}[\\s\\S]*?${escapeRegex(end)}\\n?`)
  const next = sectionRegex.test(normalized)
    ? normalized.replace(sectionRegex, `\n${section}`)
    : [normalized, section].filter((part) => part.length > 0).join("\n\n")

  return `${trimTrailingBlankLines(next)}\n`
}
