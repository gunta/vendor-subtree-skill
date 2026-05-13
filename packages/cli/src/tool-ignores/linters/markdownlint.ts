import { Context, Effect, FileSystem, Layer, Option, Path } from "effect"

import { packageJsonDependencySpec } from "../../config/package-json.ts"
import {
  VENDOR_IGNORE_DIR,
  firstExisting,
  hasVendorPattern,
  mergeManagedIgnoreSection,
  report,
  type ToolFileContext,
  type ToolIgnoreIntegration
} from "../common.ts"

const TOOL = "markdownlint"
const BEGIN = "# ingraft: markdownlint-ignore begin"
const END = "# ingraft: markdownlint-ignore end"
const IGNORE_FILE = ".markdownlintignore"
const CONFIG_CANDIDATES = [
  ".markdownlint.json",
  ".markdownlint.jsonc",
  ".markdownlint.yaml",
  ".markdownlint.yml",
  ".markdownlintrc"
] as const
const CLI2_CONFIG_CANDIDATES = [
  ".markdownlint-cli2.jsonc",
  ".markdownlint-cli2.yaml",
  ".markdownlint-cli2.yml"
] as const

export const mergeMarkdownlintIgnoreText = (content: string): string =>
  mergeManagedIgnoreSection({
    begin: BEGIN,
    content,
    end: END,
    lines: [VENDOR_IGNORE_DIR]
  })

const dependencySpec = ({ fs, path }: ToolFileContext, cwd: string, packageName: string) =>
  Effect.gen(function* () {
    const target = path.resolve(cwd, "package.json")
    if (!(yield* fs.exists(target))) return Option.none<string>()
    return yield* packageJsonDependencySpec(yield* fs.readFileString(target), packageName).pipe(
      Effect.orElseSucceed(() => Option.none<string>())
    )
  })

const hasDependency = (context: ToolFileContext, cwd: string, packageName: string) =>
  dependencySpec(context, cwd, packageName).pipe(Effect.map(Option.isSome))

const configPath = (context: ToolFileContext, cwd: string) =>
  firstExisting(context, cwd, CONFIG_CANDIDATES)

const cli2ConfigPath = (context: ToolFileContext, cwd: string) =>
  firstExisting(context, cwd, CLI2_CONFIG_CANDIDATES)

const ignorePath = (context: ToolFileContext, cwd: string) => context.path.resolve(cwd, IGNORE_FILE)

const isCli2Only = (context: ToolFileContext, cwd: string) =>
  Effect.gen(function* () {
    const [cli, cli2, generic, cli2Config] = yield* Effect.all([
      hasDependency(context, cwd, "markdownlint-cli"),
      hasDependency(context, cwd, "markdownlint-cli2"),
      hasDependency(context, cwd, "markdownlint"),
      cli2ConfigPath(context, cwd)
    ])
    return !cli && !generic && (cli2 || Option.isSome(cli2Config))
  })

const isDetected = (context: ToolFileContext, cwd: string) =>
  Effect.gen(function* () {
    const [config, cli2Config, hasIgnore, cli, cli2, generic] = yield* Effect.all([
      configPath(context, cwd),
      cli2ConfigPath(context, cwd),
      context.fs.exists(ignorePath(context, cwd)),
      hasDependency(context, cwd, "markdownlint-cli"),
      hasDependency(context, cwd, "markdownlint-cli2"),
      hasDependency(context, cwd, "markdownlint")
    ])
    return Option.isSome(config) || Option.isSome(cli2Config) || hasIgnore || cli || cli2 || generic
  })

const refreshWith = (context: ToolFileContext, cwd: string) =>
  Effect.gen(function* () {
    if (!(yield* isDetected(context, cwd))) return Option.none<string>()
    if (yield* isCli2Only(context, cwd)) return Option.none<string>()

    const target = ignorePath(context, cwd)
    const current = (yield* context.fs.exists(target))
      ? yield* context.fs.readFileString(target)
      : ""
    const next = mergeMarkdownlintIgnoreText(current)
    if (next === current) return Option.none<string>()
    yield* context.fs.writeFileString(target, next)
    return Option.some(target)
  })

const doctorWith = (context: ToolFileContext, cwd: string) =>
  Effect.gen(function* () {
    if (!(yield* isDetected(context, cwd))) {
      return report({
        detected: false,
        ignored: false,
        message: "not detected",
        status: "absent",
        tool: TOOL
      })
    }

    const target = ignorePath(context, cwd)
    if (yield* context.fs.exists(target)) {
      const content = yield* context.fs.readFileString(target)
      const ignored = hasVendorPattern(content)
      return report({
        configPath: target,
        detected: true,
        ignored,
        message: ignored
          ? "vendor ignored by .markdownlintignore"
          : "vendor not ignored by .markdownlintignore",
        status: ignored ? "configured" : "missing",
        tool: TOOL
      })
    }

    const cli2Config = yield* cli2ConfigPath(context, cwd)
    if (yield* isCli2Only(context, cwd)) {
      return report({
        ...(Option.isSome(cli2Config) ? { configPath: cli2Config.value } : {}),
        detected: true,
        ignored: false,
        message: "markdownlint-cli2 detected; .markdownlintignore is not supported",
        status: "unsupported",
        tool: TOOL
      })
    }

    const config = yield* configPath(context, cwd)
    return report({
      ...(Option.isSome(config) ? { configPath: config.value } : {}),
      detected: true,
      ignored: false,
      message: "vendor not ignored",
      status: "missing",
      tool: TOOL
    })
  })

export class MarkdownlintIgnore extends Context.Service<
  MarkdownlintIgnore,
  ToolIgnoreIntegration
>()("ingraft/MarkdownlintIgnore") {}

export const MarkdownlintIgnoreLive = Layer.effect(
  MarkdownlintIgnore,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const context = { fs, path }
    return {
      doctor: (cwd: string) => doctorWith(context, cwd),
      refresh: (cwd: string) => refreshWith(context, cwd)
    }
  })
)
