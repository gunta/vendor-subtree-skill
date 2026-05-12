import { Command as Cli, Options } from "@effect/cli"
import { Console, Effect } from "effect"
import { VENDOR_DIR } from "../constants.ts"
import { repoRoot } from "../git.ts"
import { withCommandTelemetry } from "../log.ts"
import { listVendored, type VendoredRepo } from "../vendor-state.ts"

export interface ListCommandParams {
  readonly json: boolean
}

export interface RenderVendoredListParams {
  readonly repos: ReadonlyArray<VendoredRepo>
  readonly json: boolean
}

const listJsonOption = Options.boolean("json").pipe(
  Options.withDescription("Output machine-readable JSON to stdout.")
)

export const renderVendoredList = ({
  json,
  repos
}: RenderVendoredListParams): string => {
  if (json) return JSON.stringify({ vendor_dir: VENDOR_DIR, repos }, null, 2)
  if (repos.length === 0) return `vendor_dir: ${VENDOR_DIR}/\n(no repositories vendored)`

  const nameWidth = Math.max(...repos.map((repo) => repo.name.length))
  const prefixWidth = Math.max(...repos.map((repo) => repo.prefix.length))
  return [
    `vendor_dir: ${VENDOR_DIR}/`,
    ...repos.map(
      (repo) =>
        `  ${repo.name.padEnd(nameWidth)}  ${repo.prefix.padEnd(prefixWidth)}  ${repo.url} @ ${repo.ref}`
    )
  ].join("\n")
}

export const listImpl = ({ json }: ListCommandParams) =>
  Effect.gen(function* () {
    const cwd = yield* repoRoot
    const repos = yield* listVendored(cwd)
    yield* Console.log(renderVendoredList({ repos, json }))
  }).pipe(withCommandTelemetry("list"))

export const listCmd = Cli.make("list", { json: listJsonOption }, listImpl).pipe(
  Cli.withDescription(
    "List vendored repositories (derived from git commit trailers)."
  )
)
