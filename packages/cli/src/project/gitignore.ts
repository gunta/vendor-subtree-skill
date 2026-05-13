import { Array as Arr, Effect, FileSystem, Option, Path } from "effect"

export const GITIGNORE_CLONE_BEGIN = "# ingraft: clone-ignore begin"
export const GITIGNORE_CLONE_END = "# ingraft: clone-ignore end"

export interface MergeGitignoreTextParams {
  readonly content: string
  readonly prefixes: ReadonlyArray<string>
}

export interface UpdateGitignoreParams {
  readonly cwd: string
  readonly prefixes: ReadonlyArray<string>
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const normalizePrefix = (prefix: string): string => prefix.replace(/^\/+/, "").replace(/\/+$/, "")

const ignoredPrefix = (prefix: string): string => `/${normalizePrefix(prefix)}/`

const uniqueIgnoredPrefixes = (prefixes: ReadonlyArray<string>): ReadonlyArray<string> =>
  Arr.dedupe(prefixes.map(ignoredPrefix)).sort((a, b) => a.localeCompare(b))

const sectionRegex = new RegExp(
  `(?:^|\\n)${escapeRegex(GITIGNORE_CLONE_BEGIN)}[\\s\\S]*?${escapeRegex(GITIGNORE_CLONE_END)}\\n?`
)

const renderSection = (prefixes: ReadonlyArray<string>): string =>
  [GITIGNORE_CLONE_BEGIN, ...uniqueIgnoredPrefixes(prefixes), GITIGNORE_CLONE_END].join("\n")

const trimTrailingBlankLines = (content: string): string => content.replace(/\n+$/g, "")

export const mergeGitignoreText = ({ content, prefixes }: MergeGitignoreTextParams): string => {
  const normalized = trimTrailingBlankLines(content)
  if (prefixes.length === 0) {
    const next = normalized.replace(sectionRegex, "").replace(/\n{3,}/g, "\n\n")
    return next === "" ? "" : `${trimTrailingBlankLines(next)}\n`
  }

  const section = renderSection(prefixes)
  const next = sectionRegex.test(normalized)
    ? normalized.replace(sectionRegex, `\n${section}`)
    : [normalized, section].filter((part) => part.length > 0).join("\n\n")

  return `${trimTrailingBlankLines(next)}\n`
}

export const updateGitignore = ({ cwd, prefixes }: UpdateGitignoreParams) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const target = path.resolve(cwd, ".gitignore")
    const content = (yield* fs.exists(target)) ? yield* fs.readFileString(target) : ""
    const next = mergeGitignoreText({ content, prefixes })

    if (next === content) return Option.none<string>()
    if (next === "") {
      yield* fs.remove(target, { force: true })
      return Option.some(target)
    }

    yield* fs.writeFileString(target, next)
    return Option.some(target)
  })
