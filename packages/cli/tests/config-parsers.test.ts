import { describe, expect, test } from "bun:test"

import { Cause, Effect, Exit, Option, Schema } from "effect"

import { jsObjectHasArrayValue } from "../src/config/javascript-source.ts"
import { packageJsonHasDependency, packageJsonDependencySpec } from "../src/config/package-json.ts"
import { parseTomlText, parseTomlWith, tomlHasPath, tomlPathHasArrayValue } from "../src/config/toml.ts"
import { tsObjectHasArrayValue } from "../src/config/typescript-source.ts"
import { parseYamlText, parseYamlWith, yamlHasPath } from "../src/config/yaml.ts"
import { SchemaDecodeFailed, TomlParseFailed, YamlParseFailed } from "../src/domain/errors.ts"

describe("non-destructive config parsers", () => {
  test("reads package.json dependency sections with JSONC-compatible parsing", () => {
    const text = `{
      // package managers do not write comments, but humans often do
      "dependencies": {
        "effect": "^3.21.2",
      },
      "devDependencies": {
        "typescript": "^6.0.3",
      },
    }`

    expect(packageJsonHasDependency(text, ["typescript"])).toBe(true)
    expect(Option.getOrUndefined(packageJsonDependencySpec(text, "effect"))).toBe("^3.21.2")
  })

  test("reads TOML sections and array values without string matching", () => {
    const text = `
      [tool.ruff]
      exclude = ["vendor", ".venv"]
    `

    expect(Effect.runSync(tomlHasPath(text, ["tool", "ruff"]))).toBe(true)
    expect(Effect.runSync(tomlPathHasArrayValue(text, ["tool", "ruff", "exclude"], "vendor"))).toBe(
      true
    )
  })

  test("parseTomlText surfaces TomlParseFailed on malformed input", async () => {
    const exit = await Effect.runPromiseExit(parseTomlText("this is = not [valid"))
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const failures = exit.cause.reasons.filter(Cause.isFailReason)
      expect(failures.length).toBeGreaterThan(0)
      expect(failures[0]?.error).toBeInstanceOf(TomlParseFailed)
    }
  })

  test("tomlHasPath surfaces TomlParseFailed on malformed input", async () => {
    const exit = await Effect.runPromiseExit(tomlHasPath("invalid = [", ["a"]))
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const failures = exit.cause.reasons.filter(Cause.isFailReason)
      const error = failures[0]?.error
      expect(error).toBeInstanceOf(TomlParseFailed)
    }
  })

  test("reads YAML documents through the document parser", () => {
    const text = `
      # prettier config
      plugins:
        - prettier-plugin-tailwindcss
    `

    expect(Effect.runSync(yamlHasPath(text, ["plugins"]))).toBe(true)
  })

  test("parseYamlText surfaces YamlParseFailed on malformed input", async () => {
    // unterminated flow mapping
    const exit = await Effect.runPromiseExit(parseYamlText("foo: { bar: baz"))
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const failures = exit.cause.reasons.filter(Cause.isFailReason)
      expect(failures[0]?.error).toBeInstanceOf(YamlParseFailed)
    }
  })

  test("yamlHasPath surfaces YamlParseFailed on malformed input", async () => {
    const exit = await Effect.runPromiseExit(yamlHasPath("foo: { bar: baz", ["foo"]))
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const failures = exit.cause.reasons.filter(Cause.isFailReason)
      expect(failures[0]?.error).toBeInstanceOf(YamlParseFailed)
    }
  })

  test("parseYamlWith decodes valid YAML matching the schema", async () => {
    const schema = Schema.Struct({ name: Schema.String })
    const result = await Effect.runPromise(parseYamlWith(schema)("name: demo\n"))
    expect(result.name).toBe("demo")
  })

  test("uses ts-morph for TypeScript config source detection", () => {
    const text = `
      export default {
        ignorePatterns: ["vendor/**"]
      }
    `

    expect(tsObjectHasArrayValue(text, "ignorePatterns", "vendor/**")).toBe(true)
  })

  test("uses jscodeshift for JavaScript config source detection", () => {
    const text = `
      module.exports = {
        ignorePatterns: ["vendor/**"]
      }
    `

    expect(jsObjectHasArrayValue(text, "ignorePatterns", "vendor/**")).toBe(true)
  })

  const PackageMetadataSchema = Schema.Struct({
    package: Schema.Struct({
      name: Schema.String,
      version: Schema.String
    })
  })

  test("parseTomlWith decodes valid TOML matching the schema", async () => {
    const text = `[package]\nname = "demo"\nversion = "1.0.0"\n`
    const result = await Effect.runPromise(parseTomlWith(PackageMetadataSchema)(text))
    expect(result.package.name).toBe("demo")
    expect(result.package.version).toBe("1.0.0")
  })

  test("parseTomlWith surfaces SchemaDecodeFailed when input is well-formed but shape mismatches", async () => {
    // valid TOML but missing the required `package` table
    const text = `[other]\nkey = "value"\n`
    const exit = await Effect.runPromiseExit(parseTomlWith(PackageMetadataSchema)(text))
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const failures = exit.cause.reasons.filter(Cause.isFailReason)
      const error = failures[0]?.error
      expect(error).toBeInstanceOf(SchemaDecodeFailed)
    }
  })

  test("parseTomlWith surfaces TomlParseFailed on malformed input (before schema is reached)", async () => {
    const text = "[unclosed"
    const exit = await Effect.runPromiseExit(parseTomlWith(PackageMetadataSchema)(text))
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const failures = exit.cause.reasons.filter(Cause.isFailReason)
      const error = failures[0]?.error
      expect(error).toBeInstanceOf(TomlParseFailed)
    }
  })
})
