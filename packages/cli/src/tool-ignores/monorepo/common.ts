import { Effect, Option } from "effect"
import { isScalar, isSeq, parseDocument } from "yaml"

import {
  completeMerge,
  ensureArrayItemsAtPath,
  initialSettingsState,
  isRecord,
  parseSettings,
  SettingsMergeResult
} from "../../config/jsonc-settings.ts"
import {
  firstExisting,
  hasVendorPattern,
  report,
  type ToolFileContext,
  type ToolIgnoreReport
} from "../common.ts"

export {
  completeMerge,
  ensureArrayItemsAtPath,
  firstExisting,
  initialSettingsState,
  isRecord,
  parseSettings,
  report,
  SettingsMergeResult,
  type ToolFileContext,
  type ToolIgnoreReport
}
export {
  VENDOR_DIR,
  VENDOR_GLOB,
  hasVendorPattern,
  mergeManagedIgnoreSection,
  packageHasDependency
} from "../common.ts"

export interface OptionalFile {
  readonly absolutePath: string
  readonly content: string
}

export interface MonorepoToolDefinition {
  readonly category: string
  readonly doctor: (
    context: ToolFileContext,
    cwd: string
  ) => Effect.Effect<ToolIgnoreReport, unknown>
  readonly name: string
  readonly refresh?: (
    context: ToolFileContext,
    cwd: string
  ) => Effect.Effect<Option.Option<string>, unknown>
}

export interface MonorepoToolCategory {
  readonly name: string
  readonly tools: ReadonlyArray<MonorepoToolDefinition>
}

export const optionalFile = (context: ToolFileContext, cwd: string, relativePath: string) =>
  Effect.gen(function* () {
    const absolutePath = context.path.resolve(cwd, relativePath)
    if (!(yield* context.fs.exists(absolutePath))) {
      return Option.none<OptionalFile>()
    }
    const content = yield* context.fs
      .readFileString(absolutePath)
      .pipe(Effect.orElseSucceed(() => ""))
    return Option.some({ absolutePath, content })
  })

export const firstExistingFile = (
  context: ToolFileContext,
  cwd: string,
  candidates: ReadonlyArray<string>
) =>
  firstExisting(context, cwd, candidates).pipe(
    Effect.flatMap((target) =>
      Option.match(target, {
        onNone: () => Effect.succeed(Option.none<OptionalFile>()),
        onSome: (absolutePath) =>
          context.fs
            .readFileString(absolutePath)
            .pipe(Effect.map((content) => Option.some({ absolutePath, content })))
      })
    )
  )

export const writeMerged = (
  context: ToolFileContext,
  absolutePath: string,
  merged: SettingsMergeResult
) =>
  Effect.gen(function* () {
    if (merged._tag !== "Updated") return Option.none<string>()
    yield* context.fs.writeFileString(
      absolutePath,
      merged.text.endsWith("\n") ? merged.text : `${merged.text}\n`
    )
    return Option.some(absolutePath)
  })

export const rootPackageJson = (context: ToolFileContext, cwd: string) =>
  optionalFile(context, cwd, "package.json").pipe(
    Effect.map((file) =>
      Option.flatMap(file, ({ content }) => {
        const parsed = parseSettings({
          objectName: "package.json",
          text: content
        })
        return parsed._tag === "Valid"
          ? Option.some(parsed.value)
          : Option.none<Record<string, unknown>>()
      })
    )
  )

export const rootPackageHasWorkspaces = (context: ToolFileContext, cwd: string) =>
  rootPackageJson(context, cwd).pipe(
    Effect.map((pkg) =>
      Option.match(pkg, {
        onNone: () => false,
        onSome: (value) => {
          const workspaces = value.workspaces
          return (
            Array.isArray(workspaces) ||
            (isRecord(workspaces) && Array.isArray(workspaces.packages))
          )
        }
      })
    )
  )

export const packageManagerName = (context: ToolFileContext, cwd: string) =>
  rootPackageJson(context, cwd).pipe(
    Effect.map((pkg) =>
      Option.flatMap(pkg, (value) =>
        typeof value.packageManager === "string"
          ? Option.some(value.packageManager.split("@")[0] ?? value.packageManager)
          : Option.none<string>()
      )
    )
  )

const packageWorkspacePatterns = (value: Record<string, unknown>): ReadonlyArray<string> => {
  const workspaces = value.workspaces
  if (Array.isArray(workspaces)) {
    return workspaces.filter((item): item is string => typeof item === "string")
  }
  if (isRecord(workspaces) && Array.isArray(workspaces.packages)) {
    return workspaces.packages.filter((item): item is string => typeof item === "string")
  }
  return []
}

export const packageWorkspacesIgnoreVendor = (
  context: ToolFileContext,
  cwd: string,
  vendorExclude: string
) =>
  rootPackageJson(context, cwd).pipe(
    Effect.map((pkg) =>
      Option.match(pkg, {
        onNone: () => false,
        onSome: (value) =>
          packageWorkspacePatterns(value).some((pattern) => pattern.includes(vendorExclude))
      })
    )
  )

const yamlScalarValue = (value: unknown): unknown => (isScalar(value) ? value.value : value)

const yamlStringArrayAtPath = (
  text: string,
  path: ReadonlyArray<string>
): Option.Option<ReadonlyArray<string>> =>
  Option.liftThrowable((source: string) => {
    const document = parseDocument(source.trim() === "" ? "{}\n" : source)
    if (document.errors.length > 0) return undefined
    const value = document.getIn(path, true)
    if (!isSeq(value)) return undefined
    return value.items
      .map(yamlScalarValue)
      .filter((item): item is string => typeof item === "string")
  })(text).pipe(
    Option.flatMap((value) =>
      Array.isArray(value)
        ? Option.some(value as ReadonlyArray<string>)
        : Option.none<ReadonlyArray<string>>()
    )
  )

export const yamlPathHasAnyArrayValue = (
  text: string,
  path: ReadonlyArray<string>,
  expected: ReadonlyArray<string>
): boolean =>
  Option.match(yamlStringArrayAtPath(text, path), {
    onNone: () => false,
    onSome: (values) => expected.some((value) => values.includes(value))
  })

export const mergeYamlArrayItemsAtPath = ({
  fallback = [],
  items,
  path,
  requireExistingArray = false,
  text
}: {
  readonly fallback?: ReadonlyArray<string>
  readonly items: ReadonlyArray<string>
  readonly path: ReadonlyArray<string>
  readonly requireExistingArray?: boolean
  readonly text: string
}): SettingsMergeResult => {
  const source = text.trim() === "" ? "{}\n" : text
  const document = parseDocument(source)
  if (document.errors.length > 0) {
    return SettingsMergeResult.Invalid({
      message: document.errors.map((error) => error.message).join(", ")
    })
  }
  const current = document.getIn(path, true)
  if (current === undefined || current === null) {
    if (requireExistingArray) return SettingsMergeResult.Unchanged()
    document.setIn(path, [...fallback, ...items])
    return SettingsMergeResult.Updated({ text: document.toString() })
  }
  if (!isSeq(current)) return SettingsMergeResult.Unchanged()

  const existing = current.items
    .map(yamlScalarValue)
    .filter((item): item is string => typeof item === "string")
  const missing = items.filter((item) => !existing.includes(item))
  if (missing.length === 0) return SettingsMergeResult.Unchanged()
  for (const item of missing) current.add(item)
  return SettingsMergeResult.Updated({ text: document.toString() })
}

export const jsoncConfigReport = ({
  config,
  ignored,
  missingMessage,
  tool
}: {
  readonly config: OptionalFile
  readonly ignored: boolean
  readonly missingMessage: string
  readonly tool: string
}): ToolIgnoreReport =>
  report({
    configPath: config.absolutePath,
    detected: true,
    ignored,
    message: ignored ? "vendor excluded from task hashing" : missingMessage,
    status: ignored ? "configured" : "missing",
    tool
  })

export const absentReport = (tool: string): ToolIgnoreReport =>
  report({
    detected: false,
    ignored: false,
    message: "not detected",
    status: "absent",
    tool
  })

export const unsupportedReport = ({
  configPath,
  detected = true,
  message,
  tool
}: {
  readonly configPath?: string
  readonly detected?: boolean
  readonly message: string
  readonly tool: string
}): ToolIgnoreReport =>
  report({
    ...(configPath === undefined ? {} : { configPath }),
    detected,
    ignored: false,
    message,
    status: "unsupported",
    tool
  })

export const configuredOrVisibleReport = ({
  configPath,
  ignored,
  message,
  tool
}: {
  readonly configPath: string
  readonly ignored: boolean
  readonly message: string
  readonly tool: string
}): ToolIgnoreReport =>
  report({
    configPath,
    detected: true,
    ignored,
    message,
    status: ignored ? "configured" : "visible",
    tool
  })

export const doctorSimpleConfig = ({
  configuredMessage,
  context,
  cwd,
  paths,
  tool,
  visibleMessage
}: {
  readonly configuredMessage: string
  readonly context: ToolFileContext
  readonly cwd: string
  readonly paths: ReadonlyArray<string>
  readonly tool: string
  readonly visibleMessage: string
}) =>
  Effect.gen(function* () {
    const config = yield* firstExisting(context, cwd, paths)
    if (Option.isNone(config)) return absentReport(tool)
    const content = yield* context.fs
      .readFileString(config.value)
      .pipe(Effect.orElseSucceed(() => ""))
    const ignored = hasVendorPattern(content)
    return configuredOrVisibleReport({
      configPath: config.value,
      ignored,
      message: ignored ? configuredMessage : visibleMessage,
      tool
    })
  })
