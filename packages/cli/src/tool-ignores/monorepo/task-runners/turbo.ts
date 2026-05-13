import { Effect, Option } from "effect"

import {
  absentReport,
  completeMerge,
  ensureArrayItemsAtPath,
  firstExistingFile,
  initialSettingsState,
  isRecord,
  jsoncConfigReport,
  packageHasDependency,
  parseSettings,
  SettingsMergeResult,
  unsupportedReport,
  writeMerged,
  type MonorepoToolDefinition,
  type ToolFileContext
} from "../common.ts"

const CATEGORY = "monorepo-task-runners"
const TOOL = "Turborepo"
const VENDOR_INPUT = "!$TURBO_ROOT$/vendor/**"
const CONFIGS = ["turbo.json", "turbo.jsonc"] as const

export const mergeTurboConfigText = (text = "{}\n"): SettingsMergeResult => {
  const parsed = parseSettings({ objectName: "turbo.json", text })
  if (parsed._tag === "Invalid")
    return SettingsMergeResult.Invalid({ message: parsed.message })
  const tasks = parsed.value.tasks
  if (!isRecord(tasks)) return SettingsMergeResult.Unchanged()

  const state = Object.entries(tasks).reduce(
    (current, [taskName, task]) => {
      if (!isRecord(task)) return current
      const fallback = Array.isArray(task.inputs) ? [] : ["$TURBO_DEFAULT$"]
      return ensureArrayItemsAtPath({
        fallback,
        items: [VENDOR_INPUT],
        path: ["tasks", taskName, "inputs"],
        state: current
      })
    },
    initialSettingsState(parsed.source, parsed.value)
  )

  return completeMerge(state)
}

const turboConfig = (context: ToolFileContext, cwd: string) =>
  firstExistingFile(context, cwd, CONFIGS)

const doctorTurbo = (context: ToolFileContext, cwd: string) =>
  Effect.gen(function* () {
    const config = yield* turboConfig(context, cwd)
    const dependency = yield* packageHasDependency(context, cwd, ["turbo"])
    if (Option.isNone(config) && !dependency) return absentReport(TOOL)
    if (Option.isNone(config)) {
      return unsupportedReport({
        message: "detected in package.json but no turbo.json/turbo.jsonc found",
        tool: TOOL
      })
    }
    return jsoncConfigReport({
      config: config.value,
      ignored: config.value.content.includes(VENDOR_INPUT),
      missingMessage: "vendor not excluded from task inputs",
      tool: TOOL
    })
  })

const refreshTurbo = (context: ToolFileContext, cwd: string) =>
  turboConfig(context, cwd).pipe(
    Effect.flatMap((config) =>
      Option.match(config, {
        onNone: () => Effect.succeed(Option.none<string>()),
        onSome: (value) =>
          writeMerged(context, value.absolutePath, mergeTurboConfigText(value.content))
      })
    )
  )

export const turboTool: MonorepoToolDefinition = {
  category: CATEGORY,
  doctor: doctorTurbo,
  name: TOOL,
  refresh: refreshTurbo
}
