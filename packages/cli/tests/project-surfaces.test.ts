import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { NodeServices } from "@effect/platform-node"
import { Effect } from "effect"

import { SECTION_BEGIN, SECTION_END } from "../src/domain/constants.ts"
import { ProjectSurfaces, ProjectSurfacesLive } from "../src/project/surfaces.ts"

const withTempWorkspace = async <A>(run: (cwd: string) => Promise<A>): Promise<A> => {
  const cwd = mkdtempSync(join(tmpdir(), "vendor-surfaces-"))
  try {
    return await run(cwd)
  } finally {
    rmSync(cwd, { force: true, recursive: true })
  }
}

describe("project surface detection", () => {
  test("detects managed agent docs and present editor settings", async () => {
    await withTempWorkspace(async (cwd) => {
      mkdirSync(join(cwd, ".vscode"), { recursive: true })
      mkdirSync(join(cwd, ".zed"), { recursive: true })
      mkdirSync(join(cwd, ".idea/scopes"), { recursive: true })
      writeFileSync(join(cwd, "AGENTS.md"), `${SECTION_BEGIN}\nmanaged\n${SECTION_END}\n`)
      writeFileSync(
        join(cwd, ".vscode/settings.json"),
        JSON.stringify({
          "files.exclude": { "vendor/**": true },
          "files.watcherExclude": { "vendor/**": true },
          "search.exclude": { "vendor/**": true },
          "typescript.preferences.autoImportFileExcludePatterns": ["vendor/**"],
          "javascript.preferences.autoImportFileExcludePatterns": ["vendor/**"],
          "material-icon-theme.folders.associations": { vendor: "packages" }
        })
      )
      writeFileSync(join(cwd, ".zed/settings.json"), "{}\n")
      writeFileSync(
        join(cwd, ".idea/scopes/Vendor.xml"),
        [
          '<component name="DependencyValidationManager">',
          '  <scope name="Vendor" pattern="file:vendor//*" />',
          "</component>"
        ].join("\n")
      )
      writeFileSync(
        join(cwd, ".idea/fileColors.xml"),
        [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<project version="4">',
          '  <component name="SharedFileColors">',
          '    <fileColor scope="Vendor" color="Green" />',
          "  </component>",
          "</project>"
        ].join("\n")
      )
      writeFileSync(
        join(cwd, ".gitattributes"),
        [
          "# ingraft: github-diff begin",
          "# Hide committed vendored subtree source in GitHub PR diffs by default.",
          "/vendor/effect/** linguist-vendored linguist-generated",
          "# ingraft: github-diff end",
          ""
        ].join("\n")
      )

      const report = await Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* ProjectSurfaces
          return yield* svc.doctor({ cwd })
        }).pipe(Effect.provide(ProjectSurfacesLive), Effect.provide(NodeServices.layer))
      )

      expect(report.agentFiles.find((entry) => entry.name === "AGENTS.md")).toMatchObject({
        present: true,
        status: "managed"
      })
      expect(report.editorFiles.find((entry) => entry.name === "VS Code settings")).toMatchObject({
        present: true,
        status: "configured"
      })
      expect(report.editorFiles.find((entry) => entry.name === "Zed settings")).toMatchObject({
        present: true,
        status: "present"
      })
      expect(
        report.editorFiles.find((entry) => entry.name === "JetBrains vendor scope")
      ).toMatchObject({
        present: true,
        status: "configured"
      })
      expect(
        report.editorFiles.find((entry) => entry.name === "JetBrains file colors")
      ).toMatchObject({
        present: true,
        status: "configured"
      })
      expect(report.repositoryFiles.find((entry) => entry.name === ".gitattributes")).toMatchObject(
        {
          present: true,
          status: "configured"
        }
      )
    })
  })
})
