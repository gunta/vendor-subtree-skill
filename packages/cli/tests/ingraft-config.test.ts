import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { NodeServices } from "@effect/platform-node"
import { Effect, Option } from "effect"

import {
  expandAliasTargetsWith,
  mergeAliasEntries,
  repositoryAliasEntriesFromDatabase
} from "../src/aliases/service.ts"
import {
  applyAddDefaults,
  type ConfigurableAddParams,
  loadIngraftConfig,
  parseIngraftConfigText
} from "../src/config/ingraft.ts"

const withTempWorkspace = async <A>(run: (cwd: string) => Promise<A>): Promise<A> => {
  const cwd = mkdtempSync(join(tmpdir(), "ingraft-config-"))
  try {
    return await run(cwd)
  } finally {
    rmSync(cwd, { force: true, recursive: true })
  }
}

describe("ingraft config", () => {
  test("treats .ingraft/config.toml as optional", async () => {
    await withTempWorkspace(async (cwd) => {
      const config = await Effect.runPromise(
        loadIngraftConfig(cwd).pipe(Effect.provide(NodeServices.layer))
      )

      expect(Option.isNone(config.path)).toBe(true)
      expect(config.aliases).toEqual([])
      expect(config.defaults).toEqual({
        cloudflareArtifact: undefined,
        cloudflareArtifactDepth: undefined,
        cloudflareArtifactName: undefined,
        exclude: [],
        excludeDirs: [],
        excludeExtensions: [],
        maxFileSize: undefined,
        ref: undefined,
        release: undefined,
        strategy: undefined,
        syncPackage: undefined,
        tag: undefined
      })
    })
  })

  test("parses TOML defaults and aliases from .ingraft/config.toml", async () => {
    const config = await Effect.runPromise(
      parseIngraftConfigText(
        [
          "[defaults]",
          'strategy = "clone-ignore"',
          'ref = "main"',
          'sync-package = "effect"',
          "cloudflare-artifact = true",
          'cloudflare-artifact-depth = "1"',
          'cloudflare-artifact-name = "effect-cache"',
          'exclude = ["*.snap"]',
          'exclude-dirs = ["docs"]',
          'exclude-extensions = ["png"]',
          'max-file-size = "1MB"',
          "",
          "[[aliases]]",
          'alias = "fx"',
          'description = "Effect repositories"',
          'strategy = "clone-ignore"',
          'targets = [{ target = "Effect-TS/effect" }, { target = "Effect-TS/effect-smol", strategy = "submodule" }]'
        ].join("\n"),
        ".ingraft/config.toml"
      )
    )

    expect(config.defaults).toEqual({
      cloudflareArtifact: true,
      cloudflareArtifactDepth: "1",
      cloudflareArtifactName: "effect-cache",
      exclude: ["*.snap"],
      excludeDirs: ["docs"],
      excludeExtensions: ["png"],
      maxFileSize: "1MB",
      ref: "main",
      release: undefined,
      strategy: "clone-ignore",
      syncPackage: "effect",
      tag: undefined
    })
    expect(config.aliases).toEqual([
      {
        alias: "fx",
        description: "Effect repositories",
        strategy: "clone-ignore",
        targets: [
          {
            target: "Effect-TS/effect"
          },
          {
            strategy: "submodule",
            target: "Effect-TS/effect-smol"
          }
        ]
      }
    ])
  })

  test("applies configured add defaults without replacing explicit CLI values", () => {
    const params: ConfigurableAddParams = {
      cloudflareArtifact: false,
      cloudflareArtifactDepth: Option.none<string>(),
      cloudflareArtifactName: Option.none<string>(),
      exclude: ["*.log"],
      excludeDirs: [],
      excludeExtensions: [],
      maxFileSize: Option.none<string>(),
      ref: Option.some("develop"),
      release: Option.none<string>(),
      strategy: Option.none<"subtree" | "submodule" | "clone-ignore">(),
      syncPackage: Option.none<string>(),
      tag: Option.none<string>()
    }

    const result = applyAddDefaults(params, {
      cloudflareArtifact: true,
      cloudflareArtifactDepth: "1",
      cloudflareArtifactName: "artifact-cache",
      exclude: ["*.snap"],
      excludeDirs: ["docs"],
      excludeExtensions: ["png"],
      maxFileSize: "1MB",
      ref: "main",
      release: undefined,
      strategy: "clone-ignore",
      syncPackage: "effect",
      tag: undefined
    })

    expect(result).toEqual({
      cloudflareArtifact: true,
      cloudflareArtifactDepth: Option.some("1"),
      cloudflareArtifactName: Option.some("artifact-cache"),
      exclude: ["*.snap", "*.log"],
      excludeDirs: ["docs"],
      excludeExtensions: ["png"],
      maxFileSize: Option.some("1MB"),
      ref: Option.some("develop"),
      release: Option.none(),
      strategy: Option.some("clone-ignore"),
      syncPackage: Option.none(),
      tag: Option.none()
    })
  })

  test("lets configured aliases override bundled aliases and strategy recommendations", async () => {
    const bundled = await Effect.runPromise(
      repositoryAliasEntriesFromDatabase({
        aliases: [
          {
            alias: "effect",
            strategy: "subtree",
            targets: ["Effect-TS/effect"]
          }
        ]
      })
    )
    const configured = await Effect.runPromise(
      repositoryAliasEntriesFromDatabase({
        aliases: [
          {
            alias: "effect",
            strategy: "clone-ignore",
            targets: ["Effect-TS/effect-smol"]
          }
        ]
      })
    )

    const merged = mergeAliasEntries(bundled, configured)

    expect(expandAliasTargetsWith(merged, ["effect", "Effect-TS/effect-smol"])).toEqual([
      {
        alias: "effect",
        input: "effect",
        strategy: "clone-ignore",
        target: "Effect-TS/effect-smol"
      }
    ])
  })

  test("parses cache-link as a configurable strategy", async () => {
    const config = await Effect.runPromise(
      parseIngraftConfigText(
        [
          "[defaults]",
          'strategy = "cache-link"',
          "",
          "[[aliases]]",
          'alias = "fx"',
          'strategy = "cache-link"',
          'targets = [{ target = "Effect-TS/effect", strategy = "cache-link" }]'
        ].join("\n")
      )
    )

    expect(config.defaults.strategy).toBe("cache-link")
    expect(config.aliases[0]?.strategy).toBe("cache-link")
    expect(config.aliases[0]?.targets[0]).toEqual({
      strategy: "cache-link",
      target: "Effect-TS/effect"
    })
  })
})
