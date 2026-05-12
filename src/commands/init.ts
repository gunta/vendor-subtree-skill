import { Command as Cli } from "@effect/cli"
import { Effect } from "effect"
import { repoRoot } from "../git.ts"
import { ok, withCommandTelemetry } from "../log.ts"
import { refreshGeneratedFiles } from "../project-files.ts"
import { RuntimeConfig } from "../runtime.ts"
import { commandInvocation } from "../script.ts"
import { listVendored } from "../vendor-state.ts"

export const initImpl = Effect.gen(function* () {
  const cwd = yield* repoRoot
  const repos = yield* listVendored(cwd)
  const runtime = yield* RuntimeConfig
  const command = commandInvocation({ cwd, argv: runtime.argv })
  yield* refreshGeneratedFiles({
    cwd,
    repos,
    commitMessage: "vendor: initialize vendor-subtree-skill",
    vscode: true
  })
  yield* ok(
    `Initialized. Run \`${command} add <repo>\` to vendor a repository.`
  )
}).pipe(withCommandTelemetry("init"))

export const initCmd = Cli.make("init", {}, () => initImpl).pipe(
  Cli.withDescription(
    "Bootstrap the AGENTS.md (and CLAUDE.md) section + .vscode/settings.json exclusions, and commit."
  )
)
