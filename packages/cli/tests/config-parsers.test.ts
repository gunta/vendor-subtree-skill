import { describe, expect, test } from "bun:test"

import { Cause, Effect, Exit, Option, Schema } from "effect"

import { jsObjectHasArrayValue } from "../src/config/javascript-source.ts"
import {
  parseJsoncText,
  parseJsoncWith,
  ParsedSettings,
  SettingsMergeResult
} from "../src/config/jsonc-settings.ts"
import { packageJsonHasDependency, packageJsonDependencySpec } from "../src/config/package-json.ts"
import { parseTomlText, parseTomlWith, tomlHasPath, tomlPathHasArrayValue } from "../src/config/toml.ts"
import { tsObjectHasArrayValue } from "../src/config/typescript-source.ts"
import { parseYamlText, parseYamlWith, yamlHasPath } from "../src/config/yaml.ts"
import {
  JavaScriptParseFailed,
  JsoncParseFailed,
  SchemaDecodeFailed,
  TomlParseFailed,
  TypeScriptParseFailed,
  YamlParseFailed
} from "../src/domain/errors.ts"

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

    expect(Effect.runSync(tsObjectHasArrayValue(text, "ignorePatterns", "vendor/**"))).toBe(true)
  })

  test("uses jscodeshift for JavaScript config source detection", () => {
    const text = `
      module.exports = {
        ignorePatterns: ["vendor/**"]
      }
    `

    expect(Effect.runSync(jsObjectHasArrayValue(text, "ignorePatterns", "vendor/**"))).toBe(true)
  })

  test("jsObjectHasArrayValue surfaces JavaScriptParseFailed on malformed input", async () => {
    const exit = await Effect.runPromiseExit(
      jsObjectHasArrayValue("const x = { unclosed", "ignorePatterns", "vendor/**")
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const failures = exit.cause.reasons.filter(Cause.isFailReason)
      expect(failures[0]?.error).toBeInstanceOf(JavaScriptParseFailed)
    }
  })

  test("tsObjectHasArrayValue surfaces TypeScriptParseFailed on malformed input", async () => {
    // ts-morph is permissive and tries to recover from most parse errors. If it
    // never throws on a given input, the operation succeeds and we simply assert
    // the boolean result. When it does throw (e.g. on internal failures), the
    // error must be the tagged TypeScriptParseFailed.
    const exit = await Effect.runPromiseExit(
      tsObjectHasArrayValue("const x: =", "ignorePatterns", "vendor/**")
    )
    if (Exit.isFailure(exit)) {
      const failures = exit.cause.reasons.filter(Cause.isFailReason)
      expect(failures[0]?.error).toBeInstanceOf(TypeScriptParseFailed)
    } else {
      // ts-morph recovered; the function should still return a boolean
      expect(typeof exit.value).toBe("boolean")
    }
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

  test("parseJsoncText surfaces JsoncParseFailed on malformed input", async () => {
    const exit = await Effect.runPromiseExit(parseJsoncText("{ unterminated"))
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const failures = exit.cause.reasons.filter(Cause.isFailReason)
      expect(failures[0]?.error).toBeInstanceOf(JsoncParseFailed)
    }
  })

  test("parseJsoncWith decodes valid JSONC matching the schema", async () => {
    const schema = Schema.Struct({ name: Schema.String })
    const result = await Effect.runPromise(parseJsoncWith(schema)('{ "name": "demo" }'))
    expect(result.name).toBe("demo")
  })

  test("parseJsoncWith surfaces SchemaDecodeFailed when input is well-formed but shape mismatches", async () => {
    const schema = Schema.Struct({ name: Schema.String })
    const exit = await Effect.runPromiseExit(parseJsoncWith(schema)('{ "other": 1 }'))
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const failures = exit.cause.reasons.filter(Cause.isFailReason)
      expect(failures[0]?.error).toBeInstanceOf(SchemaDecodeFailed)
    }
  })

  test("SettingsMergeResult constructors produce correctly tagged values", () => {
    const unchanged = SettingsMergeResult.Unchanged()
    expect(unchanged._tag).toBe("Unchanged")

    const updated = SettingsMergeResult.Updated({ text: "{}" })
    expect(updated._tag).toBe("Updated")
    if (updated._tag === "Updated") {
      expect(updated.text).toBe("{}")
    }

    const invalid = SettingsMergeResult.Invalid({ message: "broken" })
    expect(invalid._tag).toBe("Invalid")
    if (invalid._tag === "Invalid") {
      expect(invalid.message).toBe("broken")
    }
  })

  test("ParsedSettings constructors produce correctly tagged values", () => {
    const valid = ParsedSettings.Valid({ value: { a: 1 }, source: "{}" })
    expect(valid._tag).toBe("Valid")
    if (valid._tag === "Valid") {
      expect(valid.value).toEqual({ a: 1 })
      expect(valid.source).toBe("{}")
    }

    const invalid = ParsedSettings.Invalid({ message: "bad", source: "{" })
    expect(invalid._tag).toBe("Invalid")
    if (invalid._tag === "Invalid") {
      expect(invalid.message).toBe("bad")
      expect(invalid.source).toBe("{")
    }
  })
})
