import { Effect } from "effect"
import { Command } from "effect/unstable/cli"

import { withCommandTelemetry } from "../app/log.tsx"
import { listVendored } from "../domain/vendor-state.ts"
import { ProjectFiles } from "../project/service.ts"
import { repoRoot } from "../services/git.ts"

export const refreshImpl = Effect.gen(function* () {
  const cwd = yield* repoRoot
  const repos = yield* listVendored(cwd)
  const projectFiles = yield* ProjectFiles
  yield* projectFiles.refresh({
    cwd,
    repos,
    commitMessage: "vendor: refresh project vendor files",
    editorSettings: true
  })
}).pipe(withCommandTelemetry("refresh"))

export const refreshCmd = Command.make("refresh", {}, () => refreshImpl).pipe(
  Command.withDescription(
    "Re-generate agent docs, .gitignore, .gitattributes, editor settings, and tool ignores from the current git state."
  )
)
