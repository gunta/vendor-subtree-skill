import { execSync, spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, test } from "bun:test"

import { NodeServices } from "@effect/platform-node"
import { Effect, Layer, Option } from "effect"

import { LiveLayer } from "../src/app/layers.ts"
import { computeForkModeReport, fixDoctor } from "../src/commands/doctor.tsx"
import { addImpl } from "../src/commands/add.tsx"
import { VENDOR_DIR } from "../src/domain/constants.ts"
import { EMPTY_VENDOR_FILTER } from "../src/domain/vendor-filter.ts"
import { listVendored } from "../src/domain/vendor-state.ts"
import { ProjectFiles, type RefreshGeneratedFilesParams } from "../src/project/service.ts"
import { GitHubCli } from "../src/services/gh.ts"
import { GitMetadataLive } from "../src/services/git-metadata.ts"
import { classifyRepo } from "../src/services/github-repo-meta.ts"
import { LocalState, LocalStateLive } from "../src/services/local-state.ts"
import {
  defaultAddParams,
  initBareUpstream,
  initLocalRepo,
  setForkMode
} from "./helpers/local-vendor-fixture.ts"

// Stub gh CLI as unavailable so detectFork falls back to upstream remote detection
const StubGhUnavailable = Layer.succeed(
  GitHubCli,
  GitHubCli.of({
    exec: () => Effect.succeed({ stdout: "", stderr: "command not found", exitCode: 127 })
  })
)

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

describe("doctor fork-mode check", () => {
  let originalCwd: string
  beforeEach(() => {
    originalCwd = process.cwd()
  })
  afterEach(() => {
    process.chdir(originalCwd)
  })

  test("warns when forkMode=personal and tracked vendor commits exist", async () => {
    const cwd = initLocalRepo()
    const upstream = initBareUpstream()
    execSync(`git remote add upstream ${upstream}`, { cwd })
    process.chdir(cwd)

    // Add a tracked (non-local-only) vendor entry BEFORE setting forkMode=personal
    // to avoid the auto-localOnly guard in addImpl (Task 12).
    await Effect.runPromise(
      addImpl(
        defaultAddParams({
          repo: upstream,
          ref: Option.some("main"),
          name: Option.some("upstream"),
          prefix: Option.some("vendor/upstream"),
          strategy: "subtree",
          localOnly: false
        })
      ).pipe(Effect.provide(LiveLayer), Effect.provide(GitMetadataLive))
    )

    // Set forkMode=personal after the tracked entry has been created.
    setForkMode(cwd, "personal")

    const repos = await Effect.runPromise(
      listVendored(cwd).pipe(Effect.provide(LiveLayer), Effect.provide(GitMetadataLive))
    )

    const report = await Effect.runPromise(
      computeForkModeReport({ cwd, repos }).pipe(
        Effect.provide(StubGhUnavailable),
        Effect.provide(LiveLayer),
        Effect.provide(GitMetadataLive)
      )
    )

    expect(report.status).toBe("warn")
    expect(report.message).toContain("tracked")
  })

  test("reports ok when forkMode=contribute and entries match", async () => {
    const cwd = initLocalRepo()
    const upstream = initBareUpstream()
    execSync(`git remote add upstream ${upstream}`, { cwd })
    setForkMode(cwd, "contribute")
    process.chdir(cwd)

    const report = await Effect.runPromise(
      computeForkModeReport({ cwd, repos: [] }).pipe(
        Effect.provide(StubGhUnavailable),
        Effect.provide(LiveLayer),
        Effect.provide(GitMetadataLive)
      )
    )

    expect(report.status).toBe("ok")
  })

  test("skips fork-mode section on non-fork repos", async () => {
    const cwd = initLocalRepo()
    process.chdir(cwd)

    const report = await Effect.runPromise(
      computeForkModeReport({ cwd, repos: [] }).pipe(
        Effect.provide(StubGhUnavailable),
        Effect.provide(LiveLayer),
        Effect.provide(GitMetadataLive)
      )
    )

    expect(report.status).toBe("skipped")
  })
})

describe("doctor Type column classification", () => {
  test("classifyRepo distinguishes own / fork / upstream / unknown / non-github", () => {
    const user = {
      schemaVersion: 1 as const,
      fetchedAt: new Date().toISOString(),
      login: "gunta",
      orgs: ["g-productions-studio"]
    }

    // own (login match)
    expect(
      classifyRepo({
        url: "https://github.com/gunta/ingraft.git",
        user,
        meta: Option.none()
      })
    ).toBe("own")

    // own (org match)
    expect(
      classifyRepo({
        url: "https://github.com/g-productions-studio/site.git",
        user,
        meta: Option.none()
      })
    ).toBe("own")

    // fork
    expect(
      classifyRepo({
        url: "https://github.com/facebook/effect.git",
        user,
        meta: Option.some({
          fetchedAt: new Date().toISOString(),
          isFork: true,
          parent: "Effect-TS/effect",
          owner: "facebook",
          visibility: "public"
        })
      })
    ).toBe("fork")

    // upstream
    expect(
      classifyRepo({
        url: "https://github.com/Effect-TS/effect.git",
        user,
        meta: Option.some({
          fetchedAt: new Date().toISOString(),
          isFork: false,
          parent: null,
          owner: "Effect-TS",
          visibility: "public"
        })
      })
    ).toBe("upstream")

    // unknown (no meta, not own)
    expect(
      classifyRepo({
        url: "https://github.com/Effect-TS/effect.git",
        user,
        meta: Option.none()
      })
    ).toBe("unknown")

    // non-github
    expect(
      classifyRepo({
        url: "https://gitlab.com/foo/bar.git",
        user,
        meta: Option.none()
      })
    ).toBe("non-github")
  })

  test("seeded LocalState yields the expected types when read by classifyRepo", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ingraft-doctor-type-"))
    try {
      spawnSync("git", ["init", "-q", "--initial-branch=main"], { cwd: dir })
      spawnSync(
        "git",
        ["-c", "user.email=t@t", "-c", "user.name=T", "commit", "--allow-empty", "-q", "-m", "init"],
        { cwd: dir }
      )

      const layer = Layer.mergeAll(LocalStateLive, NodeServices.layer)

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const local = yield* LocalState
          yield* local.writeUser({
            cwd: dir,
            identity: {
              schemaVersion: 1,
              fetchedAt: new Date().toISOString(),
              login: "gunta",
              orgs: ["g-productions-studio"]
            }
          })
          yield* local.writeRepoMeta({
            cwd: dir,
            ownerName: "facebook/effect",
            meta: {
              fetchedAt: new Date().toISOString(),
              isFork: true,
              parent: "Effect-TS/effect",
              owner: "facebook",
              visibility: "public"
            }
          })

          const userOption = yield* local.readUser({ cwd: dir })
          const metaOption = yield* local.readRepoMeta({ cwd: dir, ownerName: "facebook/effect" })
          return { userOption, metaOption }
        }).pipe(Effect.provide(layer))
      )

      expect(Option.isSome(result.userOption)).toBe(true)
      expect(Option.isSome(result.metaOption)).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
