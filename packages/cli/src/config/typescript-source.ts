import { Effect } from "effect"
import { Node, Project, ScriptKind, SyntaxKind, type ObjectLiteralExpression } from "ts-morph"

import { TypeScriptParseFailed } from "../domain/errors.ts"

const sourceFileFromText = (text: string) => {
  const project = new Project({ useInMemoryFileSystem: true })
  return project.createSourceFile("config.ts", text, {
    overwrite: true,
    scriptKind: ScriptKind.TS
  })
}

const propertyArrayHasValue = (
  object: ObjectLiteralExpression,
  propertyName: string,
  expected: string
): boolean => {
  const property = object.getProperty(propertyName)
  if (!Node.isPropertyAssignment(property)) return false

  const initializer = property.getInitializer()
  if (!Node.isArrayLiteralExpression(initializer)) return false

  return initializer.getElements().some((element) => {
    if (!Node.isStringLiteral(element) && !Node.isNoSubstitutionTemplateLiteral(element)) {
      return false
    }
    return element.getLiteralText() === expected
  })
}

export const tsObjectHasArrayValue = (
  text: string,
  propertyName: string,
  expected: string
): Effect.Effect<boolean, TypeScriptParseFailed> =>
  Effect.try({
    try: () => {
      const sourceFile = sourceFileFromText(text)
      return sourceFile
        .getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)
        .some((object) => propertyArrayHasValue(object, propertyName, expected))
    },
    catch: (cause) => new TypeScriptParseFailed({ cause })
  })
