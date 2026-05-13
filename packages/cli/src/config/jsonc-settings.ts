import { Data, Effect, Schema } from "effect"
import {
  applyEdits,
  modify,
  parse,
  printParseErrorCode,
  type ParseError
} from "jsonc-parser"

import { JsoncParseFailed, SchemaDecodeFailed } from "../domain/errors.ts"

export type SettingsMergeResult = Data.TaggedEnum<{
  Unchanged: {}
  Updated: { readonly text: string }
  Invalid: { readonly message: string }
}>
export const SettingsMergeResult = Data.taggedEnum<SettingsMergeResult>()

export type ParsedSettings = Data.TaggedEnum<{
  Valid: { readonly value: Record<string, unknown>; readonly source: string }
  Invalid: { readonly message: string; readonly source: string }
}>
export const ParsedSettings = Data.taggedEnum<ParsedSettings>()

export interface SettingsMergeState {
  readonly changed: boolean
  readonly settings: Record<string, unknown>
  readonly text: string
}

export interface ParseSettingsParams {
  readonly text: string
  readonly objectName: string
}

export interface EnsureArrayItemParams {
  readonly item: string
  readonly key: string
  readonly state: SettingsMergeState
}

export interface EnsureArrayItemsParams {
  readonly items: ReadonlyArray<string>
  readonly key: string
  readonly state: SettingsMergeState
  readonly fallback?: ReadonlyArray<string>
}

export interface EnsureArrayItemsAtPathParams {
  readonly fallback?: ReadonlyArray<string>
  readonly items: ReadonlyArray<string>
  readonly path: ReadonlyArray<string>
  readonly state: SettingsMergeState
}

export interface EnsureObjectPropertyParams {
  readonly key: string
  readonly property: string
  readonly state: SettingsMergeState
  readonly value: unknown
  readonly overwrite?: boolean
}

const formatOptions = { insertSpaces: true, tabSize: 2 }

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export const parseJsoncText = (text: string): Effect.Effect<unknown, JsoncParseFailed> =>
  Effect.try({
    try: () => {
      const errors: Array<ParseError> = []
      const value = parse(text, errors, { allowTrailingComma: true }) as unknown
      if (errors.length > 0) {
        throw new Error(errors.map((error) => printParseErrorCode(error.error)).join("; "))
      }
      return value
    },
    catch: (cause) => new JsoncParseFailed({ cause })
  })

export const parseJsoncWith =
  <S extends Schema.Top>(schema: S) =>
  (
    text: string
  ): Effect.Effect<S["Type"], JsoncParseFailed | SchemaDecodeFailed, S["DecodingServices"]> =>
    parseJsoncText(text).pipe(
      Effect.flatMap((value) =>
        Schema.decodeUnknownEffect(schema)(value).pipe(
          Effect.mapError((error) => new SchemaDecodeFailed({ source: "jsonc", issue: error.issue }))
        )
      )
    )

export const parseSettings = ({ objectName, text }: ParseSettingsParams): ParsedSettings => {
  const errors: ParseError[] = []
  const source = text.trim() === "" ? "{}\n" : text
  const value = parse(source, errors, { allowTrailingComma: true })
  if (errors.length > 0) {
    const message = errors.map((error) => printParseErrorCode(error.error)).join(", ")
    return ParsedSettings.Invalid({ message, source })
  }
  if (!isRecord(value)) {
    return ParsedSettings.Invalid({
      message: `${objectName} must contain a JSON object.`,
      source
    })
  }
  return ParsedSettings.Valid({ value, source })
}

export const initialSettingsState = (
  source: string,
  settings: Record<string, unknown>
): SettingsMergeState => ({
  changed: false,
  settings: { ...settings },
  text: source
})

const applyJsoncChange = (source: string, path: ReadonlyArray<string>, value: unknown) =>
  applyEdits(
    source,
    modify(source, [...path], value, {
      formattingOptions: formatOptions
    })
  )

const updateState = (
  state: SettingsMergeState,
  path: ReadonlyArray<string>,
  value: unknown,
  settings: Record<string, unknown>
): SettingsMergeState => ({
  changed: true,
  settings,
  text: applyJsoncChange(state.text, path, value)
})

const valueAtPath = (value: Record<string, unknown>, path: ReadonlyArray<string>): unknown =>
  path.reduce<unknown>((current, key) => (isRecord(current) ? current[key] : undefined), value)

const setValueAtPath = (
  value: Record<string, unknown>,
  path: ReadonlyArray<string>,
  next: unknown
): Record<string, unknown> => {
  const [head, ...tail] = path
  if (head === undefined) return value
  if (tail.length === 0) return { ...value, [head]: next }

  const current = value[head]
  return {
    ...value,
    [head]: setValueAtPath(isRecord(current) ? current : {}, tail, next)
  }
}

export const ensureArrayItem = ({ item, key, state }: EnsureArrayItemParams): SettingsMergeState =>
  ensureArrayItems({ items: [item], key, state })

export const ensureArrayItems = ({
  fallback = [],
  items,
  key,
  state
}: EnsureArrayItemsParams): SettingsMergeState => {
  const current = Array.isArray(state.settings[key]) ? state.settings[key] : [...fallback]
  const missing = items.filter((item) => !current.includes(item))
  if (missing.length === 0) return state

  const value = [...current, ...missing]
  return updateState(state, [key], value, {
    ...state.settings,
    [key]: value
  })
}

export const ensureArrayItemsAtPath = ({
  fallback = [],
  items,
  path,
  state
}: EnsureArrayItemsAtPathParams): SettingsMergeState => {
  const currentValue = valueAtPath(state.settings, path)
  const current = Array.isArray(currentValue) ? currentValue : [...fallback]
  const missing = items.filter((item) => !current.includes(item))
  if (missing.length === 0) return state

  const value = [...current, ...missing]
  return updateState(state, path, value, setValueAtPath(state.settings, path, value))
}

export const ensureObjectProperty = ({
  key,
  overwrite = true,
  property,
  state,
  value
}: EnsureObjectPropertyParams): SettingsMergeState => {
  const current = isRecord(state.settings[key]) ? state.settings[key] : {}
  if (!overwrite && Object.hasOwn(current, property)) return state
  if (current[property] === value) return state

  const next = { ...current, [property]: value }
  return isRecord(state.settings[key])
    ? updateState(state, [key, property], value, {
        ...state.settings,
        [key]: next
      })
    : updateState(state, [key], next, {
        ...state.settings,
        [key]: next
      })
}

export const completeMerge = (state: SettingsMergeState): SettingsMergeResult =>
  state.changed
    ? SettingsMergeResult.Updated({ text: state.text })
    : SettingsMergeResult.Unchanged()
