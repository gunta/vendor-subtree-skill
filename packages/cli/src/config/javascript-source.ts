import { Effect } from "effect"
import jscodeshift from "jscodeshift"

import { JavaScriptParseFailed } from "../domain/errors.ts"

const j = jscodeshift.withParser("babylon")

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const propertyName = (key: unknown): string | undefined => {
  if (!isRecord(key)) return undefined
  const { name, type, value } = key
  if (typeof name === "string") return name
  if ((type === "Literal" || type === "StringLiteral") && typeof value === "string") {
    return value
  }
  return undefined
}

const stringLiteralValue = (node: unknown): string | undefined => {
  if (!isRecord(node)) return undefined
  if (
    (node.type === "Literal" || node.type === "StringLiteral") &&
    typeof node.value === "string"
  ) {
    return node.value
  }
  return undefined
}

const arrayExpressionHasValue = (node: unknown, expected: string): boolean => {
  if (!isRecord(node) || node.type !== "ArrayExpression") return false
  return (
    Array.isArray(node.elements) &&
    node.elements.some((element) => stringLiteralValue(element) === expected)
  )
}

export const jsObjectHasArrayValue = (
  text: string,
  name: string,
  expected: string
): Effect.Effect<boolean, JavaScriptParseFailed> =>
  Effect.try({
    try: () => {
      let found = false
      j(text)
        .find(j.ObjectExpression)
        .forEach((path) => {
          const node: unknown = path.node
          if (!isRecord(node)) return
          if (!Array.isArray(node.properties)) return
          for (const property of node.properties) {
            if (!isRecord(property)) continue
            if (propertyName(property.key) !== name) continue
            if (arrayExpressionHasValue(property.value, expected)) found = true
          }
        })
      return found
    },
    catch: (cause) => new JavaScriptParseFailed({ cause })
  })
