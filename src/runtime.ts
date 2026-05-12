import { Effect } from "effect"

export type RuntimeExit = (code: number) => Effect.Effect<never>

export interface RuntimeConfigShape {
  readonly argv: ReadonlyArray<string>
  readonly colors: boolean
  readonly cwd: string
  readonly exit: RuntimeExit
}

const shouldUseColor = (): boolean => {
  if (process.env.NO_COLOR) return false
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== "0") return true
  return Boolean(process.stdout.isTTY) && process.env.TERM !== "dumb"
}

const liveRuntimeConfig = (): RuntimeConfigShape => ({
  argv: [...process.argv],
  colors: shouldUseColor(),
  cwd: process.cwd(),
  exit: (code) => Effect.sync((): never => process.exit(code))
})

export class RuntimeConfig extends Effect.Service<RuntimeConfig>()(
  "vendor-subtree/RuntimeConfig",
  {
    accessors: true,
    sync: liveRuntimeConfig
  }
) {}
