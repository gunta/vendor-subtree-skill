import { Console, Effect, Option } from "effect"
import { Command, Flag } from "effect/unstable/cli"
import { Box, Text } from "ink"

import { Header, KeyValues, Section, Table } from "../app/ink/components.tsx"
import { renderInkOnce } from "../app/ink/render.tsx"
import { withCommandTelemetry } from "../app/log.tsx"
import { glyphs, palette } from "../app/theme.ts"
import { VENDOR_DIR, VERSION } from "../domain/constants.ts"
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
    const parentNameWithOwner = detected.source === "gh" ? detected.parentNameWithOwner : undefined

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
  readonly version: string
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

type StatusTone = "danger" | "info" | "magenta" | "muted" | "peach" | "rose" | "success" | "warning"

interface CountSegment {
  readonly color: StatusTone
  readonly count: number
  readonly label: string
}

const colorOf = (tone: StatusTone): string => palette[tone]

const statusGlyph = (tone: StatusTone): string => {
  switch (tone) {
    case "danger":
      return glyphs.error
    case "success":
      return glyphs.success
    case "warning":
    case "peach":
      return glyphs.warning
    case "info":
    case "magenta":
    case "rose":
      return glyphs.info
    case "muted":
      return glyphs.bullet
  }
}

const projectSurfaceTone = (status: ProjectSurfaceReport["status"]): StatusTone => {
  switch (status) {
    case "configured":
    case "managed":
      return "success"
    case "invalid":
      return "danger"
    case "present":
      return "warning"
    case "absent":
      return "muted"
  }
}

const toolIgnoreTone = (status: ToolIgnoreReport["status"]): StatusTone => {
  switch (status) {
    case "configured":
      return "success"
    case "missing":
      return "danger"
    case "unsupported":
      return "warning"
    case "visible":
      return "info"
    case "absent":
      return "muted"
  }
}

const projectSurfaceStatusLabel = (status: ProjectSurfaceReport["status"]): string => {
  switch (status) {
    case "configured":
    case "managed":
      return "ready"
    case "invalid":
      return "invalid"
    case "present":
      return "review"
    case "absent":
      return "not found"
  }
}

const projectSurfaceMessage = (report: ProjectSurfaceReport): string =>
  report.status === "absent" ? "-" : report.message

const toolIgnoreStatusLabel = (status: ToolIgnoreReport["status"]): string => {
  switch (status) {
    case "configured":
      return "ready"
    case "missing":
      return "fix"
    case "unsupported":
      return "review"
    case "visible":
      return "visible"
    case "absent":
      return "not found"
  }
}

const toolIgnoreMessage = (report: ToolIgnoreReport): string =>
  report.status === "absent" ? "-" : report.message

const repoTypeTone = (type: RepoType): StatusTone => {
  switch (type) {
    case "own":
      return "success"
    case "fork":
      return "warning"
    case "upstream":
      return "info"
    case "non-github":
      return "peach"
    case "unknown":
      return "muted"
  }
}

const strategyTone = (strategy: VendoredRepo["strategy"]): StatusTone => {
  switch (strategy) {
    case "subtree":
      return "magenta"
    case "submodule":
      return "warning"
    case "clone-ignore":
      return "rose"
    case "cache-link":
      return "info"
  }
}

const forkModeTone = (status: ForkModeReport["status"]): StatusTone => {
  switch (status) {
    case "ok":
      return "success"
    case "warn":
      return "danger"
    case "info":
      return "info"
    case "skipped":
      return "muted"
  }
}

const countBy = <Key extends string>(
  keys: ReadonlyArray<Key>,
  values: ReadonlyArray<Key>
): ReadonlyArray<CountSegment> =>
  keys.map((key) => ({
    color: statusToneForLabel(key),
    count: values.filter((value) => value === key).length,
    label: key
  }))

const statusToneForLabel = (label: string): StatusTone => {
  switch (label) {
    case "configured":
    case "managed":
    case "ok":
    case "own":
      return "success"
    case "missing":
    case "invalid":
    case "warn":
      return "danger"
    case "unsupported":
    case "present":
    case "fork":
    case "submodule":
      return "warning"
    case "visible":
    case "upstream":
    case "cache-link":
      return "info"
    case "subtree":
      return "magenta"
    case "clone-ignore":
      return "rose"
    case "non-github":
      return "peach"
    default:
      return "muted"
  }
}

const compactSegments = (segments: ReadonlyArray<CountSegment>): ReadonlyArray<CountSegment> =>
  segments.filter((segment) => segment.count > 0)

const barCells = (
  segments: ReadonlyArray<CountSegment>,
  width = 20
): ReadonlyArray<CountSegment> => {
  const active = compactSegments(segments)
  const total = active.reduce((sum, segment) => sum + segment.count, 0)
  if (total === 0) return [{ color: "muted", count: width, label: "empty" }]

  let remaining = width
  return active.map((segment, index) => {
    const isLast = index === active.length - 1
    const rawWidth = Math.round((segment.count / total) * width)
    const count = isLast ? remaining : Math.max(1, Math.min(rawWidth, remaining))
    remaining -= count
    return { ...segment, count }
  })
}

const segmentLegend = (segments: ReadonlyArray<CountSegment>): string =>
  compactSegments(segments)
    .map((segment) => `${segment.label} ${segment.count}`)
    .join("  ")

const SegmentedBar = ({ segments }: { readonly segments: ReadonlyArray<CountSegment> }) => (
  <Box flexDirection="row">
    {barCells(segments).map((segment, index) => (
      <Text key={`${segment.label}-${index}`} color={colorOf(segment.color)}>
        {"█".repeat(segment.count)}
      </Text>
    ))}
  </Box>
)

const SignalRow = ({
  label,
  segments,
  tone
}: {
  readonly label: string
  readonly segments: ReadonlyArray<CountSegment>
  readonly tone: StatusTone
}) => (
  <Box flexDirection="row" columnGap={2}>
    <Box width={15}>
      <Text color={colorOf(tone)}>
        {statusGlyph(tone)} {label}
      </Text>
    </Box>
    <SegmentedBar segments={segments} />
    <Text color={palette.muted}>{segmentLegend(segments) || "none"}</Text>
  </Box>
)

const metricTone = (bad: number, mixed: number): StatusTone =>
  bad > 0 ? "danger" : mixed > 0 ? "warning" : "success"

const DoctorOverview = ({
  agentFiles,
  editorFiles,
  forkMode,
  repos,
  repoTypes,
  repositoryFiles,
  toolReports
}: DoctorReportData) => {
  const surfaces = [...agentFiles, ...editorFiles, ...repositoryFiles]
  const invalidSurfaces = surfaces.filter((surface) => surface.status === "invalid").length
  const surfaceSegments = [
    {
      color: "success" as const,
      count: surfaces.filter((surface) => ["configured", "managed"].includes(surface.status))
        .length,
      label: "ready"
    },
    {
      color: invalidSurfaces > 0 ? ("danger" as const) : ("warning" as const),
      count: surfaces.filter((surface) => ["invalid", "present"].includes(surface.status)).length,
      label: "review"
    },
    {
      color: "muted" as const,
      count: surfaces.filter((surface) => surface.status === "absent").length,
      label: "not found"
    }
  ]
  const toolSegments = [
    {
      color: "success" as const,
      count: toolReports.filter((report) => report.status === "configured").length,
      label: "ready"
    },
    {
      color: "info" as const,
      count: toolReports.filter((report) => report.status === "visible").length,
      label: "visible"
    },
    {
      color: toolReports.some((report) => report.status === "missing")
        ? ("danger" as const)
        : ("warning" as const),
      count: toolReports.filter((report) => ["missing", "unsupported"].includes(report.status))
        .length,
      label: "fix"
    },
    {
      color: "muted" as const,
      count: toolReports.filter((report) => report.status === "absent").length,
      label: "not found"
    }
  ]
  const repoTypeSegments = countBy(
    ["own", "fork", "upstream", "unknown", "non-github"] as const,
    repos.map((repo) => repoTypes[repo.prefix] ?? "unknown")
  )
  const strategySegments = countBy(
    ["subtree", "submodule", "clone-ignore", "cache-link"] as const,
    repos.map((repo) => repo.strategy)
  )
  const surfaceTone = metricTone(
    surfaces.filter((surface) => projectSurfaceTone(surface.status) === "danger").length,
    surfaces.filter((surface) => projectSurfaceTone(surface.status) === "warning").length
  )
  const toolTone = metricTone(
    toolReports.filter((report) => toolIgnoreTone(report.status) === "danger").length,
    toolReports.filter((report) => toolIgnoreTone(report.status) === "warning").length
  )
  const routeTone = repos.length === 0 ? "muted" : "success"
  const forkTone = forkModeTone(forkMode.status)

  return (
    <Section title="Signal map">
      <Box flexDirection="column">
        <SignalRow label="Routes" segments={strategySegments} tone={routeTone} />
        <SignalRow label="Ownership" segments={repoTypeSegments} tone={routeTone} />
        <SignalRow label="Project files" segments={surfaceSegments} tone={surfaceTone} />
        <SignalRow label="Tool ignores" segments={toolSegments} tone={toolTone} />
        <SignalRow
          label="Fork mode"
          segments={[{ color: forkTone, count: 1, label: forkMode.status }]}
          tone={forkTone}
        />
      </Box>
    </Section>
  )
}

const surfaceColumns = (cwd: string) => [
  { header: "Name", value: (report: ProjectSurfaceReport) => report.name },
  {
    color: (report: ProjectSurfaceReport) => colorOf(projectSurfaceTone(report.status)),
    header: "Status",
    minWidth: 9,
    value: (report: ProjectSurfaceReport) => projectSurfaceStatusLabel(report.status)
  },
  {
    header: "Path",
    maxWidth: 28,
    value: (report: ProjectSurfaceReport) => renderConfigPath(cwd, report.path)
  },
  { header: "Message", value: (report: ProjectSurfaceReport) => projectSurfaceMessage(report) }
]

const DoctorView = ({
  agentFiles,
  cwd,
  editorFiles,
  forkMode,
  repos,
  repoTypes,
  repositoryFiles,
  toolReports,
  version
}: DoctorReportData) => (
  <Box flexDirection="column">
    <Header title="ingraft" subtitle="doctor" />
    <Section title="Workspace">
      <KeyValues
        entries={[
          { label: "CLI version", value: `v${version}` },
          { label: "Vendor directory", value: `${VENDOR_DIR}/` },
          { label: "Workspace", value: cwd }
        ]}
      />
    </Section>
    <DoctorOverview
      agentFiles={agentFiles}
      cwd={cwd}
      editorFiles={editorFiles}
      forkMode={forkMode}
      repos={repos}
      repoTypes={repoTypes}
      repositoryFiles={repositoryFiles}
      toolReports={toolReports}
      version={version}
    />
    <Section title="Durable source routes">
      <Table
        columns={[
          { header: "Name", value: (repo: VendoredRepo) => repo.name },
          {
            color: (repo: VendoredRepo) =>
              colorOf(repoTypeTone(repoTypes[repo.prefix] ?? "unknown")),
            header: "Type",
            value: (repo: VendoredRepo) => repoTypes[repo.prefix] ?? "unknown"
          },
          {
            color: (repo: VendoredRepo) => colorOf(strategyTone(repo.strategy)),
            header: "Strategy",
            value: (repo: VendoredRepo) => repo.strategy
          },
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
          {
            color: (report: ToolIgnoreReport) => colorOf(toolIgnoreTone(report.status)),
            header: "Status",
            minWidth: 9,
            value: (report: ToolIgnoreReport) => toolIgnoreStatusLabel(report.status)
          },
          {
            header: "Config",
            maxWidth: 22,
            value: (report: ToolIgnoreReport) => renderConfigPath(cwd, report.configPath)
          },
          { header: "Message", value: (report: ToolIgnoreReport) => toolIgnoreMessage(report) }
        ]}
        empty="No tool ignore checks were run."
        rows={toolReports}
      />
    </Section>
    <Section title="Fork mode">
      <KeyValues
        entries={[
          {
            label: "Status",
            value: `${statusGlyph(forkModeTone(forkMode.status))} ${forkMode.status}`
          },
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
            version: VERSION,
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
            version={VERSION}
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
