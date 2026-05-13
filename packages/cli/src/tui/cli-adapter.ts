import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { Effect, FileSystem, Option, Queue, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"

import { LiveLayer } from "../app/layers.ts"
import { CommandPlanFailed } from "../domain/errors.ts"
import { type VendoredRepo, listVendored } from "../domain/vendor-state.ts"
import {
  dependencyVendorTasks,
  type DependencyVendorTask
} from "../package-sync/dependency-tasks.ts"
import {
  PackageVersionSync,
  type DependencyVendorCandidate,
  type PackageDependency
} from "../package-sync/service.ts"
import { detectVendoredPackageVersions } from "../package-sync/version-detect.ts"
import {
  versionedVendoredRepos,
  type VendoredPackageVersionMap,
  type VersionedVendoredRepo
} from "../package-sync/version-report.ts"
import { GitMetadataLive } from "../services/git-metadata.ts"
import { repoRoot } from "../services/git.ts"
import type { CommandPlan } from "./dashboard.ts"
import type {
  VendorTuiCandidate,
  VendorTuiRepo,
  VendorTuiSnapshot,
  VendorTuiTask
} from "./status.ts"

export interface CliInvocation {
  readonly args: ReadonlyArray<string>
  readonly command: string
}

export interface PlanResult {
  readonly status: number | null
  readonly stdout: string
  readonly stderr: string
}

/**
 * Pure: given whether a local CLI script exists, choose how to invoke ingraft.
 * If the local script exists, run it via Bun; otherwise call the published CLI.
 */
export const selectCliCommand = (params: {
  readonly localCliExists: boolean
  readonly localCliPath: string
  readonly args: ReadonlyArray<string>
}): CliInvocation =>
  params.localCliExists
    ? { args: [params.localCliPath, ...params.args], command: "bun" }
    : { args: [...params.args], command: "ingraft" }

/**
 * Pure: given an exec result (status + stdout + stderr) and a plan label,
 * format the user-facing one-line status string.
 */
export const formatPlanResult = (params: {
  readonly result: PlanResult
  readonly label: string
}): string => {
  const { result, label } = params
  const trimmed = result.stderr.trim() || result.stdout.trim()
  const tail = trimmed.length > 0 ? trimmed.split("\n").slice(-4) : []
  const suffix = tail.length > 0 ? `: ${tail.join(" | ")}` : ""
  return result.status === 0 ? `OK ${label}${suffix}` : `FAIL ${label}${suffix}`
}

export interface SnapshotResult {
  readonly message: string
  readonly snapshot: VendorTuiSnapshot
}

export interface SnapshotProgress extends SnapshotResult {
  readonly complete: boolean
}

export interface SnapshotStreamServices<E = never, R = never> {
  readonly detectVendoredVersions: (
    cwd: string,
    candidates: ReadonlyArray<DependencyVendorCandidate>,
    repos: ReadonlyArray<VendoredRepo>
  ) => Effect.Effect<VendoredPackageVersionMap, E, R>
  readonly listDependencies: (cwd: string) => Effect.Effect<ReadonlyArray<PackageDependency>, E, R>
  readonly listRepos: (cwd: string) => Effect.Effect<ReadonlyArray<VendoredRepo>, E, R>
  readonly root: Effect.Effect<string, E, R>
  readonly scanDependency: (
    cwd: string,
    dependency: PackageDependency
  ) => Effect.Effect<DependencyVendorCandidate, E, R>
}

const localCliPath = (): string =>
  resolve(dirname(fileURLToPath(import.meta.url)), "../../scripts/vendor.ts")

const cliInvocationEffect = (
  args: ReadonlyArray<string>
): Effect.Effect<CliInvocation, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const localCli = localCliPath()
    const localCliExists = yield* fs
      .exists(localCli)
      .pipe(Effect.catch(() => Effect.succeed(false)))
    return selectCliCommand({ args, localCliExists, localCliPath: localCli })
  })

export const emptySnapshot = (): VendorTuiSnapshot => ({
  candidates: [],
  repos: [],
  tasks: []
})

const failedSnapshot = (message: string): VendorTuiSnapshot => ({
  candidates: [],
  repos: [],
  tasks: [
    {
      action: "add",
      existingName: null,
      packageNames: ["ingraft deps --json failed"],
      primaryPackageName: "ingraft",
      repositoryUrl: message,
      suggestedName: "CLI unavailable"
    }
  ]
})

const toTuiCandidate = (candidate: DependencyVendorCandidate): VendorTuiCandidate => ({
  packageName: candidate.packageName,
  ...(candidate.repositoryUrl === undefined ? {} : { repositoryUrl: candidate.repositoryUrl }),
  status: candidate.status
})

const toTuiTask = (task: DependencyVendorTask): VendorTuiTask => ({
  action: task.action,
  existingName: Option.getOrNull(task.existingName),
  packageNames: task.packageNames,
  primaryPackageName: task.primaryPackageName,
  repositoryUrl: task.repositoryUrl,
  ...(task.suggestedName === undefined ? {} : { suggestedName: task.suggestedName }),
  versions: task.versions
})

const toTuiVersionedRepo = (repo: VersionedVendoredRepo): VendorTuiRepo => {
  const base: VendorTuiRepo = {
    name: repo.name,
    packageNames: repo.packageNames,
    path: repo.prefix,
    ref: repo.ref,
    source: repo.url,
    strategy: repo.strategy
  }
  if (repo.versions === undefined) return base
  return { ...base, versions: repo.versions }
}

const snapshotFromParts = (
  repos: ReadonlyArray<VendoredRepo>,
  candidates: ReadonlyArray<DependencyVendorCandidate>,
  vendoredPackageVersions: VendoredPackageVersionMap
): VendorTuiSnapshot => ({
  candidates: candidates.map(toTuiCandidate),
  repos: versionedVendoredRepos({ candidates, repos, vendoredPackageVersions }).map(
    toTuiVersionedRepo
  ),
  tasks: dependencyVendorTasks(candidates, repos, vendoredPackageVersions).map(toTuiTask)
})

const definedCandidates = (
  candidates: ReadonlyArray<DependencyVendorCandidate | undefined>
): ReadonlyArray<DependencyVendorCandidate> =>
  candidates.filter((candidate): candidate is DependencyVendorCandidate => candidate !== undefined)

const errorMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

const emitProgress = (
  onProgress: (progress: SnapshotProgress) => void,
  progress: SnapshotProgress
) => Effect.sync(() => onProgress(progress))

export const streamSnapshotWith = <E, R>(
  services: SnapshotStreamServices<E, R>,
  onProgress: (progress: SnapshotProgress) => void
): Effect.Effect<SnapshotResult, never, R> =>
  Effect.gen(function* () {
    const cwd = yield* services.root
    const repos = yield* services.listRepos(cwd)
    let vendoredPackageVersions: VendoredPackageVersionMap = new Map()
    let snapshot = snapshotFromParts(repos, [], vendoredPackageVersions)
    yield* emitProgress(onProgress, {
      complete: false,
      message: `Loaded ${repos.length} vendored repo(s); scanning project manifests...`,
      snapshot
    })

    const dependencies = yield* services.listDependencies(cwd)
    yield* emitProgress(onProgress, {
      complete: false,
      message: `Found ${dependencies.length} project dependenc${
        dependencies.length === 1 ? "y" : "ies"
      }; fetching package metadata...`,
      snapshot
    })

    const candidateSlots: Array<DependencyVendorCandidate | undefined> = Array.from({
      length: dependencies.length
    })

    yield* Effect.forEach(
      dependencies.map((dependency, index) => ({ dependency, index })),
      ({ dependency, index }) =>
        services.scanDependency(cwd, dependency).pipe(
          Effect.flatMap((candidate) =>
            Effect.gen(function* () {
              candidateSlots[index] = candidate
              const nextVersions = yield* services.detectVendoredVersions(cwd, [candidate], repos)
              vendoredPackageVersions = new Map([...vendoredPackageVersions, ...nextVersions])
              const candidates = definedCandidates(candidateSlots)
              snapshot = snapshotFromParts(repos, candidates, vendoredPackageVersions)
              yield* emitProgress(onProgress, {
                complete: false,
                message: `Scanned ${candidates.length}/${dependencies.length}: ${candidate.packageName}`,
                snapshot
              })
            })
          )
        ),
      { concurrency: 6, discard: true }
    )

    const candidates = definedCandidates(candidateSlots)
    const finalSnapshot = snapshotFromParts(repos, candidates, vendoredPackageVersions)
    const message = `Dependency and repository snapshots refreshed (${candidates.length} scanned).`
    yield* emitProgress(onProgress, {
      complete: true,
      message,
      snapshot: finalSnapshot
    })
    return { message, snapshot: finalSnapshot } satisfies SnapshotResult
  }).pipe(
    Effect.catch((cause) => {
      const message = errorMessage(cause) || "Dependency scan failed."
      const result = {
        message,
        snapshot: failedSnapshot(message)
      } satisfies SnapshotResult
      return emitProgress(onProgress, { ...result, complete: true }).pipe(Effect.as(result))
    })
  )

/**
 * A Stream of snapshot progress events backed by the live services. Emits
 * intermediate progress and a final result, then ends.
 *
 * Service / layer construction errors (config file failures, git lookup, etc.)
 * are surfaced through the inner snapshot catch handler as a failed snapshot
 * with an error message — the stream itself never fails. Per-call errors are
 * captured into the snapshot catch handler via Effect.sandbox + asError pattern
 * implemented by `streamSnapshotWith`'s outer Effect.catch.
 */
export const readSnapshotStream: Stream.Stream<SnapshotProgress> =
  Stream.callback<SnapshotProgress>((queue) =>
    Effect.gen(function* () {
      const pkgSync = yield* PackageVersionSync
      yield* streamSnapshotWith(
        {
          detectVendoredVersions: (cwd, candidates, repos) =>
            detectVendoredPackageVersions(cwd, candidates, repos).pipe(Effect.orDie),
          listDependencies: (cwd) => pkgSync.listDependencies(cwd).pipe(Effect.orDie),
          listRepos: (cwd) => listVendored(cwd).pipe(Effect.orDie),
          root: repoRoot.pipe(Effect.orDie),
          scanDependency: (cwd, dependency) =>
            pkgSync.scanDependency(cwd, dependency).pipe(Effect.orDie)
        },
        (progress) => {
          Queue.offerUnsafe(queue, progress)
        }
      )
    }).pipe(Effect.provide(LiveLayer), Effect.provide(GitMetadataLive), Effect.orDie)
  )

const collectString = <E, R>(stream: Stream.Stream<Uint8Array, E, R>) =>
  stream.pipe(
    Stream.decodeText,
    Stream.runFold(
      () => "",
      (a, b) => a + b
    )
  )

export const runCommandPlanEffect = (
  plan: CommandPlan
): Effect.Effect<
  string,
  CommandPlanFailed,
  ChildProcessSpawner.ChildProcessSpawner | FileSystem.FileSystem
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const invocation = yield* cliInvocationEffect(plan.args)
      const command = ChildProcess.make(invocation.command, [...invocation.args], {
        stdout: "pipe",
        stderr: "pipe"
      })
      const proc = yield* command
      const [exitCode, stdout, stderr] = yield* Effect.all(
        [proc.exitCode, collectString(proc.stdout), collectString(proc.stderr)],
        { concurrency: 3 }
      )
      return formatPlanResult({
        label: plan.label,
        result: { status: Number(exitCode), stderr, stdout }
      })
    }).pipe(
      Effect.mapError(
        (cause) => new CommandPlanFailed({ args: plan.args, cause, label: plan.label })
      )
    )
  )
