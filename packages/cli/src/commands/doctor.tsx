import { Console, Effect, Option } from "effect"
import { Command, Flag } from "effect/unstable/cli"
import { Box } from "ink"

import { Header, KeyValues, Section, Table } from "../app/ink/components.tsx"
import { renderInkOnce } from "../app/ink/render.tsx"
import { withCommandTelemetry } from "../app/log.tsx"
import { VENDOR_DIR } from "../domain/constants.ts"
import { InkRenderFailed } from "../domain/errors.ts"
import { detectFork, readForkMode, type ForkMode } from "../domain/fork-mode.ts"
import { listVendored, type VendoredRepo } from "../domain/vendor-state.ts"
import { relativeTo } from "../project/reports.ts"
import { ProjectFiles } from "../project/service.ts"
import { ProjectSurfaces, type ProjectSurfaceReport } from "../project/surfaces.ts"
import { repoRoot } from "../services/git.ts"
import { classifyRepo, type RepoType } from "../services/github-repo-meta.ts"
import { LocalState } from "../services/local-state.ts"
import type { RepoMeta, UserIdentity } from "../services/local-state.ts"
import type { ToolIgnoreReport } from "../tool-ignores/common.ts"
import { ToolIgnores } from "../tool-ignores/service.ts"

export interface DoctorCommandParams {
  readonly fix: boolean
  readonly json: boolean
}

export interface ForkModeReport {
  readonly status: "ok" | "warn" | "info" | "skipped"
  readonly mode: ForkMode | undefined
  readonly isFork: boolean
  readonly parentNameWithOwner: string | undefined
  readonly message: string
}

export interface ComputeForkModeReportParams {
  readonly cwd: string
  readonly repos: ReadonlyArray<VendoredRepo>
}

export const computeForkModeReport = ({ cwd, repos }: ComputeForkModeReportParams) =>
  Effect.gen(function* () {
    const mode = yield* readForkMode({ cwd })
    const detected = yield* detectFork({ cwd })
    const trackedRepos = repos.filter((repo) => repo.localOnly !== true)
    const parentNameWithOwner =
      detected.source === "gh" ? detected.parentNameWithOwner : undefined

    if (!detected.isFork) {
      return {
        status: "skipped" as const,
        mode,
        isFork: false,
        parentNameWithOwner: undefined,
        message: "Not a fork; fork-mode check skipped."
      } satisfies ForkModeReport
    }

    if (mode === undefined) {
      return {
        status: "info" as const,
        mode,
        isFork: true,
        parentNameWithOwner,
        message: "Fork detected but ingraft.forkMode is unset. Run `ingraft init` to set it."
      } satisfies ForkModeReport
    }

    if (mode === "personal" && trackedRepos.length > 0) {
      return {
        status: "warn" as const,
        mode,
        isFork: true,
        parentNameWithOwner,
        message: `forkMode=personal but ${trackedRepos.length} tracked vendor commit(s) exist; they will push upstream if you push this branch.`
      } satisfies ForkModeReport
    }

    return {
      status: "ok" as const,
      mode,
      isFork: true,
      parentNameWithOwner,
      message: `forkMode=${mode}; vendor commits match the declared mode.`
    } satisfies ForkModeReport
  })

export interface DoctorReportData {
  readonly cwd: string
  readonly agentFiles: ReadonlyArray<ProjectSurfaceReport>
  readonly editorFiles: ReadonlyArray<ProjectSurfaceReport>
  readonly repositoryFiles: ReadonlyArray<ProjectSurfaceReport>
  readonly repos: ReadonlyArray<VendoredRepo>
  readonly repoTypes: Record<string, RepoType>
  readonly toolReports: ReadonlyArray<ToolIgnoreReport>
  readonly forkMode: ForkModeReport
}

export interface FixDoctorParams {
  readonly cwd: string
  readonly repos: ReadonlyArray<VendoredRepo>
}

const doctorJsonOption = Flag.boolean("json").pipe(
  Flag.withDescription("Output machine-readable JSON to stdout.")
)

const doctorFixOption = Flag.boolean("fix").pipe(
  Flag.withDescription(
    "Repair generated agent docs, repository hygiene files, editor settings, and detected tool ignores before reporting."
  )
)

const renderConfigPath = (cwd: string, path: string | undefined): string =>
  path === undefined ? "-" : relativeTo({ root: cwd, path })

const surfaceColumns = (cwd: string) => [
  { header: "Name", value: (report: ProjectSurfaceReport) => report.name },
  { header: "Status", value: (report: ProjectSurfaceReport) => report.status },
  { header: "Path", value: (report: ProjectSurfaceReport) => renderConfigPath(cwd, report.path) },
  { header: "Message", value: (report: ProjectSurfaceReport) => report.message }
]

const DoctorView = ({
  agentFiles,
  cwd,
  editorFiles,
  forkMode,
  repos,
  repoTypes,
  repositoryFiles,
  toolReports
}: DoctorReportData) => (
  <Box flexDirection="column">
    <Header title="ingraft" subtitle="doctor" />
    <Section title="Workspace">
      <KeyValues
        entries={[
          { label: "Vendor directory", value: `${VENDOR_DIR}/` },
          { label: "Workspace", value: cwd }
        ]}
      />
    </Section>
    <Section title="Durable source routes">
      <Table
        columns={[
          { header: "Name", value: (repo: VendoredRepo) => repo.name },
          {
            header: "Type",
            value: (repo: VendoredRepo) => repoTypes[repo.prefix] ?? "unknown"
          },
          { header: "Strategy", value: (repo: VendoredRepo) => repo.strategy },
          { header: "Path", value: (repo: VendoredRepo) => repo.prefix },
          { header: "Ref", value: (repo: VendoredRepo) => repo.ref }
        ]}
        empty="No durable source routes."
        rows={repos}
      />
    </Section>
    <Section title="Agent files">
      <Table columns={surfaceColumns(cwd)} empty="No agent files detected." rows={agentFiles} />
    </Section>
    <Section title="Editor files">
      <Table columns={surfaceColumns(cwd)} empty="No editor files detected." rows={editorFiles} />
    </Section>
    <Section title="Repository files">
      <Table
        columns={surfaceColumns(cwd)}
        empty="No repository hygiene files detected."
        rows={repositoryFiles}
      />
    </Section>
    <Section title="Tool ignores">
      <Table
        columns={[
          { header: "Tool", value: (report: ToolIgnoreReport) => report.tool },
          { header: "Status", value: (report: ToolIgnoreReport) => report.status },
          {
            header: "Config",
            value: (report: ToolIgnoreReport) => renderConfigPath(cwd, report.configPath)
          },
          { header: "Message", value: (report: ToolIgnoreReport) => report.message }
        ]}
        empty="No tool ignore checks were run."
        rows={toolReports}
      />
    </Section>
    <Section title="Fork mode">
      <KeyValues
        entries={[
          { label: "Status", value: forkMode.status },
          { label: "Mode", value: forkMode.mode ?? "unset" },
          { label: "Is fork", value: forkMode.isFork ? "yes" : "no" },
          ...(forkMode.parentNameWithOwner === undefined
            ? []
            : [{ label: "Parent", value: forkMode.parentNameWithOwner }]),
          { label: "Message", value: forkMode.message }
        ]}
      />
    </Section>
  </Box>
)

export const fixDoctor = ({ cwd, repos }: FixDoctorParams) =>
  Effect.gen(function* () {
    const projectFiles = yield* ProjectFiles
    yield* projectFiles.refresh({
      commitMessage: "vendor: repair project vendor files",
      cwd,
      editorSettings: true,
      repos
    })
  })

export const doctorImpl = ({ fix, json }: DoctorCommandParams) =>
  Effect.gen(function* () {
    const cwd = yield* repoRoot
    const initialRepos = yield* listVendored(cwd)
    if (fix) yield* fixDoctor({ cwd, repos: initialRepos })
    const repos = fix ? yield* listVendored(cwd) : initialRepos
    const projectSurfaces = yield* ProjectSurfaces
    const toolIgnores = yield* ToolIgnores
    const surfaces = yield* projectSurfaces.doctor({ cwd, repos })
    const toolReports = yield* toolIgnores.doctor({ cwd })
    const forkMode = yield* computeForkModeReport({ cwd, repos })

    const local = yield* LocalState
    const userOption = yield* local.readUser({ cwd })
    const fallbackUser: UserIdentity = {
      schemaVersion: 1,
      fetchedAt: new Date().toISOString(),
      login: "",
      orgs: []
    }
    const userIdentity = Option.getOrElse(userOption, () => fallbackUser)

    const repoTypes: Record<string, RepoType> = {}
    yield* Effect.forEach(
      repos,
      (repo) =>
        Effect.gen(function* () {
          const ownerMatch = repo.url.match(/github\.com[/:]([^/]+)/)
          const owner = ownerMatch?.[1] ?? null
          const meta =
            owner === null
              ? Option.none<RepoMeta>()
              : yield* local.readRepoMeta({ cwd, ownerName: `${owner}/${repo.name}` })
          repoTypes[repo.prefix] = classifyRepo({ url: repo.url, user: userIdentity, meta })
        }),
      { concurrency: 8, discard: true }
    )

    if (json) {
      yield* Console.log(
        JSON.stringify(
          {
            vendor_dir: VENDOR_DIR,
            repos: repos.map((repo) => ({
              ...repo,
              repoType: repoTypes[repo.prefix] ?? "unknown"
            })),
            agent_files: surfaces.agentFiles,
            editor_files: surfaces.editorFiles,
            repository_files: surfaces.repositoryFiles,
            tool_ignores: toolReports,
            fork_mode: forkMode
          },
          null,
          2
        )
      )
      return
    }

    yield* Effect.tryPromise({
      try: () =>
        renderInkOnce(
          <DoctorView
            cwd={cwd}
            repos={repos}
            repoTypes={repoTypes}
            agentFiles={surfaces.agentFiles}
            editorFiles={surfaces.editorFiles}
            repositoryFiles={surfaces.repositoryFiles}
            toolReports={toolReports}
            forkMode={forkMode}
          />
        ),
      catch: (cause) => new InkRenderFailed({ view: "DoctorView", cause })
    })
  }).pipe(withCommandTelemetry("doctor"))

export const doctorCmd = Command.make(
  "doctor",
  {
    fix: doctorFixOption,
    json: doctorJsonOption
  },
  doctorImpl
).pipe(
  Command.withDescription(
    "Inspect repository context routes and detected formatter, linter, editor, and monorepo tool status."
  )
)
