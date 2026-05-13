import { describe, expect, test } from "bun:test"

import { repoRows, summarizeSnapshot, taskRows } from "../src/tui/status.ts"

describe("ingraft tui status", () => {
  test("summarizes dependency and vendoring task state", () => {
    expect(
      summarizeSnapshot({
        candidates: [
          { packageName: "effect", status: "matched" },
          { packageName: "left-pad", status: "missing-repository" }
        ],
        repos: [],
        tasks: [
          {
            action: "add",
            existingName: null,
            packageNames: ["effect"],
            primaryPackageName: "effect",
            repositoryUrl: "https://github.com/Effect-TS/effect.git",
            suggestedName: "effect",
            versions: {
              local: "effect@3.21.2 (bun-lock)",
              remote: "effect@3.21.2 (npm latest)",
              status: "not-vendored",
              vendor: "not vendored"
            }
          }
        ]
      })
    ).toEqual([
      "2 dependencies scanned",
      "1 matched to source repositories",
      "1 repos ready to add",
      "0 vendored repos ready to update"
    ])
  })

  test("renders task rows for source repositories", () => {
    expect(
      taskRows({
        candidates: [],
        repos: [],
        tasks: [
          {
            action: "update",
            existingName: "effect",
            packageNames: ["effect", "@effect/platform"],
            primaryPackageName: "effect",
            repositoryUrl: "https://github.com/Effect-TS/effect.git",
            versions: {
              local: "effect@3.21.2 (bun-lock)",
              remote: "effect@3.21.3 (npm latest)",
              status: "remote-drift",
              vendor: "effect@3.21.2 (vendored source)"
            }
          }
        ]
      })
    ).toEqual(["UPDATE effect, @effect/platform -> effect [remote-drift]"])
  })

  test("renders vendored repo rows with local vendor and remote versions", () => {
    expect(
      repoRows({
        candidates: [],
        repos: [
          {
            name: "effect",
            packageNames: ["effect"],
            path: "vendor/effect",
            ref: "main",
            source: "https://github.com/Effect-TS/effect.git",
            strategy: "subtree",
            versions: {
              local: "effect@3.21.2 (bun-lock)",
              remote: "effect@3.21.3 (npm latest)",
              status: "remote-drift",
              vendor: "effect@3.21.2 (vendored source)"
            }
          }
        ],
        tasks: []
      })
    ).toEqual([
      "effect                       subtree      effect                       effect@3.21.2 (bun-lock)         effect@3.21.2 (vendored source)  effect@3.21.3 (npm latest)       remote-drift"
    ])
  })
})
