import { Config, Context, Effect, Layer, Option } from "effect"

export type RuntimeExit = (code: number) => Effect.Effect<never>

export interface RuntimeConfigShape {
  readonly argv: ReadonlyArray<string>
  readonly colors: boolean
  readonly cwd: string
  readonly exit: RuntimeExit
}

const colorEnv = Config.all({
  noColor: Config.option(Config.string("NO_COLOR")),
  forceColor: Config.option(Config.string("FORCE_COLOR")),
  term: Config.option(Config.string("TERM"))
})

interface ColorEnv {
  readonly noColor: Option.Option<string>
  readonly forceColor: Option.Option<string>
  readonly term: Option.Option<string>
}

const resolveColors = (env: ColorEnv): boolean => {
  if (Option.isSome(env.noColor)) return false
  if (Option.isSome(env.forceColor) && env.forceColor.value !== "0") return true
  const term = Option.getOrUndefined(env.term)
  return Boolean(process.stdout.isTTY) && term !== "dumb"
}

const liveRuntimeConfig = Effect.gen(function* () {
  const env = yield* colorEnv.pipe(Effect.orDie)
  return {
    argv: [...process.argv],
    colors: resolveColors(env),
    cwd: process.cwd(),
    exit: (code: number) => Effect.sync((): never => process.exit(code))
  } satisfies RuntimeConfigShape
})

export class RuntimeConfig extends Context.Service<RuntimeConfig, RuntimeConfigShape>()(
  "ingraft/RuntimeConfig"
) {}

export const RuntimeConfigLive = Layer.effect(RuntimeConfig, liveRuntimeConfig)
