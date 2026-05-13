import { Context, Effect, FileSystem, Layer, Option, Path } from "effect"

import { parseSettings } from "../../config/jsonc-settings.ts"
import {
  firstExisting,
  packageHasDependency,
  report,
  type ToolFileContext,
  type ToolIgnoreIntegration
} from "../common.ts"

const TOOL = "TypeScript"
const CONFIG_CANDIDATES = ["tsconfig.json", "jsconfig.json"] as const

const doctorWith = (context: ToolFileContext, cwd: string) =>
  Effect.gen(function* () {
    const config = yield* firstExisting(context, cwd, CONFIG_CANDIDATES)
    const dependency = yield* packageHasDependency(context, cwd, ["typescript"])
    if (Option.isNone(config) && !dependency) {
      return report({
        detected: false,
        ignored: false,
        message: "not detected",
        status: "absent",
        tool: TOOL
      })
    }

    const configPath = Option.getOrUndefined(config)
    const configStatus =
      configPath === undefined
        ? Option.none<string>()
        : yield* context.fs.readFileString(configPath).pipe(
            Effect.map((content) => {
              const parsed = parseSettings({
                objectName: configPath.endsWith("jsconfig.json")
                  ? "jsconfig.json"
                  : "tsconfig.json",
                text: content
              })
              return parsed._tag === "Invalid"
                ? Option.some(`invalid config: ${parsed.message}`)
                : Option.none<string>()
            }),
            Effect.catch(() => Effect.succeed(Option.some("unreadable config")))
          )
    return report({
      ...(configPath === undefined ? {} : { configPath }),
      detected: true,
      ignored: false,
      message: Option.match(configStatus, {
        onNone: () =>
          "vendor left visible for tsserver/LSP; formatter and linter ignores handle noise",
        onSome: (message) => message
      }),
      status: Option.isSome(configStatus) ? "unsupported" : "visible",
      tool: TOOL
    })
  })

export class TypeScriptIgnore extends Context.Service<TypeScriptIgnore, ToolIgnoreIntegration>()(
  "ingraft/TypeScriptIgnore"
) {}

export const TypeScriptIgnoreLive = Layer.effect(
  TypeScriptIgnore,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const context = { fs, path }
    return {
      doctor: (cwd: string) => doctorWith(context, cwd),
      refresh: (_cwd: string) => Effect.succeed(Option.none<string>())
    }
  })
)
