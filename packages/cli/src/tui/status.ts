import { Effect } from "effect"

export interface VendorTuiTask {
  readonly action: "add" | "update"
  readonly existingName: string | null
  readonly packageNames: ReadonlyArray<string>
  readonly primaryPackageName: string
  readonly repositoryUrl: string
  readonly suggestedName?: string
  readonly versions?: VendorTuiTaskVersions
}

export interface VendorTuiTaskVersions {
  readonly local: string
  readonly remote: string
  readonly status: string
  readonly vendor: string
}

export interface VendorTuiRepo {
  readonly name: string
  readonly packageNames: ReadonlyArray<string>
  readonly path: string
  readonly ref: string
  readonly source: string
  readonly strategy: string
  readonly versions?: VendorTuiTaskVersions
}

export interface VendorTuiCandidate {
  readonly packageName: string
  readonly repositoryUrl?: string
  readonly status: string
}

export interface VendorTuiSnapshot {
  readonly candidates: ReadonlyArray<VendorTuiCandidate>
  readonly repos: ReadonlyArray<VendorTuiRepo>
  readonly tasks: ReadonlyArray<VendorTuiTask>
}

const summarizeSnapshotSync = (snapshot: VendorTuiSnapshot): ReadonlyArray<string> => {
  const matched = snapshot.candidates.filter((candidate) => candidate.status === "matched").length
  const adds = snapshot.tasks.filter((task) => task.action === "add").length
  const updates = snapshot.tasks.filter((task) => task.action === "update").length
  return [
    `${snapshot.candidates.length} dependencies scanned`,
    `${matched} matched to source repositories`,
    `${adds} repos ready to add`,
    `${updates} vendored repos ready to update`
  ]
}

export const summarizeSnapshot = (
  snapshot: VendorTuiSnapshot
): Effect.Effect<ReadonlyArray<string>> => Effect.sync(() => summarizeSnapshotSync(snapshot))

const taskRowsSync = (snapshot: VendorTuiSnapshot): ReadonlyArray<string> =>
  snapshot.tasks.map((task) => {
    const packages = task.packageNames.join(", ")
    const target =
      task.action === "update" && task.existingName
        ? task.existingName
        : (task.suggestedName ?? task.repositoryUrl)
    const status = task.versions === undefined ? "" : ` [${task.versions.status}]`
    return `${task.action.toUpperCase()} ${packages} -> ${target}${status}`
  })

export const taskRows = (snapshot: VendorTuiSnapshot): Effect.Effect<ReadonlyArray<string>> =>
  Effect.sync(() => taskRowsSync(snapshot))

const repoPackages = (repo: VendorTuiRepo): string =>
  repo.packageNames.length === 0 ? "-" : repo.packageNames.join(", ")

const repoVersion = (repo: VendorTuiRepo, key: "local" | "remote" | "status" | "vendor"): string =>
  repo.versions?.[key] ?? "-"

export const repoRowsSync = (snapshot: VendorTuiSnapshot): ReadonlyArray<string> =>
  snapshot.repos.map((repo) =>
    [
      repo.name.padEnd(28, " "),
      repo.strategy.padEnd(12, " "),
      repoPackages(repo).padEnd(28, " "),
      repoVersion(repo, "local").padEnd(32, " "),
      repoVersion(repo, "vendor").padEnd(32, " "),
      repoVersion(repo, "remote").padEnd(32, " "),
      repoVersion(repo, "status")
    ].join(" ")
  )

export const repoRows = (snapshot: VendorTuiSnapshot): Effect.Effect<ReadonlyArray<string>> =>
  Effect.sync(() => repoRowsSync(snapshot))
