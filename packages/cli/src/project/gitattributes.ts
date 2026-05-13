import { Array as Arr, Effect, FileSystem, Option, Path } from "effect"

export const GITATTRIBUTES_VENDOR_BEGIN = "# ingraft: github-diff begin"
export const GITATTRIBUTES_VENDOR_END = "# ingraft: github-diff end"

export interface MergeGitattributesTextParams {
  readonly content: string
  readonly prefixes: ReadonlyArray<string>
}

export interface UpdateGitattributesParams {
  readonly cwd: string
  readonly prefixes: ReadonlyArray<string>
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const normalizePrefix = (prefix: string): string => prefix.replace(/^\/+/, "").replace(/\/+$/, "")

const attributePattern = (prefix: string): string =>
  `/${normalizePrefix(prefix)}/** linguist-vendored linguist-generated`

const uniqueAttributePatterns = (prefixes: ReadonlyArray<string>): ReadonlyArray<string> =>
  Arr.dedupe(prefixes.map(attributePattern)).sort((a, b) => a.localeCompare(b))

const sectionRegex = new RegExp(
  `(?:^|\\n)${escapeRegex(GITATTRIBUTES_VENDOR_BEGIN)}[\\s\\S]*?${escapeRegex(
    GITATTRIBUTES_VENDOR_END
  )}\\n?`
)

const renderSection = (prefixes: ReadonlyArray<string>): string =>
  [
    GITATTRIBUTES_VENDOR_BEGIN,
    "# Hide committed vendored subtree source in GitHub PR diffs by default.",
    ...uniqueAttributePatterns(prefixes),
    GITATTRIBUTES_VENDOR_END
  ].join("\n")

const trimTrailingBlankLines = (content: string): string => content.replace(/\n+$/g, "")

export const mergeGitattributesText = ({
  content,
  prefixes
}: MergeGitattributesTextParams): string => {
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

export const updateGitattributes = ({ cwd, prefixes }: UpdateGitattributesParams) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const target = path.resolve(cwd, ".gitattributes")
    const content = (yield* fs.exists(target)) ? yield* fs.readFileString(target) : ""
    const next = mergeGitattributesText({ content, prefixes })

    if (next === content) return Option.none<string>()
    if (next === "") {
      yield* fs.remove(target, { force: true })
      return Option.some(target)
    }

    yield* fs.writeFileString(target, next)
    return Option.some(target)
  })
