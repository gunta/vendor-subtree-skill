import { describe, expect, test } from "bun:test"

import {
  parseVendoredCommits,
  parseVendoredLog,
  parseVendoredLogWithDiagnostics
} from "../src/domain/vendor-state.ts"

describe("vendor state parsing", () => {
  test("parses vendored records from isomorphic-git commit objects", () => {
    const timestamp = Date.parse("2026-05-13T00:00:00.000Z") / 1000
    const commits = [
      {
        oid: "iso-sha",
        message: [
          "vendor: add effect (https://github.com/Effect-TS/effect.git@main) [subtree]",
          "",
          "git-subtree-dir: vendor/effect",
          "vendor-source-url: https://github.com/Effect-TS/effect.git",
          "vendor-source-ref: main",
          "vendor-strategy: subtree",
          "vendor-action: upsert",
          "vendor-sync-package: effect"
        ].join("\n"),
        timestamp
      }
    ]

    expect(parseVendoredCommits(commits)).toEqual([
      {
        name: "effect",
        prefix: "vendor/effect",
        url: "https://github.com/Effect-TS/effect.git",
        ref: "main",
        strategy: "subtree",
        filter: {
          exclude: [],
          excludeDirs: [],
          excludeExtensions: [],
          maxFileSizeBytes: null
        },
        syncPackage: "effect",
        sha: "iso-sha",
        date: "2026-05-13T00:00:00.000Z"
      }
    ])
  })

  test("parses the newest vendored record per prefix from git log output", () => {
    const log = [
      [
        "new-sha",
        "2026-05-13T00:00:00Z",
        "vendor/effect",
        "https://github.com/Effect-TS/effect.git",
        "main"
      ].join("\x00"),
      [
        "old-sha",
        "2026-05-12T00:00:00Z",
        "vendor/effect",
        "https://github.com/Effect-TS/effect.git",
        "main"
      ].join("\x00")
    ].join("\x1e")

    expect(parseVendoredLog(log)).toEqual([
      {
        name: "effect",
        prefix: "vendor/effect",
        url: "https://github.com/Effect-TS/effect.git",
        ref: "main",
        strategy: "subtree",
        filter: {
          exclude: [],
          excludeDirs: [],
          excludeExtensions: [],
          maxFileSizeBytes: null
        },
        sha: "new-sha",
        date: "2026-05-13T00:00:00Z"
      }
    ])
  })

  test("parses filter metadata from git trailers", () => {
    const filter = {
      exclude: ["*.snap"],
      excludeDirs: ["docs"],
      excludeExtensions: ["png"],
      maxFileSizeBytes: 1048576
    }
    const log = [
      [
        "sha-filtered",
        "2026-05-13T00:00:00Z",
        "vendor/effect",
        "https://github.com/Effect-TS/effect.git",
        "main",
        "subtree",
        "upsert",
        JSON.stringify(filter)
      ].join("\x00")
    ].join("\x1e")

    expect(parseVendoredLog(log)[0]?.filter).toEqual(filter)
  })

  test("parses synced package metadata from git trailers", () => {
    const log = [
      [
        "sha-synced",
        "2026-05-13T00:00:00Z",
        "vendor/effect",
        "https://github.com/Effect-TS/effect.git",
        "3f4cf6f",
        "subtree",
        "upsert",
        "",
        "effect"
      ].join("\x00")
    ].join("\x1e")

    expect(parseVendoredLog(log)[0]?.syncPackage).toBe("effect")
  })

  test("parses explicit non-subtree strategies from git trailers", () => {
    const log = [
      [
        "sha-submodule",
        "2026-05-13T00:00:00Z",
        "vendor/effect",
        "https://github.com/Effect-TS/effect.git",
        "main",
        "submodule",
        "upsert"
      ].join("\x00"),
      [
        "sha-clone",
        "2026-05-13T00:00:00Z",
        "vendor/effect-platform",
        "https://github.com/Effect-TS/effect.git",
        "main",
        "clone-ignore",
        "upsert"
      ].join("\x00"),
      [
        "sha-cache-link",
        "2026-05-13T00:00:00Z",
        "vendor/effect-cache",
        "https://github.com/Effect-TS/effect.git",
        "main",
        "cache-link",
        "upsert"
      ].join("\x00")
    ].join("\x1e")

    expect(parseVendoredLog(log).map((repo) => repo.strategy)).toEqual([
      "submodule",
      "cache-link",
      "clone-ignore"
    ])
  })

  test("parses resolved ref metadata for cache-link records", () => {
    const log = [
      [
        "sha-cache-link",
        "2026-05-13T00:00:00Z",
        "vendor/effect",
        "https://github.com/Effect-TS/effect.git",
        "main",
        "cache-link",
        "upsert",
        "",
        "",
        "9f3a0d8e6f3a0d8e6f3a0d8e6f3a0d8e6f3a0d8e"
      ].join("\x00")
    ].join("\x1e")

    expect(parseVendoredLog(log)[0]).toMatchObject({
      prefix: "vendor/effect",
      ref: "main",
      resolvedRef: "9f3a0d8e6f3a0d8e6f3a0d8e6f3a0d8e6f3a0d8e",
      strategy: "cache-link"
    })
  })

  test("excludes repos whose latest trailer record is a remove action", () => {
    const log = [
      [
        "remove-sha",
        "2026-05-14T00:00:00Z",
        "vendor/effect",
        "https://github.com/Effect-TS/effect.git",
        "main",
        "clone-ignore",
        "remove"
      ].join("\x00"),
      [
        "add-sha",
        "2026-05-13T00:00:00Z",
        "vendor/effect",
        "https://github.com/Effect-TS/effect.git",
        "main",
        "clone-ignore",
        "upsert"
      ].join("\x00")
    ].join("\x1e")

    expect(parseVendoredLog(log)).toEqual([])
  })

  test("ignores malformed records instead of creating partial state", () => {
    const log = ["sha\x002026-05-13T00:00:00Z\x00\x00https://example.com/x.git\x00"].join("\x1e")

    expect(parseVendoredLog(log)).toEqual([])
  })

  test("reports schema diagnostics for malformed records", () => {
    const log = ["sha\x002026-05-13T00:00:00Z\x00\x00https://example.com/x.git\x00"].join("\x1e")

    const result = parseVendoredLogWithDiagnostics(log)

    expect(result.repos).toEqual([])
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0]?.reason).toContain("prefix")
  })

  test("reports diagnostics for malformed filter metadata", () => {
    const log = [
      [
        "sha-filtered",
        "2026-05-13T00:00:00Z",
        "vendor/effect",
        "https://github.com/Effect-TS/effect.git",
        "main",
        "subtree",
        "upsert",
        "{bad json"
      ].join("\x00")
    ].join("\x1e")

    const result = parseVendoredLogWithDiagnostics(log)

    expect(result.repos).toEqual([])
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0]?.reason).toContain("filter")
  })
})
