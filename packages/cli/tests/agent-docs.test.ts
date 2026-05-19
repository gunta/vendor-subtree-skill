import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { NodeServices } from "@effect/platform-node"
import { Effect } from "effect"

import { SECTION_BEGIN } from "../src/domain/constants.ts"
import { EMPTY_VENDOR_FILTER } from "../src/domain/vendor-filter.ts"
import { injectSection, renderVendorSection, updateAgentDocs } from "../src/project/agent-docs.ts"

const withTempWorkspace = async <A>(run: (cwd: string) => Promise<A>): Promise<A> => {
  const cwd = mkdtempSync(join(tmpdir(), "vendor-agent-docs-"))
  try {
    return await run(cwd)
  } finally {
    rmSync(cwd, { force: true, recursive: true })
  }
}

const readWorkspaceFile = (cwd: string, path: string): string =>
  readFileSync(join(cwd, path), "utf8")

describe("agent docs", () => {
  test("injects a managed section without replacing surrounding content", () => {
    const section = renderVendorSection({
      repos: []
    })

    expect(injectSection({ content: "# Project\n", section })).toContain("# Project\n\n")
    expect(injectSection({ content: "# Project\n", section })).toContain("<!-- ingraft:begin -->")
  })

  test("replaces an existing managed section", () => {
    const first = [
      "# Project",
      "",
      "<!-- ingraft:begin -->",
      "old",
      "<!-- ingraft:end -->",
      ""
    ].join("\n")
    const next = renderVendorSection({
      scriptRel: "tools/vendor.ts",
      repos: [
        {
          name: "effect",
          prefix: "vendor/effect",
          url: "https://github.com/Effect-TS/effect.git",
          ref: "main",
          strategy: "subtree",
          filter: EMPTY_VENDOR_FILTER,
          sha: "sha",
          date: "date"
        }
      ]
    })

    const result = injectSection({ content: first, section: next })

    expect(result).not.toContain("old")
    expect(result).toContain("bun tools/vendor.ts list")
    expect(renderVendorSection({ repos: [] })).toContain("bunx @ingraft/cli@latest list")
    expect(result).toContain("vendor/effect")
  })

  test("updates every present agent instruction file and rule file", async () => {
    await withTempWorkspace(async (cwd) => {
      mkdirSync(join(cwd, ".cursor/rules"), { recursive: true })
      mkdirSync(join(cwd, ".github/instructions"), { recursive: true })
      mkdirSync(join(cwd, ".github"), { recursive: true })
      writeFileSync(join(cwd, "AGENTS.md"), "# Agents\n")
      writeFileSync(join(cwd, "GEMINI.md"), "# Gemini\n")
      writeFileSync(join(cwd, ".cursorrules"), "# Cursor\n")
      writeFileSync(join(cwd, ".cursor/rules/project.mdc"), "# Cursor project rule\n")
      writeFileSync(join(cwd, ".github/copilot-instructions.md"), "# Copilot\n")
      writeFileSync(join(cwd, ".github/instructions/review.instructions.md"), "# Review\n")

      const written = await Effect.runPromise(
        updateAgentDocs({
          command: "ingraft",
          cwd,
          repos: []
        }).pipe(Effect.provide(NodeServices.layer))
      )

      expect(written.map((path) => path.slice(cwd.length + 1)).sort()).toEqual([
        ".cursor/rules/project.mdc",
        ".cursorrules",
        ".github/copilot-instructions.md",
        ".github/instructions/review.instructions.md",
        "AGENTS.md",
        "GEMINI.md"
      ])

      for (const path of written) {
        expect(readFileSync(path, "utf8")).toContain(SECTION_BEGIN)
      }
    })
  })

  test("creates AGENTS.md when no supported agent instruction files exist", async () => {
    await withTempWorkspace(async (cwd) => {
      const written = await Effect.runPromise(
        updateAgentDocs({
          command: "ingraft",
          cwd,
          repos: []
        }).pipe(Effect.provide(NodeServices.layer))
      )

      expect(written.map((path) => path.slice(cwd.length + 1))).toEqual(["AGENTS.md"])
      expect(readWorkspaceFile(cwd, "AGENTS.md")).toContain(SECTION_BEGIN)
    })
  })
})
