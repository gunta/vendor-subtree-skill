import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { NodeServices } from "@effect/platform-node"
import { Effect } from "effect"

import { RuntimeConfigLive } from "../src/app/runtime.ts"
import {
  mergeVscodeSettingsText,
  VscodeSettings,
  VscodeSettingsLive
} from "../src/editors/vscode.ts"
import { GitMetadataLive } from "../src/services/git-metadata.ts"

const withTempWorkspace = async <A>(run: (cwd: string) => Promise<A>): Promise<A> => {
  const cwd = mkdtempSync(join(tmpdir(), "vendor-vscode-"))
  try {
    return await run(cwd)
  } finally {
    rmSync(cwd, { force: true, recursive: true })
  }
}

describe("VS Code settings", () => {
  test("adds vendor exclusions while preserving JSONC comments", () => {
    const current = [
      "{",
      "  // keep this comment",
      '  "search.exclude": {',
      '    "dist/**": true',
      "  }",
      "}"
    ].join("\n")

    const result = mergeVscodeSettingsText(current)

    expect(result._tag).toBe("Updated")
    if (result._tag === "Updated") {
      expect(result.text).toContain("// keep this comment")
      expect(result.text).toContain('"dist/**": true')
      expect(result.text).toContain('"typescript.preferences.autoImportFileExcludePatterns"')
      expect(result.text).toContain('"javascript.preferences.autoImportFileExcludePatterns"')
      expect(result.text).toContain('"material-icon-theme.folders.associations"')
      expect(result.text).toContain('"vendor": "packages"')
      expect(result.text).toContain('"files.exclude"')
      expect(result.text).toContain('"files.watcherExclude"')
      expect(result.text).toContain('"search.exclude"')
      expect(result.text).toContain('"vendor/**": true')
    }
  })

  test("keeps an existing vendor folder icon association", () => {
    const result = mergeVscodeSettingsText(
      [
        "{",
        '  "material-icon-theme.folders.associations": {',
        '    "vendor": "lib"',
        "  }",
        "}"
      ].join("\n")
    )

    expect(result._tag).toBe("Updated")
    if (result._tag === "Updated") {
      expect(result.text).toContain('"vendor": "lib"')
      expect(result.text).not.toContain('"vendor": "packages"')
    }
  })

  test("reports invalid JSONC instead of overwriting the file", () => {
    const result = mergeVscodeSettingsText("{ invalid")

    expect(result._tag).toBe("Invalid")
  })

  test("refresh adds auto-import exclusions only for detected project languages", async () => {
    await withTempWorkspace(async (cwd) => {
      writeFileSync(
        join(cwd, "package.json"),
        JSON.stringify({ devDependencies: { typescript: "^6.0.3" } })
      )
      writeFileSync(join(cwd, "tsconfig.json"), "{}\n")

      const written = await Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* VscodeSettings
          return yield* svc.refresh(cwd)
        }).pipe(
          Effect.provide(VscodeSettingsLive),
          Effect.provide(RuntimeConfigLive),
          Effect.provide(GitMetadataLive),
          Effect.provide(NodeServices.layer)
        )
      )

      expect(written._tag).toBe("Some")
      const settings = readFileSync(join(cwd, ".vscode/settings.json"), "utf8")
      expect(settings).toContain('"typescript.preferences.autoImportFileExcludePatterns"')
      expect(settings).not.toContain('"javascript.preferences.autoImportFileExcludePatterns"')
    })
  })

  test("refresh adds JavaScript auto-import exclusions for JavaScript projects", async () => {
    await withTempWorkspace(async (cwd) => {
      mkdirSync(join(cwd, "src"), { recursive: true })
      writeFileSync(join(cwd, "src/index.js"), "export const value = 1\n")

      await Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* VscodeSettings
          return yield* svc.refresh(cwd)
        }).pipe(
          Effect.provide(VscodeSettingsLive),
          Effect.provide(RuntimeConfigLive),
          Effect.provide(GitMetadataLive),
          Effect.provide(NodeServices.layer)
        )
      )

      const settings = readFileSync(join(cwd, ".vscode/settings.json"), "utf8")
      expect(settings).toContain('"javascript.preferences.autoImportFileExcludePatterns"')
      expect(settings).not.toContain('"typescript.preferences.autoImportFileExcludePatterns"')
    })
  })
})
