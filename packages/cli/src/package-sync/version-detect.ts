import { Effect, Option } from "effect"

import type { VendoredRepo } from "../domain/vendor-state.ts"
import { detectVendoredPackageVersion, type DependencyVendorCandidate } from "./service.ts"
import {
  findExistingRepo,
  matchedDependencyCandidates,
  vendoredPackageVersionKey
} from "./version-report.ts"

type VendoredPackageVersionEntry = readonly [string, string]

export const detectVendoredPackageVersions = (
  cwd: string,
  candidates: ReadonlyArray<DependencyVendorCandidate>,
  repos: ReadonlyArray<VendoredRepo>
) =>
  Effect.gen(function* () {
    const entries = yield* Effect.forEach(
      matchedDependencyCandidates(candidates),
      (candidate) => {
        const existing = findExistingRepo(candidate, repos)
        if (existing === undefined) {
          return Effect.succeed([] as ReadonlyArray<VendoredPackageVersionEntry>)
        }
        return detectVendoredPackageVersion({
          cwd,
          ecosystem: candidate.source,
          packageName: candidate.packageName,
          prefix: existing.prefix
        }).pipe(
          Effect.map((version) =>
            Option.isSome(version)
              ? ([
                  [
                    vendoredPackageVersionKey(existing.name, candidate.packageName),
                    version.value.version
                  ]
                ] as const)
              : ([] as ReadonlyArray<VendoredPackageVersionEntry>)
          ),
          Effect.catch(() => Effect.succeed([] as ReadonlyArray<VendoredPackageVersionEntry>))
        )
      },
      { concurrency: 4 }
    )
    return new Map(entries.flat())
  })
