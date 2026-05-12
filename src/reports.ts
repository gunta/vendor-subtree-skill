import { Effect, Option } from "effect"
import { ok } from "./log.ts"

export interface RelativePathParams {
  readonly root: string
  readonly path: string
}

export interface ReportWrittenParams {
  readonly cwd: string
  readonly paths: ReadonlyArray<string>
}

export interface ReportOptionalPathParams {
  readonly cwd: string
  readonly path: Option.Option<string>
}

export const relativeTo = ({ root, path }: RelativePathParams): string =>
  path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path

export const reportWritten = ({ cwd, paths }: ReportWrittenParams) =>
  Effect.forEach(
    paths,
    (path) => ok(`Updated ${relativeTo({ root: cwd, path })}`),
    { discard: true }
  )

export const reportOptionalPath = ({ cwd, path }: ReportOptionalPathParams) =>
  Option.match(path, {
    onNone: () => Effect.void,
    onSome: (value) => ok(`Updated ${relativeTo({ root: cwd, path: value })}`)
  })
