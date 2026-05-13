import * as TOML from "@iarna/toml"
import { Effect, Schema } from "effect"

import { SchemaDecodeFailed, TomlParseFailed } from "../domain/errors.ts"

type TomlRecord = Record<string, unknown>

const isRecord = (value: unknown): value is TomlRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const valueAtPath = (value: TomlRecord, path: ReadonlyArray<string>): unknown =>
  path.reduce<unknown>((current, key) => (isRecord(current) ? current[key] : undefined), value)

export const parseTomlText = (text: string): Effect.Effect<unknown, TomlParseFailed> =>
  Effect.try({
    try: () => TOML.parse(text) as unknown,
    catch: (cause) => new TomlParseFailed({ cause })
  })

export const parseTomlWith =
  <S extends Schema.Top>(schema: S) =>
  (text: string): Effect.Effect<S["Type"], TomlParseFailed | SchemaDecodeFailed, S["DecodingServices"]> =>
    parseTomlText(text).pipe(
      Effect.flatMap((value) =>
        Schema.decodeUnknownEffect(schema)(value).pipe(
          Effect.mapError((error) => new SchemaDecodeFailed({ source: "toml", issue: error.issue }))
        )
      )
    )

const parseToRecord = (text: string): Effect.Effect<TomlRecord, TomlParseFailed> =>
  parseTomlText(text).pipe(
    Effect.flatMap((value) =>
      isRecord(value)
        ? Effect.succeed(value)
        : Effect.die(
            new Error("Unreachable: TOML.parse always returns a record on success per TOML 1.0 spec")
          )
    )
  )

export const tomlHasPath = (
  text: string,
  path: ReadonlyArray<string>
): Effect.Effect<boolean, TomlParseFailed> =>
  parseToRecord(text).pipe(Effect.map((value) => valueAtPath(value, path) !== undefined))

export const tomlPathHasArrayValue = (
  text: string,
  path: ReadonlyArray<string>,
  expected: string
): Effect.Effect<boolean, TomlParseFailed> =>
  parseToRecord(text).pipe(
    Effect.map((value) => {
      const current = valueAtPath(value, path)
      return (
        Array.isArray(current) &&
        current.some((item) => typeof item === "string" && item === expected)
      )
    })
  )

export const tomlPathHasAnyArrayValue = (
  text: string,
  path: ReadonlyArray<string>,
  expected: ReadonlyArray<string>
): Effect.Effect<boolean, TomlParseFailed> =>
  parseToRecord(text).pipe(
    Effect.map((value) => {
      const current = valueAtPath(value, path)
      if (!Array.isArray(current)) return false
      return expected.some((needle) =>
        current.some((item) => typeof item === "string" && item === needle)
      )
    })
  )
