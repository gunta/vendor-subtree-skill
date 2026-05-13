import { Console, Effect, FileSystem, Option, Path, Stream, pipe } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"

import { RuntimeConfig } from "../app/runtime.ts"
import { packageJsonHasDependency } from "../config/package-json.ts"
import { VENDOR_DIR } from "../domain/constants.ts"

export type ContextToolId = "repomix" | "opensrc" | "repobase"

export type ContextToolStatus = "absent" | "configured" | "installed"

export interface ContextToolReport {
  readonly id: ContextToolId
  readonly name: string
  readonly detected: boolean
  readonly status: ContextToolStatus
  readonly purpose: string
  readonly command: string
  readonly evidence: ReadonlyArray<string>
}

export interface DetectContextToolsFromProjectParams {
  readonly files: ReadonlyArray<string>
  readonly packageJson?: string
}

export interface DetectContextToolsParams {
  readonly cwd: string
}

export interface ContextCommandPlan {
  readonly command: string
  readonly args: ReadonlyArray<string>
  readonly label: string
}

export interface ContextPackPlanParams {
  readonly compress: boolean
  readonly paths: ReadonlyArray<string>
}

export interface ContextSourcePlanParams {
  readonly target: string
}

export interface RunContextCommandPlanParams {
  readonly cwd: string
  readonly plan: ContextCommandPlan
}

interface ContextToolDefinition {
  readonly id: ContextToolId
  readonly name: string
  readonly packageNames: ReadonlyArray<string>
  readonly configFiles: ReadonlyArray<string>
  readonly purpose: string
  readonly command: string
}

const contextToolDefinitions = [
  {
    id: "repomix",
    name: "Repomix",
    packageNames: ["repomix"],
    configFiles: [
      ".repomixignore",
      "repomix.config.json",
      "repomix.config.jsonc",
      "repomix.config.js",
      "repomix.config.mjs",
      "repomix.config.ts"
    ],
    purpose: "Package vendored source or the workspace into an AI-readable snapshot.",
    command: "ingraft context pack"
  },
  {
    id: "opensrc",
    name: "OpenSrc",
    packageNames: ["opensrc"],
    configFiles: [],
    purpose: "Fetch long-tail dependency source into a local cache and print its path.",
    command: "ingraft context source <package>"
  },
  {
    id: "repobase",
    name: "Repobase",
    packageNames: ["repobase"],
    configFiles: [".repobase", "repobase.config.json", "repobase.config.ts"],
    purpose: "Expose local semantic repository search to MCP-capable agents.",
    command: "repobase"
  }
] as const satisfies ReadonlyArray<ContextToolDefinition>

const normalizePath = (value: string): string => value.trim().replaceAll("\\", "/")

const packageEvidence = (packageJson: string | undefined, packageNames: ReadonlyArray<string>) =>
  packageJson === undefined || !packageJsonHasDependency(packageJson, packageNames)
    ? []
    : [`package.json: ${packageNames.join(" / ")}`]

const configEvidence = (files: ReadonlySet<string>, configFiles: ReadonlyArray<string>) =>
  configFiles.filter((file) => files.has(file))

const reportForDefinition = (
  definition: ContextToolDefinition,
  params: DetectContextToolsFromProjectParams
): ContextToolReport => {
  const files = new Set(params.files.map(normalizePath))
  const configs = configEvidence(files, definition.configFiles)
  const packages = packageEvidence(params.packageJson, definition.packageNames)
  const evidence = [...configs, ...packages]
  const status: ContextToolStatus =
    configs.length > 0 ? "configured" : packages.length > 0 ? "installed" : "absent"

  return {
    id: definition.id,
    name: definition.name,
    detected: status !== "absent",
    status,
    purpose: definition.purpose,
    command: definition.command,
    evidence
  }
}

export const detectContextToolsFromProject = (
  params: DetectContextToolsFromProjectParams
): ReadonlyArray<ContextToolReport> =>
  contextToolDefinitions.map((definition) => reportForDefinition(definition, params))

const knownProjectFiles = [
  "package.json",
  ".repomixignore",
  "repomix.config.json",
  "repomix.config.jsonc",
  "repomix.config.js",
  "repomix.config.mjs",
  "repomix.config.ts",
  ".repobase",
  "repobase.config.json",
  "repobase.config.ts"
] as const

export const detectContextTools = ({ cwd }: DetectContextToolsParams) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const files = yield* Effect.filter(knownProjectFiles, (file) =>
      fs.exists(path.resolve(cwd, file))
    )
    const packageJsonPath = path.resolve(cwd, "package.json")
    const packageJson = yield* fs.exists(packageJsonPath).pipe(
      Effect.flatMap((exists) =>
        exists
          ? fs.readFileString(packageJsonPath).pipe(Effect.map(Option.some))
          : Effect.succeed(Option.none<string>())
      ),
      Effect.catch(() => Effect.succeed(Option.none<string>()))
    )
    return detectContextToolsFromProject({
      files,
      ...(Option.isSome(packageJson) ? { packageJson: packageJson.value } : {})
    })
  })

export const contextPackPlan = ({
  compress,
  paths
}: ContextPackPlanParams): ContextCommandPlan => ({
  command: "npx",
  args: [
    "-y",
    "repomix@latest",
    ...(paths.length === 0 ? [VENDOR_DIR] : paths),
    ...(compress ? ["--compress"] : [])
  ],
  label: "Repomix pack"
})

export const contextSourcePlan = ({ target }: ContextSourcePlanParams): ContextCommandPlan => ({
  command: "npx",
  args: ["-y", "opensrc@latest", "path", target],
  label: "OpenSrc path"
})

const collect = <E, R>(stream: Stream.Stream<Uint8Array, E, R>) =>
  stream.pipe(
    Stream.decodeText,
    Stream.runFold(
      () => "",
      (a, b) => a + b
    )
  )

const shellQuote = (value: string): string =>
  /^[A-Za-z0-9_./:@+-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`

export const formatContextCommandPlan = (plan: ContextCommandPlan): string =>
  [plan.command, ...plan.args].map(shellQuote).join(" ")

export const runContextCommandPlan = ({ cwd, plan }: RunContextCommandPlanParams) =>
  Effect.gen(function* () {
    const executor = yield* ChildProcessSpawner.ChildProcessSpawner
    const runtime = yield* RuntimeConfig
    const command = ChildProcess.setCwd(ChildProcess.make(plan.command, plan.args), cwd)
    const proc = yield* executor.spawn(command)
    const [exitCode, stdout, stderr] = yield* Effect.all(
      [proc.exitCode, collect(proc.stdout), collect(proc.stderr)],
      { concurrency: 3 }
    )
    if (stdout.trim().length > 0) yield* Console.log(stdout.trimEnd())
    if (stderr.trim().length > 0) yield* Console.error(stderr.trimEnd())
    if (Number(exitCode) !== 0) yield* runtime.exit(Number(exitCode))
  })
