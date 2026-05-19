import { Box, Text } from "ink"
import type { ReactNode } from "react"

import { glyphs, palette } from "../theme.ts"

export interface HeaderProps {
  readonly title: string
  readonly subtitle?: string
}

export const Header = ({ subtitle, title }: HeaderProps) => (
  <Box flexDirection="row" columnGap={1} marginBottom={1}>
    <Text bold color={palette.accent}>
      {title}
    </Text>
    {subtitle ? <Text color={palette.muted}>{subtitle}</Text> : null}
  </Box>
)

export interface SectionProps {
  readonly title: string
  readonly children: ReactNode
}

export const Section = ({ children, title }: SectionProps) => (
  <Box flexDirection="column" marginBottom={1}>
    <Box marginBottom={1}>
      <Text bold color={palette.accent}>
        {title}
      </Text>
    </Box>
    <Box flexDirection="column" paddingLeft={2}>
      {children}
    </Box>
  </Box>
)

export interface KeyValuesProps {
  readonly entries: ReadonlyArray<{ readonly label: string; readonly value: string }>
}

export const KeyValues = ({ entries }: KeyValuesProps) => {
  const labelWidth = entries.reduce((width, entry) => Math.max(width, entry.label.length), 0)
  return (
    <Box flexDirection="column">
      {entries.map((entry) => (
        <Box key={entry.label} flexDirection="row" columnGap={2}>
          <Box width={labelWidth}>
            <Text color={palette.muted}>{entry.label}</Text>
          </Box>
          <Text color={palette.text}>{entry.value}</Text>
        </Box>
      ))}
    </Box>
  )
}

export interface TableColumn<Row> {
  readonly color?: (row: Row, index: number) => string | undefined
  readonly header: string
  readonly maxWidth?: number
  readonly minWidth?: number
  readonly value: (row: Row, index: number) => string
}

export interface TableProps<Row> {
  readonly columns: ReadonlyArray<TableColumn<Row>>
  readonly empty: string
  readonly rows: ReadonlyArray<Row>
}

export const Table = <Row,>({ columns, empty, rows }: TableProps<Row>) => {
  if (rows.length === 0) {
    return <Text color={palette.muted}>{empty}</Text>
  }

  const widths = columns.map((column) => {
    const dataWidth = rows.reduce(
      (max, row, rowIndex) => Math.max(max, column.value(row, rowIndex).length),
      column.header.length
    )
    const width = Math.max(dataWidth, column.minWidth ?? 0)
    return column.maxWidth === undefined ? width : Math.min(width, column.maxWidth)
  })

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" columnGap={2}>
        {columns.map((column, index) => {
          const isLast = index === columns.length - 1
          return (
            <Box
              key={column.header}
              width={isLast ? undefined : widths[index]}
              flexGrow={isLast ? 1 : 0}
              flexShrink={isLast ? 1 : 0}
            >
              <Text bold wrap="truncate-end" color={palette.muted}>
                {column.header}
              </Text>
            </Box>
          )
        })}
      </Box>
      {rows.map((row, rowIndex) => (
        <Box key={rowIndex} flexDirection="row" columnGap={2}>
          {columns.map((column, columnIndex) => {
            const isLast = columnIndex === columns.length - 1
            return (
              <Box
                key={column.header}
                width={isLast ? undefined : widths[columnIndex]}
                flexGrow={isLast ? 1 : 0}
                flexShrink={isLast ? 1 : 0}
              >
                <Text wrap="truncate-end" color={column.color?.(row, rowIndex) ?? palette.text}>
                  {column.value(row, rowIndex)}
                </Text>
              </Box>
            )
          })}
        </Box>
      ))}
    </Box>
  )
}

export type StatusKind = "success" | "error" | "warning" | "info" | "step"

const statusColor: Record<StatusKind, string> = {
  error: palette.danger,
  info: palette.accent,
  step: palette.muted,
  success: palette.success,
  warning: palette.warning
}

const statusGlyph: Record<StatusKind, string> = {
  error: glyphs.error,
  info: glyphs.info,
  step: glyphs.arrow,
  success: glyphs.success,
  warning: glyphs.warning
}

export interface StatusLineProps {
  readonly kind: StatusKind
  readonly label: string
  readonly detail?: string
}

export const StatusLine = ({ detail, kind, label }: StatusLineProps) => (
  <Box flexDirection="row" columnGap={1}>
    <Text color={statusColor[kind]}>{statusGlyph[kind]}</Text>
    <Text color={palette.text}>{label}</Text>
    {detail ? <Text color={palette.muted}>{detail}</Text> : null}
  </Box>
)

export interface NoticeProps {
  readonly kind: StatusKind
  readonly title: string
  readonly message?: string
}

export const Notice = ({ kind, message, title }: NoticeProps) => (
  <Box
    flexDirection="column"
    borderStyle="round"
    borderColor={statusColor[kind]}
    paddingX={1}
    marginBottom={1}
  >
    <Box flexDirection="row" columnGap={1}>
      <Text color={statusColor[kind]}>{statusGlyph[kind]}</Text>
      <Text bold color={statusColor[kind]}>
        {title}
      </Text>
    </Box>
    {message ? <Text color={palette.text}>{message}</Text> : null}
  </Box>
)
