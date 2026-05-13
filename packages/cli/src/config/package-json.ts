import { Effect, Option } from "effect"
import { parse, type ParseError } from "jsonc-parser"

import { JsonParseFailed } from "../domain/errors.ts"

export interface PackageJsonShape {
  readonly dependencies?: Record<string, unknown>
  readonly devDependencies?: Record<string, unknown>
  readonly optionalDependencies?: Record<string, unknown>
  readonly peerDependencies?: Record<string, unknown>
}

const dependencySections = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies"
] as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const parsePackageJsonShapeSync = (text: string): PackageJsonShape => {
  const errors: ParseError[] = []
  const value = parse(text, errors, {
    allowTrailingComma: true,
    disallowComments: false
  })
  if (errors.length > 0 || !isRecord(value)) {
    throw new Error(
      errors.length > 0
        ? `package.json parse errors: ${errors.map((e) => String(e.error)).join("; ")}`
        : "package.json top-level value is not an object"
    )
  }
  return value as PackageJsonShape
}

export const parsePackageJsonShape = (
  text: string
): Effect.Effect<PackageJsonShape, JsonParseFailed> =>
  Effect.try({
    try: () => parsePackageJsonShapeSync(text),
    catch: (cause) => new JsonParseFailed({ cause })
  })

export const packageJsonDependencySpec = (
  text: string,
  packageName: string
): Effect.Effect<Option.Option<string>, JsonParseFailed> =>
  parsePackageJsonShape(text).pipe(
    Effect.map((pkg) => {
      for (const section of dependencySections) {
        const dependencies = pkg[section]
        if (!isRecord(dependencies)) continue
        const spec = dependencies[packageName]
        if (typeof spec === "string" && spec.trim().length > 0) {
          return Option.some(spec.trim())
        }
      }
      return Option.none<string>()
    })
  )

export const packageJsonHasDependency = (
  text: string,
  names: ReadonlyArray<string>
): Effect.Effect<boolean, JsonParseFailed> =>
  parsePackageJsonShape(text).pipe(
    Effect.map((pkg) =>
      names.some((name) => {
        for (const section of dependencySections) {
          const dependencies = pkg[section]
          if (!isRecord(dependencies)) continue
          const spec = dependencies[name]
          if (typeof spec === "string" && spec.trim().length > 0) {
            return true
          }
        }
        return false
      })
    )
  )
