import type { VendoredRepo } from "../domain/vendor-state.ts"
import type { DependencyVendorCandidate } from "./service.ts"

export type PackageVersionDriftStatus =
  | "local-vendor-drift"
  | "not-vendored"
  | "remote-drift"
  | "synced"
  | "unknown"

export interface PackageVersionReport {
  readonly local: string
  readonly remote: string
  readonly status: PackageVersionDriftStatus
  readonly vendor: string
}

export interface VersionedVendoredRepo extends VendoredRepo {
  readonly packageNames: ReadonlyArray<string>
  readonly versions?: PackageVersionReport
}

export type VendoredPackageVersionMap = ReadonlyMap<string, string>
export const matchedDependencyCandidates = (
  candidates: ReadonlyArray<DependencyVendorCandidate>
): ReadonlyArray<DependencyVendorCandidate> =>
  candidates.filter((candidate) => candidate.status === "matched" && candidate.repositoryUrl)

export const findExistingRepo = (
  candidate: DependencyVendorCandidate,
  repos: ReadonlyArray<VendoredRepo>
): VendoredRepo | undefined =>
  repos.find(
    (repo) =>
      repo.syncPackage === candidate.syncPackage ||
      repo.syncPackage === candidate.packageName ||
      repo.url === candidate.repositoryUrl
  )

export const vendoredPackageVersionKey = (repoName: string, packageName: string): string =>
  `${repoName}\u0000${packageName}`

const packageVersionLabel = (
  packageName: string,
  version: string | undefined,
  source: string
): string => `${packageName}@${version ?? "unknown"} (${source})`

const packageVersionStatus = ({
  hasVendor,
  localVersion,
  remoteVersion,
  vendorVersion
}: {
  readonly hasVendor: boolean
  readonly localVersion: string | undefined
  readonly remoteVersion: string | undefined
  readonly vendorVersion: string | undefined
}): PackageVersionDriftStatus => {
  if (!hasVendor) return "not-vendored"
  if (localVersion === undefined || vendorVersion === undefined) return "unknown"
  if (localVersion !== vendorVersion) return "local-vendor-drift"
  if (remoteVersion !== undefined && remoteVersion !== localVersion) return "remote-drift"
  return "synced"
}

export const packageVersionReport = ({
  candidate,
  existing,
  vendoredPackageVersions
}: {
  readonly candidate: DependencyVendorCandidate
  readonly existing: VendoredRepo | undefined
  readonly vendoredPackageVersions: VendoredPackageVersionMap
}): PackageVersionReport => {
  const repo = existing
  const localSource =
    candidate.versionSource === undefined || candidate.versionSource === "package-json"
      ? "package.json range"
      : candidate.versionSource
  const vendorVersion =
    repo === undefined
      ? undefined
      : vendoredPackageVersions.get(vendoredPackageVersionKey(repo.name, candidate.packageName))
  return {
    local: packageVersionLabel(candidate.packageName, candidate.version, localSource),
    remote: packageVersionLabel(
      candidate.packageName,
      candidate.remoteVersion,
      `${candidate.source} latest`
    ),
    status: packageVersionStatus({
      hasVendor: repo !== undefined,
      localVersion: candidate.version,
      remoteVersion: candidate.remoteVersion,
      vendorVersion
    }),
    vendor:
      repo === undefined
        ? "not vendored"
        : vendorVersion === undefined
          ? `unknown (ref ${repo.ref})`
          : packageVersionLabel(candidate.packageName, vendorVersion, "vendored source")
  }
}

export const shouldDisplayCandidateVersions = (
  candidate: DependencyVendorCandidate,
  existing: VendoredRepo | undefined
): boolean =>
  existing !== undefined &&
  (existing.name === candidate.packageName || existing.syncPackage === candidate.packageName)

const candidatesForRepo = (
  repo: VendoredRepo,
  candidates: ReadonlyArray<DependencyVendorCandidate>
): ReadonlyArray<DependencyVendorCandidate> =>
  matchedDependencyCandidates(candidates).filter(
    (candidate) =>
      repo.syncPackage === candidate.syncPackage ||
      repo.syncPackage === candidate.packageName ||
      repo.url === candidate.repositoryUrl
  )

const preferredCandidateForRepo = (
  repo: VendoredRepo,
  candidates: ReadonlyArray<DependencyVendorCandidate>
): DependencyVendorCandidate | undefined =>
  candidates.find((candidate) => repo.syncPackage === candidate.packageName) ??
  candidates.find((candidate) => repo.syncPackage === candidate.syncPackage) ??
  candidates.find((candidate) => repo.name === candidate.packageName) ??
  candidates[0]

export const versionedVendoredRepos = ({
  candidates,
  repos,
  vendoredPackageVersions
}: {
  readonly candidates: ReadonlyArray<DependencyVendorCandidate>
  readonly repos: ReadonlyArray<VendoredRepo>
  readonly vendoredPackageVersions: VendoredPackageVersionMap
}): ReadonlyArray<VersionedVendoredRepo> =>
  repos.map((repo) => {
    const repoCandidates = candidatesForRepo(repo, candidates)
    const preferredCandidate = preferredCandidateForRepo(repo, repoCandidates)
    return {
      ...repo,
      packageNames: repoCandidates.map((candidate) => candidate.packageName),
      ...(preferredCandidate === undefined
        ? {}
        : {
            versions: packageVersionReport({
              candidate: preferredCandidate,
              existing: repo,
              vendoredPackageVersions
            })
          })
    }
  })
