import { Console, Effect } from "effect"
import { Command, Flag } from "effect/unstable/cli"
import { Box } from "ink"

import { Header, KeyValues, Section, Table, type TableColumn } from "../app/ink/components.tsx"
import { renderInkOnce } from "../app/ink/render.tsx"
import { withCommandTelemetry } from "../app/log.tsx"
import { VENDOR_DIR } from "../domain/constants.ts"
import { InkRenderFailed } from "../domain/errors.ts"
import { type VendoredRepo, listVendored } from "../domain/vendor-state.ts"
import { PackageVersionSync, type DependencyVendorCandidate } from "../package-sync/service.ts"
import { detectVendoredPackageVersions } from "../package-sync/version-detect.ts"
import {
  type VendoredPackageVersionMap,
  versionedVendoredRepos,
  type VersionedVendoredRepo
} from "../package-sync/version-report.ts"
import { repoRoot } from "../services/git.ts"

export interface ListCommandParams {
  readonly json: boolean
  readonly versions: boolean
}

const listJsonOption = Flag.boolean("json").pipe(
  Flag.withDescription("Output machine-readable JSON to stdout.")
)

const listVersionsOption = Flag.boolean("versions").pipe(
  Flag.withDescription("Resolve package and version drift metadata for vendored repositories.")
)

const versionValue = (
  repo: VersionedVendoredRepo,
  key: "local" | "remote" | "status" | "vendor"
): string => repo.versions?.[key] ?? "-"

const packageNames = (repo: VersionedVendoredRepo): string =>
  repo.packageNames.length === 0 ? "-" : repo.packageNames.join(", ")

const fastRepositoryColumns = [
  { header: "Name", value: (repo: VersionedVendoredRepo) => repo.name },
  { header: "Strategy", value: (repo) => repo.strategy },
  { header: "Path", value: (repo) => repo.prefix },
  { header: "Ref", value: (repo) => repo.ref },
  { header: "Source", value: (repo) => repo.url }
] satisfies ReadonlyArray<TableColumn<VersionedVendoredRepo>>

const versionRepositoryColumns = [
  { header: "Name", value: (repo: VersionedVendoredRepo) => repo.name },
  { header: "Strategy", value: (repo) => repo.strategy },
  { header: "Path", value: (repo) => repo.prefix },
  { header: "Package", value: packageNames },
  { header: "Local", value: (repo) => versionValue(repo, "local") },
  { header: "Vendor", value: (repo) => versionValue(repo, "vendor") },
  { header: "Remote", value: (repo) => versionValue(repo, "remote") },
  { header: "Status", value: (repo) => versionValue(repo, "status") }
] satisfies ReadonlyArray<TableColumn<VersionedVendoredRepo>>

const unversionedRepos = (
  repos: ReadonlyArray<VendoredRepo>
): ReadonlyArray<VersionedVendoredRepo> => repos.map((repo) => ({ ...repo, packageNames: [] }))

interface ListReposDependencies<R = never> {
  readonly detectVendoredVersions: (
    cwd: string,
    candidates: ReadonlyArray<DependencyVendorCandidate>,
    repos: ReadonlyArray<VendoredRepo>
  ) => Effect.Effect<VendoredPackageVersionMap, unknown, R>
  readonly listVendored: (cwd: string) => Effect.Effect<ReadonlyArray<VendoredRepo>, unknown, R>
  readonly scanPackages: (
    cwd: string
  ) => Effect.Effect<ReadonlyArray<DependencyVendorCandidate>, unknown, R>
}

export const resolveListReposWith = <R,>(
  dependencies: ListReposDependencies<R>,
  { cwd, versions }: { readonly cwd: string; readonly versions: boolean }
) =>
  Effect.gen(function* () {
    const rawRepos = yield* dependencies.listVendored(cwd)
    if (!versions) return unversionedRepos(rawRepos)
    const candidates = yield* dependencies.scanPackages(cwd)
    const vendoredPackageVersions = yield* dependencies.detectVendoredVersions(
      cwd,
      candidates,
      rawRepos
    )
    return versionedVendoredRepos({ candidates, repos: rawRepos, vendoredPackageVersions })
  })

const ListView = ({
  repos,
  versions
}: {
  readonly repos: ReadonlyArray<VersionedVendoredRepo>
  readonly versions: boolean
}) => (
  <Box flexDirection="column">
    <Header title="ingraft" subtitle="vendored repositories" />
    <Section title="Workspace">
      <KeyValues entries={[{ label: "Vendor directory", value: `${VENDOR_DIR}/` }]} />
    </Section>
    <Section title="Repositories">
      <Table
        columns={versions ? versionRepositoryColumns : fastRepositoryColumns}
        empty="No repositories vendored."
        rows={repos}
      />
    </Section>
  </Box>
)

export const listImpl = ({ json, versions }: ListCommandParams) =>
  Effect.gen(function* () {
    const cwd = yield* repoRoot
    const reposEffect = versions
      ? Effect.gen(function* () {
          const pkgSync = yield* PackageVersionSync
          return yield* resolveListReposWith(
            {
              detectVendoredVersions: detectVendoredPackageVersions,
              listVendored,
              scanPackages: (cwd) => pkgSync.scan(cwd)
            },
            { cwd, versions }
          )
        })
      : resolveListReposWith(
          {
            detectVendoredVersions: detectVendoredPackageVersions,
            listVendored,
            scanPackages: () => Effect.succeed([])
          },
          { cwd, versions }
        )
    const repos = yield* reposEffect
    if (json) {
      yield* Console.log(JSON.stringify({ repos, vendor_dir: VENDOR_DIR }, null, 2))
      return
    }
    yield* Effect.tryPromise({
      try: () => renderInkOnce(<ListView repos={repos} versions={versions} />),
      catch: (cause) => new InkRenderFailed({ view: "ListView", cause })
    })
  }).pipe(withCommandTelemetry("list"))

export const listCmd = Command.make(
  "list",
  { json: listJsonOption, versions: listVersionsOption },
  listImpl
).pipe(Command.withDescription("List vendored repositories (derived from git commit trailers)."))
