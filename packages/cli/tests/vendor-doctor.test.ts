import { describe, expect, test } from "bun:test"

import { Effect } from "effect"

import { fixDoctor } from "../src/commands/doctor.tsx"
import { VENDOR_DIR } from "../src/domain/constants.ts"
import { EMPTY_VENDOR_FILTER } from "../src/domain/vendor-filter.ts"
import { ProjectFiles, type RefreshGeneratedFilesParams } from "../src/project/service.ts"

describe("vendor doctor", () => {
  test("fix mode refreshes generated project files with editor settings", async () => {
    const calls: Array<RefreshGeneratedFilesParams> = []

    await Effect.runPromise(
      fixDoctor({
        cwd: "/workspace",
        repos: []
      }).pipe(
        Effect.provideService(
          ProjectFiles,
          ProjectFiles.of({
            refresh: (params) =>
              Effect.sync(() => {
                calls.push(params)
              })
          })
        )
      )
    )

    expect(calls).toEqual([
      {
        commitMessage: "vendor: repair project vendor files",
        cwd: "/workspace",
        editorSettings: true,
        repos: []
      }
    ])
  })

  test("json output includes all report sections", () => {
    const data = {
      vendor_dir: VENDOR_DIR,
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
      ],
      agent_files: [
        {
          _tag: "ProjectSurfaceReport",
          kind: "agent",
          message: "managed vendor section present",
          name: "AGENTS.md",
          path: "/workspace/AGENTS.md",
          present: true,
          status: "managed"
        }
      ],
      editor_files: [
        {
          _tag: "ProjectSurfaceReport",
          kind: "editor",
          message: "vendor settings present",
          name: "VS Code settings",
          path: "/workspace/.vscode/settings.json",
          present: true,
          status: "configured"
        }
      ],
      repository_files: [
        {
          _tag: "ProjectSurfaceReport",
          kind: "repository",
          message: "GitHub diff hiding configured for subtree vendor paths",
          name: ".gitattributes",
          path: "/workspace/.gitattributes",
          present: true,
          status: "configured"
        }
      ],
      tool_ignores: [
        {
          _tag: "ToolIgnoreReport",
          configPath: "/workspace/biome.jsonc",
          detected: true,
          ignored: true,
          message: "vendor ignored by files.includes",
          status: "configured",
          tool: "Biome"
        },
        {
          _tag: "ToolIgnoreReport",
          detected: false,
          ignored: false,
          message: "not detected",
          status: "absent",
          tool: "Pyright"
        }
      ]
    }

    const output = JSON.stringify(data, null, 2)
    const parsed = JSON.parse(output)

    expect(parsed.repos).toHaveLength(1)
    expect(parsed.repos[0].name).toBe("effect")
    expect(parsed.agent_files[0].name).toBe("AGENTS.md")
    expect(parsed.agent_files[0].status).toBe("managed")
    expect(parsed.editor_files[0].name).toBe("VS Code settings")
    expect(parsed.repository_files[0].name).toBe(".gitattributes")
    expect(parsed.tool_ignores).toHaveLength(2)
    expect(parsed.tool_ignores[0].tool).toBe("Biome")
    expect(parsed.tool_ignores[0].status).toBe("configured")
    expect(parsed.tool_ignores[1].tool).toBe("Pyright")
    expect(parsed.tool_ignores[1].status).toBe("absent")
  })
})
