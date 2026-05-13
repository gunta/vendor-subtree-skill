import { describe, expect, test } from "bun:test"

import { Effect } from "effect"

import { EMPTY_VENDOR_FILTER } from "../src/domain/vendor-filter.ts"
import type { VendoredRepo } from "../src/domain/vendor-state.ts"
import type { DependencyVendorCandidate, PackageDependency } from "../src/package-sync/service.ts"
import { vendoredPackageVersionKey } from "../src/package-sync/version-report.ts"
import {
  streamSnapshotWith,
  type SnapshotProgress,
  type SnapshotStreamServices
} from "../src/tui/cli-adapter.ts"

const repo = {
  date: "today",
  filter: EMPTY_VENDOR_FILTER,
  name: "effect",
  prefix: "vendor/effect",
  ref: "main",
  sha: "abc",
  strategy: "subtree",
  syncPackage: "effect",
  url: "https://github.com/Effect-TS/effect.git"
} satisfies VendoredRepo

const dependency = {
  ecosystem: "npm",
  manifestPath: "package.json",
  name: "effect",
  section: "dependencies",
  spec: "^3.21.0"
} satisfies PackageDependency

const candidate = {
  manifestPath: "package.json",
  packageName: "effect",
  packageSpec: "^3.21.0",
  remoteVersion: "3.21.3",
  repositoryUrl: "https://github.com/Effect-TS/effect.git",
  section: "dependencies",
  source: "npm",
  status: "matched",
  suggestedName: "effect",
  syncPackage: "effect",
  version: "3.21.2",
  versionSource: "bun-lock"
} satisfies DependencyVendorCandidate

describe("TUI snapshot streaming", () => {
  test("emits repository state before deferred package scans finish", async () => {
    const events: Array<SnapshotProgress> = []
    const services = {
      detectVendoredVersions: () =>
        Effect.succeed(new Map([[vendoredPackageVersionKey("effect", "effect"), "3.21.2"]])),
      listDependencies: () => Effect.succeed([dependency]),
      listRepos: () => Effect.succeed([repo]),
      root: Effect.succeed("/repo"),
      scanDependency: () => Effect.succeed(candidate)
    } satisfies SnapshotStreamServices

    const final = await Effect.runPromise(
      streamSnapshotWith(services, (progress) => events.push(progress))
    )

    expect(events[0]?.snapshot.repos).toHaveLength(1)
    expect(events[0]?.snapshot.candidates).toHaveLength(0)
    expect(events[0]?.complete).toBe(false)
    expect(events[2]?.snapshot.tasks).toEqual([
      {
        action: "update",
        existingName: "effect",
        packageNames: ["effect"],
        primaryPackageName: "effect",
        repositoryUrl: "https://github.com/Effect-TS/effect.git",
        suggestedName: "effect",
        versions: {
          local: "effect@3.21.2 (bun-lock)",
          remote: "effect@3.21.3 (npm latest)",
          status: "remote-drift",
          vendor: "effect@3.21.2 (vendored source)"
        }
      }
    ])
    expect(events.at(-1)?.complete).toBe(true)
    expect(final.snapshot.tasks).toHaveLength(1)
  })
})
