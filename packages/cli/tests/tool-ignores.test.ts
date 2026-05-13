import { describe, expect, test } from "bun:test"

import { mergePyrightConfigText } from "../src/tool-ignores/language-analyzers/pyright.ts"
import { mergeBiomeConfigText } from "../src/tool-ignores/linters/biome.ts"
import { mergeCspellConfigText } from "../src/tool-ignores/linters/cspell.ts"
import { mergeEslintConfigText, mergeEslintIgnoreText } from "../src/tool-ignores/linters/eslint.ts"
import { mergeMarkdownlintIgnoreText } from "../src/tool-ignores/linters/markdownlint.ts"
import { mergeOxlintConfigText } from "../src/tool-ignores/linters/oxlint.ts"
import { mergeStylelintConfigText } from "../src/tool-ignores/linters/stylelint.ts"
import {
  buildSystemTools,
  mergeBazelIgnoreText,
  mergeMoonWorkspaceText,
  mergeNxConfigText,
  mergePnpmWorkspaceText,
  mergeTurboConfigText,
  packageManagerTools,
  taskRunnerTools
} from "../src/tool-ignores/monorepo.ts"

describe("tool ignore config mergers", () => {
  test("groups monorepo integrations into tool categories", () => {
    expect(packageManagerTools.name).toBe("package-managers")
    expect(taskRunnerTools.name).toBe("monorepo-task-runners")
    expect(buildSystemTools.name).toBe("build-systems")
    expect(packageManagerTools.tools.map((tool) => tool.name)).toContain("pnpm workspaces")
    expect(taskRunnerTools.tools.map((tool) => tool.name)).toContain("Turborepo")
    expect(buildSystemTools.tools.map((tool) => tool.name)).toContain("Bazel")
  })

  test("adds a Biome vendor exclusion without hiding files from agents", () => {
    const result = mergeBiomeConfigText("{}\n")

    expect(result._tag).toBe("Updated")
    if (result._tag === "Updated") {
      expect(result.text).toContain('"files"')
      expect(result.text).toContain('"includes"')
      expect(result.text).toContain('"**"')
      expect(result.text).toContain('"!vendor/**"')
    }
  })

  test("adds Oxlint ignorePatterns", () => {
    const result = mergeOxlintConfigText("{}\n")

    expect(result._tag).toBe("Updated")
    if (result._tag === "Updated") {
      expect(result.text).toContain('"ignorePatterns"')
      expect(result.text).toContain('"vendor/**"')
    }
  })

  test("adds ESLint ignorePatterns for JSON configs", () => {
    const result = mergeEslintConfigText("{}\n")

    expect(result._tag).toBe("Updated")
    if (result._tag === "Updated") {
      expect(result.text).toContain('"ignorePatterns"')
      expect(result.text).toContain('"vendor/**"')
    }
  })

  test("adds managed ignore-file sections for legacy ignore files", () => {
    expect(mergeEslintIgnoreText("dist/\n")).toContain("vendor/")
    expect(mergeMarkdownlintIgnoreText("docs/generated/\n")).toContain("vendor/")
  })

  test("adds CSpell ignorePaths", () => {
    const result = mergeCspellConfigText("{}\n")

    expect(result._tag).toBe("Updated")
    if (result._tag === "Updated") {
      expect(result.text).toContain('"ignorePaths"')
      expect(result.text).toContain('"vendor/**"')
    }
  })

  test("adds Pyright exclude entries", () => {
    const result = mergePyrightConfigText('{"exclude":[".venv"]}\n')

    expect(result._tag).toBe("Updated")
    if (result._tag === "Updated") {
      expect(result.text).toContain('".venv"')
      expect(result.text).toContain('"vendor"')
    }
  })

  test("adds Stylelint ignoreFiles entries", () => {
    const result = mergeStylelintConfigText("{}\n")

    expect(result._tag).toBe("Updated")
    if (result._tag === "Updated") {
      expect(result.text).toContain('"ignoreFiles"')
      expect(result.text).toContain('"vendor/**"')
    }
  })

  test("adds Turborepo task input exclusions without dropping defaults", () => {
    const result = mergeTurboConfigText(
      JSON.stringify({ tasks: { build: { outputs: ["dist/**"] } } }, null, 2)
    )

    expect(result._tag).toBe("Updated")
    if (result._tag === "Updated") {
      expect(result.text).toContain('"$TURBO_DEFAULT$"')
      expect(result.text).toContain('"!$TURBO_ROOT$/vendor/**"')
    }
  })

  test("adds Nx named input exclusions", () => {
    const result = mergeNxConfigText("{}\n")

    expect(result._tag).toBe("Updated")
    if (result._tag === "Updated") {
      expect(result.text).toContain('"namedInputs"')
      expect(result.text).toContain('"!{workspaceRoot}/vendor/**"')
    }
  })

  test("adds pnpm workspace package exclusions when a packages list exists", () => {
    const result = mergePnpmWorkspaceText("packages:\n  - 'packages/*'\n")

    expect(result._tag).toBe("Updated")
    if (result._tag === "Updated") {
      expect(result.text).toContain("!vendor/**")
    }
  })

  test("does not invent a pnpm packages list", () => {
    expect(mergePnpmWorkspaceText("catalog:\n  react: ^19.0.0\n")._tag).toBe("Unchanged")
  })

  test("adds moon hasher ignore patterns", () => {
    const result = mergeMoonWorkspaceText("projects:\n  - 'packages/*'\n")

    expect(result._tag).toBe("Updated")
    if (result._tag === "Updated") {
      expect(result.text).toContain("hasher")
      expect(result.text).toContain("vendor/**")
    }
  })

  test("adds a managed Bazel ignore section", () => {
    const result = mergeBazelIgnoreText("bazel-out\n")

    expect(result).toContain("bazel-out")
    expect(result).toContain("vendor")
    expect(result).toContain("ingraft begin")
  })
})
