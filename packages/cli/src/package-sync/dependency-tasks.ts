import { Option } from "effect"

import type { VendoredRepo } from "../domain/vendor-state.ts"
import type { DependencyVendorCandidate } from "./service.ts"
import {
  findExistingRepo,
  matchedDependencyCandidates,
  packageVersionReport,
  shouldDisplayCandidateVersions,
  vendoredPackageVersionKey,
  type PackageVersionDriftStatus,
  type PackageVersionReport,
  type VendoredPackageVersionMap
} from "./version-report.ts"

export interface DependencyVendorTask {
  readonly action: "add" | "update"
  readonly existingName: Option.Option<string>
  readonly packageNames: ReadonlyArray<string>
  readonly primaryPackageName: string
  readonly repositoryUrl: string
  readonly suggestedName?: string
  readonly syncPackage: string
  readonly versions: DependencyVendorTaskVersions
}

export type DependencyVersionDriftStatus = PackageVersionDriftStatus
export type DependencyVendorTaskVersions = PackageVersionReport
export { vendoredPackageVersionKey }

export const dependencyVendorTasks = (
  candidates: ReadonlyArray<DependencyVendorCandidate>,
  repos: ReadonlyArray<VendoredRepo>,
  vendoredPackageVersions: VendoredPackageVersionMap = new Map()
): ReadonlyArray<DependencyVendorTask> => {
  const tasks = new Map<string, DependencyVendorTask>()
  for (const candidate of matchedDependencyCandidates(candidates)) {
    const repositoryUrl = candidate.repositoryUrl
    if (!repositoryUrl) continue
    const existing = findExistingRepo(candidate, repos)
    const key = existing === undefined ? `add:${repositoryUrl}` : `update:${existing.name}`
    const previous = tasks.get(key)
    if (previous) {
      const preferCandidate = shouldDisplayCandidateVersions(candidate, existing)
      tasks.set(key, {
        ...previous,
        packageNames: [...previous.packageNames, candidate.packageName],
        ...(preferCandidate
          ? {
              primaryPackageName: candidate.packageName,
              syncPackage: candidate.syncPackage,
              versions: packageVersionReport({
                candidate,
                existing,
                vendoredPackageVersions
              })
            }
          : {})
      })
      continue
    }
    const task = {
      action: existing === undefined ? "add" : "update",
      existingName: existing === undefined ? Option.none() : Option.some(existing.name),
      packageNames: [candidate.packageName],
      primaryPackageName: candidate.packageName,
      repositoryUrl,
      syncPackage: candidate.syncPackage,
      versions: packageVersionReport({
        candidate,
        existing,
        vendoredPackageVersions
      })
    } satisfies Omit<DependencyVendorTask, "suggestedName">
    tasks.set(
      key,
      candidate.suggestedName === undefined
        ? task
        : { ...task, suggestedName: candidate.suggestedName }
    )
  }
  return [...tasks.values()]
}
