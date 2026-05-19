import { Effect } from "effect"

import { FALLBACK_SCRIPT_REL } from "../domain/constants.ts"

export interface ScriptInvocationParams {
  readonly cwd: string
  readonly argv: ReadonlyArray<string>
}

const scriptRelToSync = ({ cwd, argv }: ScriptInvocationParams): string => {
  const raw = argv[1]
  if (!raw) return FALLBACK_SCRIPT_REL
  const root = cwd.endsWith("/") ? cwd : `${cwd}/`
  if (raw.startsWith(root)) return raw.slice(root.length)
  return FALLBACK_SCRIPT_REL
}

export const scriptRelTo = (params: ScriptInvocationParams): Effect.Effect<string> =>
  Effect.sync(() => scriptRelToSync(params))

export const bunInvocation = (params: ScriptInvocationParams): Effect.Effect<string> =>
  Effect.sync(() => `bun ${scriptRelToSync(params)}`)

export const commandInvocation = (params: ScriptInvocationParams): Effect.Effect<string> =>
  Effect.sync(() => {
    const raw = params.argv[1]
    const root = params.cwd.endsWith("/") ? params.cwd : `${params.cwd}/`
    return raw && raw.startsWith(root)
      ? `bun ${scriptRelToSync(params)}`
      : "bunx @ingraft/cli@latest"
  })
