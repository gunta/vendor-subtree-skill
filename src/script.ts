import { FALLBACK_SCRIPT_REL } from "./constants.ts"

export interface ScriptInvocationParams {
  readonly cwd: string
  readonly argv: ReadonlyArray<string>
}

export const scriptRelTo = ({ cwd, argv }: ScriptInvocationParams): string => {
  const raw = argv[1]
  if (!raw) return FALLBACK_SCRIPT_REL
  const root = cwd.endsWith("/") ? cwd : `${cwd}/`
  if (raw.startsWith(root)) return raw.slice(root.length)

  const slash = raw.lastIndexOf("/")
  return slash >= 0 ? `scripts/${raw.slice(slash + 1)}` : FALLBACK_SCRIPT_REL
}

export const bunInvocation = (params: ScriptInvocationParams): string =>
  `bun ${scriptRelTo(params)}`

export const commandInvocation = ({
  cwd,
  argv
}: ScriptInvocationParams): string => {
  const raw = argv[1]
  const root = cwd.endsWith("/") ? cwd : `${cwd}/`
  return raw && raw.startsWith(root)
    ? bunInvocation({ cwd, argv })
    : "vendor-subtree"
}
