import { Context, Effect, FileSystem, Layer, Option, Path } from "effect"

import { tomlPathHasAnyArrayValue } from "../../config/toml.ts"
import {
  VENDOR_DIR,
  firstExisting,
  report,
  type ToolFileContext,
  type ToolIgnoreIntegration
} from "../common.ts"

const TOOL = "Cargo/Rust"
const VENDOR_PATTERNS = [VENDOR_DIR, "vendor/*"] as const

const cargoManifestIgnoresVendor = (content: string): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const workspace = yield* tomlPathHasAnyArrayValue(
      content,
      ["workspace", "exclude"],
      VENDOR_PATTERNS
    ).pipe(Effect.orElseSucceed(() => false))
    if (workspace) return true
    return yield* tomlPathHasAnyArrayValue(content, ["package", "exclude"], VENDOR_PATTERNS).pipe(
      Effect.orElseSucceed(() => false)
    )
  })

const doctorWith = (context: ToolFileContext, cwd: string) =>
  Effect.gen(function* () {
    const config = yield* firstExisting(context, cwd, ["Cargo.toml"])
    if (Option.isNone(config)) {
      return report({
        detected: false,
        ignored: false,
        message: "not detected",
        status: "absent",
        tool: TOOL
      })
    }

    const content = yield* context.fs.readFileString(config.value)
    const ignored = yield* cargoManifestIgnoresVendor(content)
    return report({
      configPath: config.value,
      detected: true,
      ignored,
      message: ignored
        ? "vendor appears in Cargo manifest"
        : "detected; no generated Cargo workspace edit is applied",
      status: ignored ? "configured" : "visible",
      tool: TOOL
    })
  })

export class CargoIgnore extends Context.Service<CargoIgnore, ToolIgnoreIntegration>()(
  "ingraft/CargoIgnore"
) {}

export const CargoIgnoreLive = Layer.effect(
  CargoIgnore,
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
