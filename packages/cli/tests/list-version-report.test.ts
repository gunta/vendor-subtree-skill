import { describe, expect, test } from "bun:test"

import { Effect } from "effect"

import { resolveListReposWith } from "../src/commands/list.tsx"
import type { VendoredRepo } from "../src/domain/vendor-state.ts"
import type { DependencyVendorCandidate } from "../src/package-sync/service.ts"
import {
  vendoredPackageVersionKey,
  versionedVendoredRepos
} from "../src/package-sync/version-report.ts"

const repo = {
  date: "today",
  filter: {
    exclude: [],
    excludeDirs: [],
    excludeExtensions: [],
    maxFileSizeBytes: null
  },
  name: "effect",
  prefix: "vendor/effect",
  ref: "main",
  sha: "abc",
  strategy: "subtree",
  url: "https://github.com/Effect-TS/effect.git"
} satisfies VendoredRepo

const candidate = {
  manifestPath: "packages/cli/package.json",
  packageName: "effect",
  packageSpec: "^3.21.2",
  repositoryUrl: "https://github.com/Effect-TS/effect.git",
  section: "dependencies",
  source: "npm",
  status: "matched",
  suggestedName: "effect",
  syncPackage: "effect",
  version: "3.21.2",
  versionSource: "bun-lock",
  remoteVersion: "3.21.3"
} satisfies DependencyVendorCandidate

describe("list version reports", () => {
  test("keeps the default list path on vendored repo metadata only", async () => {
    let scanned = false
    let detectedVersions = false

    const repos = await Effect.runPromise(
      resolveListReposWith(
        {
          detectVendoredVersions: () => {
            detectedVersions = true
            return Effect.succeed(new Map())
          },
          listVendored: () => Effect.succeed([repo]),
          scanPackages: () => {
            scanned = true
            return Effect.succeed([candidate])
          }
        },
        { cwd: "/repo", versions: false }
      )
    )

    expect(scanned).toBe(false)
    expect(detectedVersions).toBe(false)
    expect(repos).toEqual([{ ...repo, packageNames: [] }])
  })

  test("adds local vendor and remote package versions to vendored repos", () => {
    expect(
      versionedVendoredRepos({
        candidates: [candidate],
        repos: [repo],
        vendoredPackageVersions: new Map([
          [vendoredPackageVersionKey("effect", "effect"), "3.21.2"]
        ])
      })
    ).toEqual([
      {
        ...repo,
        packageNames: ["effect"],
        versions: {
          local: "effect@3.21.2 (bun-lock)",
          remote: "effect@3.21.3 (npm latest)",
          status: "remote-drift",
          vendor: "effect@3.21.2 (vendored source)"
        }
      }
    ])
  })
})
