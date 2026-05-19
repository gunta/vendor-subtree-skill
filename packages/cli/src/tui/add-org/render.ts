import { glyphs, palette, type PaletteKey } from "../../app/theme.ts"
import { filteredRepos, type AddOrgState } from "./state.ts"

export interface AddOrgViewport {
  readonly width: number
  readonly height: number
  readonly colors?: boolean
  readonly icons?: boolean
}

type TextMode = "normal" | "bold" | "dim"

type ColorToken = PaletteKey | `#${string}`

interface RenderSegment {
  readonly color: ColorToken
  readonly text: string
  readonly mode?: TextMode
}

interface RenderEntry {
  readonly color?: ColorToken
  readonly line: string | ReadonlyArray<RenderSegment>
  readonly mode?: TextMode
}

const DEFAULT_VIEWPORT: AddOrgViewport = {
  height: 24,
  width: 100
}

const ROW_PREFIX_WIDTH = 6
const COLUMN_GAP = "  "
const COLUMN_WIDTHS = {
  language: 10,
  stars: 8,
  pushed: 8,
  visibility: 7
} as const

const truncateMiddle = (value: string, max: number): string => {
  if (max <= 0) return ""
  if (value.length <= max) return value.padEnd(max, " ")
  if (max === 1) return "…"
  const left = Math.ceil((max - 1) / 2)
  const right = Math.floor((max - 1) / 2)
  return `${value.slice(0, left)}…${value.slice(value.length - right)}`
}

const clampLine = (value: string, width: number): string => {
  if (width <= 0) return ""
  if (value.length <= width) return value
  if (width === 1) return "…"
  return `${value.slice(0, width - 1)}…`
}

const hexToRgb = (hex: string): readonly [number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16)
]

const colorHex = (color: ColorToken): string =>
  color in palette ? palette[color as PaletteKey] : color

const ansi = (
  value: string,
  options: AddOrgViewport,
  color: ColorToken,
  mode: TextMode = "normal"
): string => {
  if (!options.colors) return value
  const [red, green, blue] = hexToRgb(colorHex(color))
  const weight = mode === "bold" ? "1;" : mode === "dim" ? "2;" : ""
  return `\x1b[${weight}38;2;${red};${green};${blue}m${value}\x1b[0m`
}

const rawLine = (line: RenderEntry["line"]): string =>
  typeof line === "string" ? line : line.map((segment) => segment.text).join("")

const clampSegments = (
  segments: ReadonlyArray<RenderSegment>,
  width: number
): ReadonlyArray<RenderSegment> => {
  const raw = rawLine(segments)
  if (raw.length <= width) return segments
  if (width <= 0) return []
  if (width === 1) return [{ text: "…", color: segments[0]?.color ?? "text" }]

  const result: Array<RenderSegment> = []
  let used = 0
  for (const segment of segments) {
    const remaining = width - used
    if (remaining <= 0) break
    if (segment.text.length <= remaining) {
      result.push(segment)
      used += segment.text.length
      continue
    }
    result.push({
      ...segment,
      text: `${segment.text.slice(0, remaining - 1)}…`
    })
    break
  }
  return result
}

const renderEntry = (entry: RenderEntry, viewport: AddOrgViewport, width: number): string => {
  if (typeof entry.line === "string") {
    const line = clampLine(entry.line, width)
    return ansi(line, viewport, entry.color ?? "text", entry.mode)
  }

  const segments = clampSegments(entry.line, width)
  return segments
    .map((segment) => ansi(segment.text, viewport, segment.color, segment.mode ?? entry.mode))
    .join("")
}

const fitColumn = (value: string, width: number, align: "left" | "right" = "left"): string => {
  const clipped = value.length <= width ? value : width <= 1 ? "…" : `${value.slice(0, width - 1)}…`
  return align === "right" ? clipped.padStart(width) : clipped.padEnd(width)
}

const iconSet = (enabled: boolean) => ({
  added: enabled ? glyphs.success : "added",
  cursor: enabled ? glyphs.arrow : ">",
  empty: enabled ? "○" : "[ ]",
  error: enabled ? glyphs.error : "error",
  queued: enabled ? glyphs.bullet : "queued",
  running: enabled ? "⟳" : "running",
  selected: enabled ? glyphs.success : "[x]",
  sparkle: enabled ? "✦" : "*",
  star: enabled ? "★" : "stars",
  success: enabled ? glyphs.success : "success"
})

const formatStatus = (
  status: AddOrgState["runProgress"] extends ReadonlyMap<string, infer S> ? S : never,
  icons: ReturnType<typeof iconSet>
): string => {
  switch (status) {
    case "queued":
      return `${icons.queued} queued`
    case "running":
      return `${icons.running} running`
    case "success":
      return `${icons.success} done`
    case "error":
      return `${icons.error} error`
  }
}

const statusColor = (
  status: AddOrgState["runProgress"] extends ReadonlyMap<string, infer S> ? S | undefined : never
): ColorToken => {
  switch (status) {
    case "success":
      return "success"
    case "error":
      return "danger"
    case "queued":
    case "running":
      return "warning"
    default:
      return "text"
  }
}

const languageColors = [
  "#89B4FA",
  "#F9E2AF",
  "#A6E3A1",
  "#F5C2E7",
  "#FAB387",
  "#94E2D5",
  "#CBA6F7",
  "#74C7EC"
] as const

const languageColor = (language: string | null): ColorToken => {
  if (language === null || language.trim().length === 0) return "muted"
  let hash = 0
  for (const character of language.toLowerCase()) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  }
  return languageColors[hash % languageColors.length] ?? "accent"
}

const formatPushed = (pushedAt: string | null): string => {
  if (pushedAt === null) return "      —"
  const ms = Date.now() - new Date(pushedAt).getTime()
  const days = Math.floor(ms / (1000 * 60 * 60 * 24))
  if (days < 1) return "today"
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

const pushedColor = (pushedAt: string | null): ColorToken => {
  if (pushedAt === null) return "muted"
  const ms = Date.now() - new Date(pushedAt).getTime()
  const days = Math.floor(ms / (1000 * 60 * 60 * 24))
  if (days < 30) return "success"
  if (days < 180) return "accent"
  if (days < 365) return "warning"
  return "danger"
}

const formatStars = (stars: number): string => {
  if (stars >= 1_000_000) return `${(stars / 1_000_000).toFixed(1)}m`
  if (stars >= 1_000) return `${(stars / 1_000).toFixed(1)}k`
  return String(stars)
}

const visibilityColor = (visibility: string): ColorToken => {
  switch (visibility.toLowerCase()) {
    case "public":
      return "success"
    case "private":
      return "danger"
    case "internal":
      return "warning"
    default:
      return "muted"
  }
}

const appendMetadata = (
  segments: Array<RenderSegment>,
  metadata: ReadonlyArray<RenderSegment>
): void => {
  if (metadata.length === 0) return
  segments.push({ color: "muted", text: "  " })
  for (const [index, item] of metadata.entries()) {
    if (index > 0) segments.push({ color: "muted", text: COLUMN_GAP })
    segments.push(item)
  }
}

const metadataText = (metadata: ReadonlyArray<RenderSegment>): string =>
  metadata.map((part) => part.text).join(COLUMN_GAP)

const tableHeader = (width: number): RenderEntry | null => {
  if (width < 80) return null
  const metadata: ReadonlyArray<RenderSegment> = [
    { color: "muted", text: fitColumn("language", COLUMN_WIDTHS.language) },
    { color: "muted", text: fitColumn("stars", COLUMN_WIDTHS.stars, "right") },
    { color: "muted", text: fitColumn("pushed", COLUMN_WIDTHS.pushed) },
    { color: "muted", text: fitColumn("vis", COLUMN_WIDTHS.visibility) }
  ]
  const suffix = `  ${metadataText(metadata)}`
  const repoWidth = Math.max(8, width - ROW_PREFIX_WIDTH - suffix.length)
  const segments: Array<RenderSegment> = [
    {
      color: "muted",
      mode: "dim",
      text: `${" ".repeat(ROW_PREFIX_WIDTH)}${fitColumn("repo", repoWidth)}`
    }
  ]
  appendMetadata(segments, metadata)
  return { line: segments, mode: "dim" }
}

export const renderAddOrg = (
  state: AddOrgState,
  viewport: AddOrgViewport = DEFAULT_VIEWPORT
): ReadonlyArray<string> => {
  const visible = filteredRepos(state)
  const width = Math.max(20, Math.floor(viewport.width))
  const height = Math.max(6, Math.floor(viewport.height))
  const focused = visible.length === 0 ? 0 : Math.min(state.focusedIndex, visible.length - 1)
  const focusedOrdinal = visible.length === 0 ? 0 : focused + 1
  const icons = iconSet(viewport.icons ?? false)
  const checked = (enabled: boolean): string =>
    `[${enabled ? (viewport.icons ? glyphs.success : "x") : " "}]`
  const searchDisplay =
    state.filters.search.length > 0
      ? `${state.filters.search}${state.searchActive ? "_" : ""}`
      : state.searchActive
        ? "_"
        : "-"
  const summary: ReadonlyArray<RenderEntry> = [
    {
      color: "accent" as const,
      line: `╭─ ${icons.sparkle} ingraft add-org ─ ${state.owner} ─ select repositories`,
      mode: "bold" as const
    },
    {
      color: "text" as const,
      line: `│ filters  / search=${searchDisplay}  l language=${state.filters.language.join(",") || "-"}  s since=${state.filters.since ?? "-"}  v visibility=${state.filters.visibility}  o order=${state.sort}`
    },
    {
      color: "warning" as const,
      line: `│ toggles  A ${checked(state.filters.excludeArchived)} skip archived   F ${checked(state.filters.excludeForks)} skip forks`
    },
    {
      color: "success" as const,
      line: `│ ${state.selected.size} selected   repo=${focusedOrdinal}/${visible.length}   visible=${visible.length}/${state.repos.length}   strategy=${state.strategy}   concurrency=${state.concurrency}`
    },
    {
      color: "muted" as const,
      line: "│ keys     / type search  ↑/↓ move  pgup/pgdn jump  space select  a all  c clear  o order  enter run  q cancel",
      mode: "dim" as const
    },
    { color: "border" as const, line: `╰${"─".repeat(Math.max(1, width - 1))}` }
  ]
  const header = [...summary, tableHeader(width)].filter(
    (entry): entry is RenderEntry => entry !== null
  )
  const rowBudget = Math.max(0, height - header.length)
  const start = Math.max(
    0,
    Math.min(focused - Math.floor(rowBudget / 2), visible.length - rowBudget)
  )
  const rows: ReadonlyArray<RenderEntry> = visible
    .slice(start, start + rowBudget)
    .map((repo, offset) => {
      const index = start + offset
      const id = `${repo.owner}/${repo.name}`
      const label = repo.name
      const isFocused = index === state.focusedIndex
      const isSelected = state.selected.has(id)
      const isVendored = state.vendored.has(id)
      const progress = state.runProgress.get(id)
      const cursor = isFocused ? icons.cursor : " "
      const marker = isSelected ? icons.selected : icons.empty
      const tag = isVendored ? `${icons.added} added` : ""
      const status = progress ? formatStatus(progress, icons) : ""
      const language = fitColumn(repo.primaryLanguage ?? "-", COLUMN_WIDTHS.language)
      const stars = fitColumn(formatStars(repo.stars), COLUMN_WIDTHS.stars, "right")
      const pushed = fitColumn(formatPushed(repo.pushedAt), COLUMN_WIDTHS.pushed)
      const visibility = fitColumn(repo.visibility, COLUMN_WIDTHS.visibility)
      const metadata =
        width < 80
          ? [
              tag.length > 0 ? { color: "success" as const, text: tag } : null,
              status.length > 0 ? { color: statusColor(progress), text: status } : null
            ].filter((part): part is RenderSegment => part !== null)
          : [
              { color: languageColor(repo.primaryLanguage), text: language },
              { color: "warning" as const, text: stars },
              { color: pushedColor(repo.pushedAt), text: pushed },
              { color: visibilityColor(repo.visibility), text: visibility },
              tag.length > 0 ? { color: "success" as const, text: tag } : null,
              status.length > 0 ? { color: statusColor(progress), text: status } : null
            ].filter((part): part is RenderSegment => part !== null && part.text.length > 0)
      const suffix = metadata.length > 0 ? `  ${metadataText(metadata)}` : ""
      const prefix = `${cursor} ${marker} `
      const idWidth = Math.max(8, width - prefix.length - suffix.length)
      const color = progress
        ? statusColor(progress)
        : isFocused
          ? "accent"
          : isSelected
            ? "success"
            : isVendored
              ? "muted"
              : "text"
      const segments: Array<RenderSegment> = [
        {
          color,
          text: `${prefix}${truncateMiddle(label, idWidth)}`
        }
      ]
      appendMetadata(segments, metadata)
      return {
        line: segments
      } satisfies RenderEntry
    })
  return [...header, ...rows].slice(0, height).map((entry) => renderEntry(entry, viewport, width))
}
