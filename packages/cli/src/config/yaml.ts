import { Effect, Schema } from "effect"
import { parseDocument } from "yaml"

import { SchemaDecodeFailed, YamlParseFailed } from "../domain/errors.ts"

type YamlRecord = Record<string, unknown>

const isRecord = (value: unknown): value is YamlRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const valueAtPath = (value: YamlRecord, path: ReadonlyArray<string>): unknown =>
  path.reduce<unknown>((current, key) => (isRecord(current) ? current[key] : undefined), value)

export const parseYamlText = (text: string): Effect.Effect<unknown, YamlParseFailed> =>
  Effect.try({
    try: () => {
      const document = parseDocument(text)
      if (document.errors.length > 0) {
        throw new Error(document.errors.map((e) => e.message).join("; "))
      }
      return document.toJS() as unknown
    },
    catch: (cause) => new YamlParseFailed({ cause })
  })

export const parseYamlWith =
  <S extends Schema.Top>(schema: S) =>
  (
    text: string
  ): Effect.Effect<S["Type"], YamlParseFailed | SchemaDecodeFailed, S["DecodingServices"]> =>
    parseYamlText(text).pipe(
      Effect.flatMap((value) =>
        Schema.decodeUnknownEffect(schema)(value).pipe(
          Effect.mapError((error) => new SchemaDecodeFailed({ source: "yaml", issue: error.issue }))
        )
      )
    )

const parseToRecord = (text: string): Effect.Effect<YamlRecord, YamlParseFailed> =>
  parseYamlText(text).pipe(
    Effect.flatMap((value) =>
      isRecord(value)
        ? Effect.succeed(value)
        : Effect.die(new Error("Unreachable: top-level YAML mapping is required by callers"))
    )
  )

export const yamlHasPath = (
  text: string,
  path: ReadonlyArray<string>
): Effect.Effect<boolean, YamlParseFailed> =>
  parseToRecord(text).pipe(Effect.map((value) => valueAtPath(value, path) !== undefined))
