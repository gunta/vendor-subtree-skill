# Effect v4 Uniformity Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring every function in `packages/cli/src/` into idiomatic Effect v4 form (returns an `Effect`-family value, typed errors, services via `Context.Service`, scoped resources, `Stream`-driven I/O), and finish the v3→v4 migration cleanup.

**Architecture:** Six phases, each independently mergeable. Phase 0 finishes the lingering v3 cleanup and adds lint guards. Phases 1–4 expand Effect coverage on the non-TUI code. Phase 5 rebuilds the TUI subsystem as a proper Effect application with a `TuiRenderer` service and `Scope`-managed renderer lifecycle.

**Tech Stack:** `effect@>=4.0.0-beta.66`, `@effect/platform-node@>=4.0.0-beta.66`, `effect/unstable/cli`, `effect/unstable/process`, `@opentui/core`, `ink` (React TUI), `bun` test runner.

**Spec:** [docs/plans/2026-05-13-refactor-effect-uniformity-v4-plan.md](./2026-05-13-refactor-effect-uniformity-v4-plan.md)

---

## File Structure

### Created

| Path                                      | Responsibility                                                                                                             | Phase |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----- |
| `packages/cli/scripts/check-v4-idioms.ts` | CI guard rejecting v3 API names, untyped error channels, raw `process.*` outside `runtime.ts`. Wired into `bun run check`. | 0     |
| `packages/cli/src/tui/renderer.ts`        | `TuiRenderer` `Context.Service` + `TuiRendererLive` `Layer.scoped` wrapping `@opentui/core`.                               | 5     |
| `packages/cli/tests/tui-runtime.test.ts`  | Integration test driving `runTuiApp` through a stubbed `TuiRenderer` layer.                                                | 5     |

### Modified

| Path                                                                                                                                                                                                  | Why                                                                                                                                                                                                                                                                                                                                                                          | Phase |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `packages/cli/src/services/git.ts`                                                                                                                                                                    | `Effect.catchAll → Effect.catch` (2 sites). `Effect.fn` for service methods.                                                                                                                                                                                                                                                                                                 | 0, 4  |
| `packages/cli/src/services/repository-hosts.ts`                                                                                                                                                       | `Effect.catchAll → Effect.catch` (1).                                                                                                                                                                                                                                                                                                                                        | 0     |
| `packages/cli/src/services/vendor-notes.ts`                                                                                                                                                           | `Effect.catchAll → Effect.catch` (2).                                                                                                                                                                                                                                                                                                                                        | 0     |
| `packages/cli/src/domain/vendor-state.ts`                                                                                                                                                             | `Effect.catchAll → Effect.catch` (1).                                                                                                                                                                                                                                                                                                                                        | 0     |
| `packages/cli/src/context-tools/service.ts`                                                                                                                                                           | `Effect.catchAll → Effect.catch` (1).                                                                                                                                                                                                                                                                                                                                        | 0     |
| `packages/cli/src/package-sync/service.ts`                                                                                                                                                            | `Effect.catchAll → Effect.catch` (10). `Effect.fn` for service methods.                                                                                                                                                                                                                                                                                                      | 0, 4  |
| `packages/cli/src/package-sync/version-detect.ts`                                                                                                                                                     | `Effect.catchAll → Effect.catch` (1).                                                                                                                                                                                                                                                                                                                                        | 0     |
| `packages/cli/src/project/languages.ts`                                                                                                                                                               | `Effect.catchAll → Effect.catch` (3).                                                                                                                                                                                                                                                                                                                                        | 0     |
| `packages/cli/src/tool-ignores/language-analyzers/typescript.ts`                                                                                                                                      | `Effect.catchAll → Effect.catch` (1).                                                                                                                                                                                                                                                                                                                                        | 0     |
| `packages/cli/package.json`                                                                                                                                                                           | Add `check:idioms` script wired into `check`.                                                                                                                                                                                                                                                                                                                                | 0     |
| `packages/cli/src/domain/errors.ts`                                                                                                                                                                   | New `Data.TaggedError` classes (`TomlParseFailed`, `YamlParseFailed`, `JsonParseFailed`, `JsoncParseFailed`, `JavaScriptParseFailed`, `TypeScriptParseFailed`, `SchemaDecodeFailed`, `InkRenderFailed`, `PromptInputFailed`, `TuiLaunchFailed`, `TuiRendererFailed`, `BunRuntimeMissing`, `ToolIgnoreCheckFailed`). Extend `VendorError`, `errorPresentation`, `exitCodeOf`. | 1     |
| `packages/cli/src/cli.tsx`                                                                                                                                                                            | Register new tagged errors in `Effect.catchTags`. Convert `Effect.promise(renderInkOnce(...))` to `Effect.tryPromise` → `InkRenderFailed`.                                                                                                                                                                                                                                   | 1     |
| `packages/cli/src/app/runtime.ts`                                                                                                                                                                     | Restore `colors: boolean` field. Resolve via `Config.option(Config.string(...))` for `NO_COLOR`, `FORCE_COLOR`, `TERM`.                                                                                                                                                                                                                                                      | 1     |
| `packages/cli/src/app/log.tsx`                                                                                                                                                                        | `Effect.promise → Effect.tryPromise` (`InkRenderFailed`).                                                                                                                                                                                                                                                                                                                    | 1     |
| `packages/cli/src/commands/deps.tsx`                                                                                                                                                                  | `Effect.promise → Effect.tryPromise` (`InkRenderFailed`).                                                                                                                                                                                                                                                                                                                    | 1     |
| `packages/cli/src/commands/doctor.tsx`                                                                                                                                                                | Same.                                                                                                                                                                                                                                                                                                                                                                        | 1     |
| `packages/cli/src/commands/add.tsx`                                                                                                                                                                   | `Effect.promise → Effect.tryPromise` for `mountProgress` and `unmount` (`InkRenderFailed`).                                                                                                                                                                                                                                                                                  | 1     |
| `packages/cli/src/commands/list.tsx`                                                                                                                                                                  | Same.                                                                                                                                                                                                                                                                                                                                                                        | 1     |
| `packages/cli/src/services/prompts.tsx`                                                                                                                                                               | Two conversions: render → `InkRenderFailed`, async input read → `PromptInputFailed`.                                                                                                                                                                                                                                                                                         | 1     |
| `packages/cli/src/project/script.ts`                                                                                                                                                                  | Wrap `scriptRelTo`, `bunInvocation`, `commandInvocation` in `Effect.sync`.                                                                                                                                                                                                                                                                                                   | 2     |
| `packages/cli/tests/script.test.ts`                                                                                                                                                                   | Use `Effect.runSync`.                                                                                                                                                                                                                                                                                                                                                        | 2     |
| `packages/cli/src/commands/init.ts`                                                                                                                                                                   | `yield* commandInvocation(...)`.                                                                                                                                                                                                                                                                                                                                             | 2     |
| `packages/cli/src/project/agent-docs.ts`                                                                                                                                                              | `yield* commandInvocation(...)`.                                                                                                                                                                                                                                                                                                                                             | 2     |
| (other `commandInvocation`/`bunInvocation` call sites discovered in Phase 2)                                                                                                                          | Same.                                                                                                                                                                                                                                                                                                                                                                        | 2     |
| `packages/cli/src/config/toml.ts`                                                                                                                                                                     | `parseTomlText` + `parseTomlWith`. Predicates return Effect with `TomlParseFailed`.                                                                                                                                                                                                                                                                                          | 3     |
| `packages/cli/src/config/yaml.ts`                                                                                                                                                                     | Same shape with `YamlParseFailed`.                                                                                                                                                                                                                                                                                                                                           | 3     |
| `packages/cli/src/config/jsonc-settings.ts`                                                                                                                                                           | All functions return Effect. `SettingsMergeResult` and `ParsedSettings` migrated to `Data.TaggedEnum`. `switch` → `Match`.                                                                                                                                                                                                                                                   | 3     |
| `packages/cli/src/config/javascript-source.ts`                                                                                                                                                        | `JavaScriptParseFailed`.                                                                                                                                                                                                                                                                                                                                                     | 3     |
| `packages/cli/src/config/typescript-source.ts`                                                                                                                                                        | `TypeScriptParseFailed`.                                                                                                                                                                                                                                                                                                                                                     | 3     |
| `packages/cli/src/config/package-json.ts`                                                                                                                                                             | Effect-returning exports.                                                                                                                                                                                                                                                                                                                                                    | 3     |
| `packages/cli/tests/config-parsers.test.ts`                                                                                                                                                           | Adapt to Effect parsers + add failing-input tagged-error assertions.                                                                                                                                                                                                                                                                                                         | 3     |
| (consumers of `config/*`: `editors/*.ts`, `tool-ignores/*.ts`, `project/*.ts`)                                                                                                                        | `yield*` Effect parsers; `Effect.orElseSucceed(() => false)` where swallow semantics required.                                                                                                                                                                                                                                                                               | 3     |
| `packages/cli/src/tool-ignores/common.ts`                                                                                                                                                             | `ToolIgnoreIntegration` signatures: `unknown` → `ToolIgnoreCheckFailed`.                                                                                                                                                                                                                                                                                                     | 4     |
| `packages/cli/src/services/git.ts`, `services/project-files`, `services/project-surfaces`, `editors/service.ts`, `tool-ignores/service.ts`, `services/repository-hosts.ts`, `package-sync/service.ts` | Adopt `Effect.fn("ServiceName.method")` for major methods.                                                                                                                                                                                                                                                                                                                   | 4     |
| `packages/cli/src/commands/tui.ts`                                                                                                                                                                    | Replace `Effect.promise(() => launchTui())` with the new Effect-native `launchTui`.                                                                                                                                                                                                                                                                                          | 5     |
| `packages/cli/src/tui/runner.ts`                                                                                                                                                                      | Entry point: `NodeRuntime.runMain(runTuiApp.pipe(Effect.provide(TuiLayer)))`.                                                                                                                                                                                                                                                                                                | 5     |
| `packages/cli/src/tui/launcher.ts`                                                                                                                                                                    | All helpers return Effect. `spawnSync` → `ChildProcessSpawner`. `process.exitCode` → `RuntimeConfig.exit`. ENOENT → `BunRuntimeMissing`.                                                                                                                                                                                                                                     | 5     |
| `packages/cli/src/tui/app.ts`                                                                                                                                                                         | `SubscriptionRef` state, `Stream`-driven render/keyboard/resize, `Effect.scoped`.                                                                                                                                                                                                                                                                                            | 5     |
| `packages/cli/src/tui/cli-adapter.ts`                                                                                                                                                                 | Effect-returning functions.                                                                                                                                                                                                                                                                                                                                                  | 5     |
| `packages/cli/src/tui/dashboard.ts`                                                                                                                                                                   | Pure functions wrapped in `Effect.sync`. `DashboardAction` → `Data.TaggedEnum`. `switch` → `Match`.                                                                                                                                                                                                                                                                          | 5     |
| `packages/cli/src/tui/keyboard.ts`                                                                                                                                                                    | Effect-returning handler.                                                                                                                                                                                                                                                                                                                                                    | 5     |
| `packages/cli/src/tui/render.ts`                                                                                                                                                                      | Renderer wrapped in `Effect.sync`.                                                                                                                                                                                                                                                                                                                                           | 5     |
| `packages/cli/src/tui/status.ts`                                                                                                                                                                      | Pure formatters wrapped in `Effect.sync`.                                                                                                                                                                                                                                                                                                                                    | 5     |
| `packages/cli/src/app/layers.ts`                                                                                                                                                                      | Export `TuiLayer = Layer.mergeAll(TuiRendererLive, LiveLayer)`.                                                                                                                                                                                                                                                                                                              | 5     |
| `packages/cli/tests/tui-launcher.test.ts`                                                                                                                                                             | `Effect.runSync(tuiLaunchPlan(...))`. Stub `ChildProcessSpawner` layer.                                                                                                                                                                                                                                                                                                      | 5     |
| `packages/cli/tests/tui-status.test.ts`                                                                                                                                                               | `Effect.runSync` adaptation.                                                                                                                                                                                                                                                                                                                                                 | 5     |

---

## Phase 0 — Finish v4 cleanup

**Goal:** Zero `Effect.catchAll` and a durable lint guard against v3 idioms. One PR.

### Task 0.1: Add v4-idiom CI guard

**Files:**

- Create: `packages/cli/scripts/check-v4-idioms.ts`
- Modify: `packages/cli/package.json`

- [ ] **Step 1: Create the guard script**

Write `packages/cli/scripts/check-v4-idioms.ts`:

```ts
#!/usr/bin/env bun
import { readdir, readFile } from "node:fs/promises"
import { resolve, relative, sep } from "node:path"

interface Rule {
  readonly name: string
  readonly pattern: RegExp
  readonly allow?: (filePath: string) => boolean
}

const ALLOW_RUNTIME = (p: string) => p.endsWith(`src${sep}app${sep}runtime.ts`)
const ALLOW_INK_OR_TEST = (p: string) =>
  p.includes(`src${sep}app${sep}ink${sep}`) || p.includes(`tests${sep}`)

const rules: ReadonlyArray<Rule> = [
  {
    name: "Effect.promise (use Effect.tryPromise with a tagged error)",
    pattern: /\bEffect\.promise\s*\(/
  },
  { name: "Effect.catchAll (v4: Effect.catch)", pattern: /\bEffect\.catchAll\b/ },
  { name: "Effect.catchAllCause (v4: Effect.catchCause)", pattern: /\bEffect\.catchAllCause\b/ },
  { name: "Effect.catchAllDefect (v4: Effect.catchDefect)", pattern: /\bEffect\.catchAllDefect\b/ },
  { name: "Effect.catchSome (v4: Effect.catchFilter)", pattern: /\bEffect\.catchSome\b/ },
  { name: "Effect.Service (v4: Context.Service + Layer)", pattern: /\bEffect\.Service\b/ },
  { name: "Context.Tag (v4: Context.Service)", pattern: /\bContext\.Tag\s*\(/ },
  { name: "Context.GenericTag (v4: Context.Service)", pattern: /\bContext\.GenericTag\b/ },
  { name: "Scope.extend (v4: Scope.provide)", pattern: /\bScope\.extend\b/ },
  { name: "FiberRef (v4: Context.Reference)", pattern: /\bFiberRef\.\b/ },
  { name: "Either (v4: Result)", pattern: /\bEither\b/ },
  {
    name: "Untyped error channel Effect.Effect<X, unknown>",
    pattern: /Effect\.Effect<[^>]*,\s*unknown[\s,>]/
  },
  { name: "@effect/cli import (v4: effect/unstable/cli)", pattern: /from\s+["']@effect\/cli["']/ },
  { name: "@effect/platform import (v4: effect)", pattern: /from\s+["']@effect\/platform["']/ },
  { name: "@effect/schema import (v4: effect Schema)", pattern: /from\s+["']@effect\/schema["']/ },
  {
    name: "Raw process.* access (route through RuntimeConfig)",
    pattern: /\bprocess\.(env|argv|cwd|exit|exitCode)\b/,
    allow: ALLOW_RUNTIME
  },
  {
    name: "Stray console.* (use Effect.log* or Ink)",
    pattern: /\bconsole\.(log|warn|error|debug)\s*\(/,
    allow: ALLOW_INK_OR_TEST
  }
]

const walk = async (dir: string): Promise<ReadonlyArray<string>> => {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: Array<string> = []
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist") continue
    const path = resolve(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await walk(path)))
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(path)
  }
  return files
}

const repoRoot = resolve(import.meta.dir, "..")
const targets = await walk(resolve(repoRoot, "src"))
const violations: Array<string> = []

for (const file of targets) {
  const text = await readFile(file, "utf-8")
  const lines = text.split("\n")
  for (const rule of rules) {
    if (rule.allow?.(file)) continue
    lines.forEach((line, i) => {
      if (rule.pattern.test(line)) {
        violations.push(`${relative(repoRoot, file)}:${i + 1}  ${rule.name}\n    ${line.trim()}`)
      }
    })
  }
}

if (violations.length > 0) {
  console.error(`Effect v4 idiom check failed (${violations.length} violations):\n`)
  for (const v of violations) console.error(v + "\n")
  process.exit(1)
}
console.log(`Effect v4 idiom check passed (${targets.length} files scanned).`)
```

- [ ] **Step 2: Wire it into `bun run check`**

Modify `packages/cli/package.json`. Change:

```jsonc
"check": "bun run lint && bun run format:check && bun run typecheck && bun run test",
```

to:

```jsonc
"check": "bun run lint && bun run format:check && bun run typecheck && bun run check:idioms && bun run test",
"check:idioms": "bun scripts/check-v4-idioms.ts",
```

- [ ] **Step 3: Run the guard against the current tree**

Run: `bun run --cwd packages/cli check:idioms`
Expected: FAILS with 22 `Effect.catchAll` violations (and possibly the 10 `Effect.promise` ones, which Phase 1 fixes).

- [ ] **Step 4: Commit**

```bash
git add packages/cli/scripts/check-v4-idioms.ts packages/cli/package.json
git commit -m "Add Effect v4 idiom CI guard

Rejects v3 API names (catchAll/Service/Tag/Scope.extend/FiberRef/Either),
untyped error channels, raw process.* outside runtime.ts, stray console.*
outside Ink components, and old @effect/* import paths."
```

### Task 0.2: Rename all `Effect.catchAll` → `Effect.catch`

**Files:** all 9 files listed in the spec's "Current state" table.

- [ ] **Step 1: Run the rename**

Run:

```bash
cd packages/cli/src
files=(
  services/git.ts
  services/repository-hosts.ts
  services/vendor-notes.ts
  domain/vendor-state.ts
  context-tools/service.ts
  package-sync/service.ts
  package-sync/version-detect.ts
  project/languages.ts
  tool-ignores/language-analyzers/typescript.ts
)
for f in "${files[@]}"; do
  perl -i -pe 's/\bEffect\.catchAll\b/Effect.catch/g' "$f"
done
```

- [ ] **Step 2: Verify zero remaining `catchAll`**

Run: `grep -rn "Effect\.catchAll\b" packages/cli/src/`
Expected: no output.

- [ ] **Step 3: Run idiom check**

Run: `bun run --cwd packages/cli check:idioms`
Expected: still flags `Effect.promise` (10 sites). No `catchAll` violations.

- [ ] **Step 4: Run full check**

Run: `bun run --cwd packages/cli typecheck && bun run --cwd packages/cli test`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/
git commit -m "Rename Effect.catchAll to Effect.catch (v4)

Mechanical rename across 9 files, 22 sites. catchAll was renamed to
catch in Effect v4; behavior is unchanged."
```

---

## Phase 1 — Foundation: new tagged errors, Config-driven color, Ink-render Effect.tryPromise

**Goal:** Add all new tagged errors and convert the 10 `Effect.promise(...)` Ink/prompt sites. Restore `colors: boolean` on `RuntimeConfig` via `Config`. One PR.

### Task 1.1: Add new tagged errors to `domain/errors.ts`

**Files:**

- Modify: `packages/cli/src/domain/errors.ts`

- [ ] **Step 1: Add the error classes**

Add to `packages/cli/src/domain/errors.ts` (preserve existing classes and imports; add the new imports if missing):

```ts
import { Data, SchemaIssue } from "effect"
// keep existing imports

export class TomlParseFailed extends Data.TaggedError("TomlParseFailed")<{
  readonly source?: string
  readonly cause: unknown
}> {}

export class YamlParseFailed extends Data.TaggedError("YamlParseFailed")<{
  readonly source?: string
  readonly cause: unknown
}> {}

export class JsonParseFailed extends Data.TaggedError("JsonParseFailed")<{
  readonly source?: string
  readonly cause: unknown
}> {}

export class JsoncParseFailed extends Data.TaggedError("JsoncParseFailed")<{
  readonly source?: string
  readonly cause: unknown
}> {}

export class JavaScriptParseFailed extends Data.TaggedError("JavaScriptParseFailed")<{
  readonly source?: string
  readonly cause: unknown
}> {}

export class TypeScriptParseFailed extends Data.TaggedError("TypeScriptParseFailed")<{
  readonly source?: string
  readonly cause: unknown
}> {}

export class SchemaDecodeFailed extends Data.TaggedError("SchemaDecodeFailed")<{
  readonly source: string
  readonly cause: unknown
}> {}

export class InkRenderFailed extends Data.TaggedError("InkRenderFailed")<{
  readonly view: string
  readonly cause: unknown
}> {}

export class PromptInputFailed extends Data.TaggedError("PromptInputFailed")<{
  readonly cause: unknown
}> {}

export class TuiLaunchFailed extends Data.TaggedError("TuiLaunchFailed")<{
  readonly command: string
  readonly cause: unknown
}> {}

export class TuiRendererFailed extends Data.TaggedError("TuiRendererFailed")<{
  readonly phase: "acquire" | "render" | "release"
  readonly cause: unknown
}> {}

export class BunRuntimeMissing extends Data.TaggedError("BunRuntimeMissing")<
  Record<string, never>
> {}

export class ToolIgnoreCheckFailed extends Data.TaggedError("ToolIgnoreCheckFailed")<{
  readonly tool: string
  readonly cause: unknown
}> {}
```

- [ ] **Step 2: Extend `VendorError` union**

Locate the existing `VendorError` union type and add the new classes. Add to the union (preserve existing members):

```ts
export type VendorError =
  | DirtyWorkingTree
  | GitCommandFailed
  /* … all existing … */
  | TomlParseFailed
  | YamlParseFailed
  | JsonParseFailed
  | JsoncParseFailed
  | JavaScriptParseFailed
  | TypeScriptParseFailed
  | SchemaDecodeFailed
  | InkRenderFailed
  | PromptInputFailed
  | TuiLaunchFailed
  | TuiRendererFailed
  | BunRuntimeMissing
  | ToolIgnoreCheckFailed
```

- [ ] **Step 3: Extend `errorPresentation`**

Add cases. For each new error, return an `ErrorPresentation`. Example pattern:

```ts
export const errorPresentation = (cause: VendorError): ErrorPresentation => {
  switch (cause._tag) {
    // existing cases
    case "TomlParseFailed":
      return {
        title: "TOML parse failed",
        detail: cause.source ? `Source: ${cause.source}` : undefined,
        hint: "Inspect the file for invalid TOML syntax.",
        code: 1
      }
    case "YamlParseFailed":
      return {
        title: "YAML parse failed",
        detail: cause.source ? `Source: ${cause.source}` : undefined,
        hint: "Inspect the file for invalid YAML syntax.",
        code: 1
      }
    case "JsonParseFailed":
      return {
        title: "JSON parse failed",
        detail: cause.source,
        hint: "Inspect the file for invalid JSON syntax.",
        code: 1
      }
    case "JsoncParseFailed":
      return {
        title: "JSONC parse failed",
        detail: cause.source,
        hint: "Inspect the file for invalid JSONC syntax.",
        code: 1
      }
    case "JavaScriptParseFailed":
      return {
        title: "JavaScript parse failed",
        detail: cause.source,
        hint: "Inspect the file for invalid JS syntax.",
        code: 1
      }
    case "TypeScriptParseFailed":
      return {
        title: "TypeScript parse failed",
        detail: cause.source,
        hint: "Inspect the file for invalid TS syntax.",
        code: 1
      }
    case "SchemaDecodeFailed":
      return {
        title: `Schema decode failed: ${cause.source}`,
        detail: String(cause.cause),
        code: 1
      }
    case "InkRenderFailed":
      return { title: `UI render failed: ${cause.view}`, detail: String(cause.cause), code: 1 }
    case "PromptInputFailed":
      return { title: "Failed to read prompt input", detail: String(cause.cause), code: 1 }
    case "TuiLaunchFailed":
      return { title: `TUI launch failed: ${cause.command}`, detail: String(cause.cause), code: 1 }
    case "TuiRendererFailed":
      return { title: `TUI renderer failed (${cause.phase})`, detail: String(cause.cause), code: 1 }
    case "BunRuntimeMissing":
      return {
        title: "Bun runtime not found",
        hint: "ingraft's TUI requires Bun. Install Bun, or run `ingraft deps` for the non-interactive scanner.",
        code: 1
      }
    case "ToolIgnoreCheckFailed":
      return {
        title: `Tool ignore check failed: ${cause.tool}`,
        detail: String(cause.cause),
        code: 1
      }
  }
}
```

(Adapt the literal shape to match the existing `errorPresentation` style — read the file first and follow its pattern.)

- [ ] **Step 4: Extend `exitCodeOf`**

If `exitCodeOf` has a default branch that returns 1, the new errors fall through naturally — no change needed. Otherwise, add cases returning 1 for each new tag.

- [ ] **Step 5: Run typecheck**

Run: `bun run --cwd packages/cli typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/domain/errors.ts
git commit -m "Add tagged errors for parsers, Ink, prompts, and TUI

New errors: TomlParseFailed, YamlParseFailed, JsonParseFailed,
JsoncParseFailed, JavaScriptParseFailed, TypeScriptParseFailed,
SchemaDecodeFailed, InkRenderFailed, PromptInputFailed,
TuiLaunchFailed, TuiRendererFailed, BunRuntimeMissing,
ToolIgnoreCheckFailed. Wired into VendorError union and presentation."
```

### Task 1.2: Restore `colors` on `RuntimeConfig` via `Effect.Config`

**Files:**

- Modify: `packages/cli/src/app/runtime.ts`

- [ ] **Step 1: Update `runtime.ts`**

Replace the contents of `packages/cli/src/app/runtime.ts` with:

```ts
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

const resolveColors = (env: {
  readonly noColor: Option.Option<string>
  readonly forceColor: Option.Option<string>
  readonly term: Option.Option<string>
}): boolean => {
  if (Option.isSome(env.noColor)) return false
  if (Option.isSome(env.forceColor) && env.forceColor.value !== "0") return true
  const term = Option.getOrUndefined(env.term)
  return Boolean(process.stdout.isTTY) && term !== "dumb"
}

const liveRuntimeConfig = Effect.gen(function* () {
  const env = yield* Effect.config(colorEnv)
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
```

- [ ] **Step 2: Locate the existing `RuntimeConfigLive` Layer usage**

Find where `Layer.sync(RuntimeConfig, liveRuntimeConfig)` is imported/referenced; update to `RuntimeConfigLive` (already exported as `Layer.effect`). Typically `packages/cli/src/app/layers.ts`:

```bash
grep -n "RuntimeConfig" packages/cli/src/app/layers.ts
```

Verify the import name in `layers.ts` still imports `RuntimeConfigLive` (rename it locally if previously imported as something different). If `layers.ts` uses `RuntimeConfig.Default`, replace with `RuntimeConfigLive`.

- [ ] **Step 3: Run typecheck**

Run: `bun run --cwd packages/cli typecheck`
Expected: PASS.

- [ ] **Step 4: Verify color resolution**

Run: `NO_COLOR=1 bun run --cwd packages/cli dev --help 2>&1 | head -5`
Expected: no ANSI color escapes in output.

Run: `FORCE_COLOR=1 bun run --cwd packages/cli dev --help 2>&1 | head -5`
Expected: ANSI color escapes present.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/app/runtime.ts packages/cli/src/app/layers.ts
git commit -m "Resolve color preference via Effect.Config

Reads NO_COLOR, FORCE_COLOR, TERM through Config.option(Config.string(...))
instead of raw process.env access. Restores the colors: boolean field
that was dropped during the v4 migration."
```

### Task 1.3: Register new tagged errors in `cli.tsx` catchTags

**Files:**

- Modify: `packages/cli/src/cli.tsx`

- [ ] **Step 1: Add new tags to `Effect.catchTags`**

In `packages/cli/src/cli.tsx`, locate the `Effect.catchTags({...})` block. Add entries for the new tags, all mapping to `handleVendorError`:

```ts
Effect.catchTags({
  // … existing tags …
  TomlParseFailed: handleVendorError,
  YamlParseFailed: handleVendorError,
  JsonParseFailed: handleVendorError,
  JsoncParseFailed: handleVendorError,
  JavaScriptParseFailed: handleVendorError,
  TypeScriptParseFailed: handleVendorError,
  SchemaDecodeFailed: handleVendorError,
  InkRenderFailed: handleVendorError,
  PromptInputFailed: handleVendorError,
  TuiLaunchFailed: handleVendorError,
  TuiRendererFailed: handleVendorError,
  BunRuntimeMissing: handleVendorError,
  ToolIgnoreCheckFailed: handleVendorError
})
```

- [ ] **Step 2: Convert the Ink render call**

In `packages/cli/src/cli.tsx`, locate `handleVendorError`:

```ts
const handleVendorError = <E extends VendorError>(cause: E) =>
  RuntimeConfig.pipe(
    Effect.flatMap((runtime) =>
      Effect.promise(() =>
        renderInkOnce(<ErrorView presentation={errorPresentation(cause)} />)
      ).pipe(Effect.zipRight(runtime.exit(exitCodeOf(cause))))
    )
  )
```

Replace with:

```ts
import { InkRenderFailed } from "./domain/errors.ts"

const handleVendorError = <E extends VendorError>(cause: E) =>
  RuntimeConfig.pipe(
    Effect.flatMap((runtime) =>
      Effect.tryPromise({
        try: () => renderInkOnce(<ErrorView presentation={errorPresentation(cause)} />),
        catch: (renderCause) => new InkRenderFailed({ view: "ErrorView", cause: renderCause })
      }).pipe(
        Effect.catchTag("InkRenderFailed", () => Effect.void),
        Effect.zipRight(runtime.exit(exitCodeOf(cause)))
      )
    )
  )
```

(The `catchTag` collapses an Ink failure into "best effort render, still exit with the original code" — we do not want a render bug to mask the underlying error's exit code.)

- [ ] **Step 3: Run typecheck**

Run: `bun run --cwd packages/cli typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/cli.tsx
git commit -m "Register new tagged errors and type the error-view render

cli.tsx's catchTags now handles all new tagged errors. The ErrorView
render is wrapped in Effect.tryPromise with InkRenderFailed; render
failures degrade to a void render but preserve the original exit code."
```

### Task 1.4: Convert remaining 9 `Effect.promise` Ink sites to `Effect.tryPromise`

**Files:**

- Modify: `packages/cli/src/app/log.tsx`
- Modify: `packages/cli/src/commands/deps.tsx`
- Modify: `packages/cli/src/commands/doctor.tsx`
- Modify: `packages/cli/src/commands/add.tsx`
- Modify: `packages/cli/src/commands/list.tsx`
- Modify: `packages/cli/src/services/prompts.tsx`

- [ ] **Step 1: Apply the conversion pattern to each site**

For each site, replace `Effect.promise(() => X)` with the typed form. Example for `app/log.tsx:18`:

Before:

```ts
Effect.promise(() => renderInkOnce(<StatusLine kind={kind} label={label} />))
```

After:

```ts
import { InkRenderFailed } from "../domain/errors.ts"

Effect.tryPromise({
  try: () => renderInkOnce(<StatusLine kind={kind} label={label} />),
  catch: (cause) => new InkRenderFailed({ view: "StatusLine", cause })
})
```

Apply the same shape to each of these (the `view` string identifies which Ink component fails):

| File:Line                 | `view` string          |
| ------------------------- | ---------------------- |
| `app/log.tsx:18`          | `"StatusLine"`         |
| `commands/deps.tsx:221`   | `"DepsView"`           |
| `commands/doctor.tsx:157` | `"DoctorView"`         |
| `commands/add.tsx:1012`   | `"AddProgressMount"`   |
| `commands/add.tsx:1028`   | `"AddProgressUnmount"` |
| `commands/list.tsx:69`    | `"ListView"`           |
| `services/prompts.tsx:66` | `"ChoicesView"`        |

(`cli.tsx:78` was already converted in Task 1.3.)

For each file, add `import { InkRenderFailed } from "../domain/errors.ts"` (adjust relative path).

- [ ] **Step 2: Convert the prompt-input site**

In `packages/cli/src/services/prompts.tsx`, line 69 is the async input read (not an Ink render). Replace:

```ts
const answer =
  yield *
  Effect.promise(async () => {
    // … existing body …
  })
```

with:

```ts
import { PromptInputFailed } from "../domain/errors.ts"

const answer =
  yield *
  Effect.tryPromise({
    try: async () => {
      // … same existing body …
    },
    catch: (cause) => new PromptInputFailed({ cause })
  })
```

- [ ] **Step 3: Run idiom check**

Run: `bun run --cwd packages/cli check:idioms`
Expected: only `commands/tui.ts:7` `Effect.promise(() => launchTui())` remains (deferred to Phase 5).

- [ ] **Step 4: Run typecheck and tests**

Run: `bun run --cwd packages/cli typecheck && bun run --cwd packages/cli test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/app/log.tsx packages/cli/src/commands/{deps,doctor,add,list}.tsx packages/cli/src/services/prompts.tsx
git commit -m "Type all Ink-render and prompt-input promise wrappers

Effect.promise → Effect.tryPromise mapping to InkRenderFailed
(9 Ink sites) and PromptInputFailed (1 input-read site).
The TUI-launcher site in commands/tui.ts remains until Phase 5
when launchTui itself becomes Effect-native."
```

---

## Phase 2 — Effect-ify pure script helpers

**Goal:** `scriptRelTo`, `bunInvocation`, `commandInvocation` return Effects. All call sites updated. One PR.

### Task 2.1: Identify call sites

**Files:** discovery only.

- [ ] **Step 1: List all call sites**

Run: `grep -rn "scriptRelTo\|bunInvocation\|commandInvocation" packages/cli/src/ packages/cli/tests/`
Expected: a list. Record each occurrence; they all need updating in Step 2.4.

### Task 2.2: Update `script.test.ts` to use `Effect.runSync` (failing tests first)

**Files:**

- Modify: `packages/cli/tests/script.test.ts`

- [ ] **Step 1: Read the current test file**

Run: `cat packages/cli/tests/script.test.ts`

- [ ] **Step 2: Wrap each call in `Effect.runSync`**

For every assertion like `expect(scriptRelTo({...})).toBe(...)`, replace with `expect(Effect.runSync(scriptRelTo({...}))).toBe(...)`. Add `import { Effect } from "effect"` at the top if not present.

Example:

Before:

```ts
expect(scriptRelTo({ cwd: "/r", argv: ["bun", "/r/x.ts"] })).toBe("x.ts")
```

After:

```ts
expect(Effect.runSync(scriptRelTo({ cwd: "/r", argv: ["bun", "/r/x.ts"] }))).toBe("x.ts")
```

- [ ] **Step 3: Run the tests (should fail)**

Run: `bun test packages/cli/tests/script.test.ts`
Expected: FAIL — `Effect.runSync` receives a plain string, not an Effect.

### Task 2.3: Wrap `project/script.ts` exports in `Effect.sync`

**Files:**

- Modify: `packages/cli/src/project/script.ts`

- [ ] **Step 1: Update `script.ts`**

Replace the contents of `packages/cli/src/project/script.ts` with:

```ts
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
    return raw && raw.startsWith(root) ? `bun ${scriptRelToSync(params)}` : "bunx ingraft@latest"
  })
```

- [ ] **Step 2: Run the tests (should pass)**

Run: `bun test packages/cli/tests/script.test.ts`
Expected: PASS.

### Task 2.4: Update call sites

**Files:** every file from Task 2.1's grep output. Typically `commands/init.ts`, `commands/add.tsx`, `commands/update.ts`, `commands/remove.ts`, `project/agent-docs.ts`. Use the grep result as the authoritative list.

- [ ] **Step 1: Update each call site**

For each call inside `Effect.gen(function* () { ... })`, change:

Before:

```ts
const command = commandInvocation({ cwd, argv: runtime.argv })
```

After:

```ts
const command = yield * commandInvocation({ cwd, argv: runtime.argv })
```

For any call site that is NOT inside `Effect.gen`, wrap the caller in `Effect.gen` or use `.pipe(Effect.runSync)` only if the caller is genuinely synchronous and non-Effect. Read each site carefully; do not assume.

- [ ] **Step 2: Run typecheck**

Run: `bun run --cwd packages/cli typecheck`
Expected: PASS. If a call site outside `Effect.gen` shows up, add it to the updates and re-run.

- [ ] **Step 3: Run all tests**

Run: `bun run --cwd packages/cli test`
Expected: PASS.

- [ ] **Step 4: Run idiom check + full check**

Run: `bun run --cwd packages/cli check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/project/script.ts packages/cli/tests/script.test.ts packages/cli/src/
git commit -m "Wrap script invocation helpers in Effect.sync

scriptRelTo, bunInvocation, commandInvocation now return
Effect.Effect<string>. All call sites yield the values inside their
existing Effect.gen blocks."
```

---

## Phase 3 — Config parsers + Schema

**Goal:** Every parser returns Effect with a tagged failure. Schema validation surfaces decode errors. `jsonc-settings` tagged unions migrate to `Data.TaggedEnum`. One PR.

### Task 3.1: Add failing-input test cases to `config-parsers.test.ts`

**Files:**

- Modify: `packages/cli/tests/config-parsers.test.ts`

- [ ] **Step 1: Read the current tests**

Run: `cat packages/cli/tests/config-parsers.test.ts`

- [ ] **Step 2: Add a failing test for malformed TOML (RED)**

Append to the file:

```ts
import { Effect, Exit } from "effect"

import { parseTomlText } from "../src/config/toml.ts"
import { TomlParseFailed } from "../src/domain/errors.ts"

test("parseTomlText surfaces TomlParseFailed on malformed input", async () => {
  const exit = await Effect.runPromiseExit(parseTomlText("this is = not [valid"))
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isFailure(exit)) {
    const error = exit.cause._tag === "Fail" ? exit.cause.error : undefined
    expect(error).toBeInstanceOf(TomlParseFailed)
  }
})
```

- [ ] **Step 3: Run the new test (should fail to compile)**

Run: `bun test packages/cli/tests/config-parsers.test.ts`
Expected: FAIL — `parseTomlText` does not exist yet.

### Task 3.2: Refactor `config/toml.ts`

**Files:**

- Modify: `packages/cli/src/config/toml.ts`

- [ ] **Step 1: Rewrite `config/toml.ts`**

Replace contents with:

```ts
import * as TOML from "@iarna/toml"
import { Effect, Schema } from "effect"

import { TomlParseFailed, SchemaDecodeFailed } from "../domain/errors.ts"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const valueAtPath = (value: Record<string, unknown>, path: ReadonlyArray<string>): unknown =>
  path.reduce<unknown>((current, key) => (isRecord(current) ? current[key] : undefined), value)

export const parseTomlText = (text: string): Effect.Effect<unknown, TomlParseFailed> =>
  Effect.try({
    try: () => TOML.parse(text) as unknown,
    catch: (cause) => new TomlParseFailed({ cause })
  })

export const parseTomlWith =
  <A, I, R>(schema: Schema.Schema<A, I, R>) =>
  (text: string): Effect.Effect<A, TomlParseFailed | SchemaDecodeFailed, R> =>
    parseTomlText(text).pipe(
      Effect.flatMap((value) =>
        Schema.decodeUnknownEffect(schema)(value).pipe(
          Effect.mapError((cause) => new SchemaDecodeFailed({ source: "toml", cause }))
        )
      )
    )

const parseToRecord = (text: string): Effect.Effect<Record<string, unknown>, TomlParseFailed> =>
  parseTomlText(text).pipe(
    Effect.flatMap((value) =>
      isRecord(value)
        ? Effect.succeed(value)
        : Effect.fail(
            new TomlParseFailed({ cause: new Error("Top-level TOML value is not a table") })
          )
    )
  )

export const tomlHasPath = (
  text: string,
  path: ReadonlyArray<string>
): Effect.Effect<boolean, TomlParseFailed> =>
  parseToRecord(text).pipe(Effect.map((value) => valueAtPath(value, path) !== undefined))

export const tomlPathHasArrayValue = (
  text: string,
  path: ReadonlyArray<string>,
  expected: string
): Effect.Effect<boolean, TomlParseFailed> =>
  parseToRecord(text).pipe(
    Effect.map((value) => {
      const current = valueAtPath(value, path)
      return (
        Array.isArray(current) &&
        current.some((item) => typeof item === "string" && item === expected)
      )
    })
  )

export const tomlPathHasAnyArrayValue = (
  text: string,
  path: ReadonlyArray<string>,
  expected: ReadonlyArray<string>
): Effect.Effect<boolean, TomlParseFailed> =>
  parseToRecord(text).pipe(
    Effect.map((value) => {
      const current = valueAtPath(value, path)
      if (!Array.isArray(current)) return false
      return expected.some((needle) =>
        current.some((item) => typeof item === "string" && item === needle)
      )
    })
  )
```

- [ ] **Step 2: Run the toml-related tests**

Run: `bun test packages/cli/tests/config-parsers.test.ts`
Expected: the new `parseTomlText` malformed-input test PASSES. Existing toml-related tests will FAIL (they call the old Option-based API).

- [ ] **Step 3: Update existing toml tests to the new Effect API**

For each existing test calling `tomlHasPath`, `tomlPathHasArrayValue`, `tomlPathHasAnyArrayValue`, wrap with `Effect.runSync`:

Before:

```ts
expect(tomlHasPath(text, ["a", "b"])).toBe(true)
```

After:

```ts
expect(Effect.runSync(tomlHasPath(text, ["a", "b"]))).toBe(true)
```

Run: `bun test packages/cli/tests/config-parsers.test.ts`
Expected: PASS.

- [ ] **Step 4: Update call sites of the toml helpers**

Run: `grep -rn "tomlHasPath\|tomlPathHasArrayValue\|tomlPathHasAnyArrayValue\|parseTomlConfig" packages/cli/src/`

For each call site:

- If inside `Effect.gen` already: change to `yield* tomlHasPath(...)`.
- If outside Effect (rare): wrap in `Effect.runSync(...)` only if the caller is truly sync. Otherwise lift the caller into an Effect.
- If the old API `parseTomlConfig` is used: replace with `parseTomlText` (returns `Effect<unknown, TomlParseFailed>` instead of `Option<Record<string, unknown>>`). Adapt the consumer to the new shape.

If a caller wants to silently swallow a parse error (preserve old behavior), wrap the call with `Effect.orElseSucceed(() => false)`. Document each such site with a brief comment if the intent is non-obvious.

- [ ] **Step 5: Run typecheck and tests**

Run: `bun run --cwd packages/cli typecheck && bun run --cwd packages/cli test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/config/toml.ts packages/cli/tests/config-parsers.test.ts packages/cli/src/
git commit -m "Effect-ify TOML parser with Schema-aware combinator

parseTomlText returns Effect<unknown, TomlParseFailed>. parseTomlWith
composes a Schema decoder for typed validation, producing
Effect<A, TomlParseFailed | SchemaDecodeFailed, R>. Predicate helpers
now return Effect; call sites updated, with explicit Effect.orElseSucceed
where swallow semantics are intentional."
```

### Task 3.3: Refactor `config/yaml.ts`

**Files:**

- Modify: `packages/cli/src/config/yaml.ts`

- [ ] **Step 1: Read the current file**

Run: `cat packages/cli/src/config/yaml.ts`

- [ ] **Step 2: Apply the same pattern as `toml.ts`**

Use the same shape: `parseYamlText`, `parseYamlWith`, `yamlHasPath` and friends, all returning `Effect.Effect<X, YamlParseFailed | SchemaDecodeFailed, ...>`. Replace `TOML.parse` with the existing YAML parser call. Map errors to `YamlParseFailed`. Use the same `parseToRecord` helper structure.

- [ ] **Step 3: Update tests for YAML in `config-parsers.test.ts`**

Same wrapping pattern: `Effect.runSync(...)` for predicate calls. Add a failing-input test asserting `YamlParseFailed`.

- [ ] **Step 4: Update YAML call sites**

Run: `grep -rn "parseYaml\|yamlHasPath" packages/cli/src/` and update each site as in Task 3.2 Step 4.

- [ ] **Step 5: Run typecheck and tests**

Run: `bun run --cwd packages/cli typecheck && bun run --cwd packages/cli test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/config/yaml.ts packages/cli/tests/ packages/cli/src/
git commit -m "Effect-ify YAML parser with Schema-aware combinator

Mirrors the TOML parser shape. parseYamlText returns
Effect<unknown, YamlParseFailed>; parseYamlWith composes Schema."
```

### Task 3.4: Refactor `config/jsonc-settings.ts` (largest)

**Files:**

- Modify: `packages/cli/src/config/jsonc-settings.ts`

- [ ] **Step 1: Read the current file**

Run: `cat packages/cli/src/config/jsonc-settings.ts`

- [ ] **Step 2: Migrate `SettingsMergeResult` and `ParsedSettings` to `Data.TaggedEnum`**

Replace the existing tagged-union interfaces:

```ts
export type SettingsMergeResult = Data.TaggedEnum<{
  Unchanged: {}
  Updated: { readonly text: string }
  Invalid: { readonly message: string }
}>
export const SettingsMergeResult = Data.taggedEnum<SettingsMergeResult>()

export type ParsedSettings = Data.TaggedEnum<{
  Valid: { readonly value: Record<string, unknown>; readonly source: string }
  Invalid: { readonly message: string; readonly source: string }
}>
export const ParsedSettings = Data.taggedEnum<ParsedSettings>()
```

Update constructors throughout the file:

Before: `return { _tag: "Updated", text }`
After: `return SettingsMergeResult.Updated({ text })`

Before: `return { _tag: "Valid", value, source }`
After: `return ParsedSettings.Valid({ value, source })`

- [ ] **Step 3: Replace `switch` statements with `Match`**

For each `switch (result._tag)` or chained `if (result._tag === "...")`, replace with:

```ts
import { Match } from "effect"

Match.value(result).pipe(
  Match.tag("Updated", ({ text }) => /* … */),
  Match.tag("Unchanged", () => /* … */),
  Match.tag("Invalid", ({ message }) => /* … */),
  Match.exhaustive
)
```

- [ ] **Step 4: Wrap exported functions in Effect**

Every exported function that was pure becomes Effect-returning. Parse functions that can fail return `Effect<X, JsoncParseFailed>`. Merge functions that cannot fail return `Effect<X>`.

Example for `parseSettings(text, source)`:

```ts
export const parseSettings = (
  text: string,
  source: string
): Effect.Effect<ParsedSettings, JsoncParseFailed> =>
  Effect.try({
    try: () => {
      const errors: Array<ParseError> = []
      const value = parse(text, errors, {
        /* … */
      })
      if (errors.length > 0) {
        const message = errors.map((e) => printParseErrorCode(e.error)).join("; ")
        return ParsedSettings.Invalid({ message, source })
      }
      return ParsedSettings.Valid({ value: value as Record<string, unknown>, source })
    },
    catch: (cause) => new JsoncParseFailed({ source, cause })
  })
```

(Apply analogous treatment to `mergeSettings`, `addToSetArray`, `formatSettings`, and any other exports.)

- [ ] **Step 5: Update call sites**

Run: `grep -rn "parseSettings\|mergeSettings\|SettingsMergeResult\|ParsedSettings\|addToSetArray\|formatSettings" packages/cli/src/`

Update each site: constructor calls use the new `Data.taggedEnum` form; Effect-returning functions are `yield*`-ed inside `Effect.gen`. Update tests in `config-parsers.test.ts` and any service tests that touch these.

- [ ] **Step 6: Run typecheck and tests**

Run: `bun run --cwd packages/cli typecheck && bun run --cwd packages/cli test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/config/jsonc-settings.ts packages/cli/src/ packages/cli/tests/
git commit -m "Migrate jsonc-settings to TaggedEnum and Effect parsers

SettingsMergeResult and ParsedSettings are now Data.taggedEnum.
Switch statements replaced with Match.value.pipe(Match.tag, Match.exhaustive).
All exported functions return Effect; JsoncParseFailed surfaces parse failures."
```

### Task 3.5: Refactor `config/javascript-source.ts` and `config/typescript-source.ts`

**Files:**

- Modify: `packages/cli/src/config/javascript-source.ts`
- Modify: `packages/cli/src/config/typescript-source.ts`

- [ ] **Step 1: Read each file**

Run: `cat packages/cli/src/config/javascript-source.ts packages/cli/src/config/typescript-source.ts`

- [ ] **Step 2: Wrap parse operations in `Effect.try`**

For each exported parsing function, wrap the parser invocation (jscodeshift or ts-morph) in `Effect.try` mapping to `JavaScriptParseFailed` or `TypeScriptParseFailed` respectively.

Example for `javascript-source.ts`:

```ts
import { Effect } from "effect"
import jscodeshift from "jscodeshift"

import { JavaScriptParseFailed } from "../domain/errors.ts"

export const parseJavaScriptSource = (
  text: string
): Effect.Effect<jscodeshift.Collection, JavaScriptParseFailed> =>
  Effect.try({
    try: () => jscodeshift(text),
    catch: (cause) => new JavaScriptParseFailed({ cause })
  })
```

Apply same pattern to typescript-source.

- [ ] **Step 3: Update call sites**

Run: `grep -rn "parseJavaScriptSource\|parseTypeScriptSource" packages/cli/src/` (substitute the actual exported names from the files).

- [ ] **Step 4: Run typecheck and tests**

Run: `bun run --cwd packages/cli typecheck && bun run --cwd packages/cli test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/config/javascript-source.ts packages/cli/src/config/typescript-source.ts packages/cli/src/
git commit -m "Effect-ify JS and TS source parsers

Wraps jscodeshift and ts-morph entry points in Effect.try with
JavaScriptParseFailed and TypeScriptParseFailed tagged errors."
```

### Task 3.6: Refactor `config/package-json.ts`

**Files:**

- Modify: `packages/cli/src/config/package-json.ts`

- [ ] **Step 1: Read the file**

Run: `cat packages/cli/src/config/package-json.ts`

- [ ] **Step 2: Wrap exports in Effect**

`packageJsonHasDependency` and similar predicates currently use `Option`. Convert exposed functions to return `Effect.Effect<X, JsonParseFailed>`:

```ts
import { Effect } from "effect"

import { JsonParseFailed } from "../domain/errors.ts"

export const parsePackageJson = (
  text: string
): Effect.Effect<Record<string, unknown>, JsonParseFailed> =>
  Effect.try({
    try: () => {
      const value = JSON.parse(text) as unknown
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error("package.json top-level value is not an object")
      }
      return value as Record<string, unknown>
    },
    catch: (cause) => new JsonParseFailed({ cause })
  })

export const packageJsonHasDependency = (
  text: string,
  name: string
): Effect.Effect<boolean, JsonParseFailed> =>
  parsePackageJson(text).pipe(
    Effect.map((pkg) => {
      const deps = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]
      return deps.some((field) => {
        const block = pkg[field]
        return typeof block === "object" && block !== null && !Array.isArray(block) && name in block
      })
    })
  )
```

- [ ] **Step 3: Update call sites**

Run: `grep -rn "packageJsonHasDependency\|parsePackageJson" packages/cli/src/`. Adapt each.

- [ ] **Step 4: Run typecheck and tests**

Run: `bun run --cwd packages/cli typecheck && bun run --cwd packages/cli test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/config/package-json.ts packages/cli/src/
git commit -m "Effect-ify package.json parser

parsePackageJson and packageJsonHasDependency return Effect with
JsonParseFailed instead of swallowing into Option.none."
```

---

## Phase 4 — Audit sweep on existing Effect files

**Goal:** Eliminate remaining anti-patterns in the 61 Effect-using files. Adopt `Effect.fn` for major service methods. One PR.

### Task 4.1: Replace `Effect.Effect<X, unknown>` signatures with `ToolIgnoreCheckFailed`

**Files:**

- Modify: `packages/cli/src/tool-ignores/common.ts`
- Modify: all tool-ignore implementations under `packages/cli/src/tool-ignores/`

- [ ] **Step 1: Update `ToolIgnoreIntegration` shape**

In `packages/cli/src/tool-ignores/common.ts`, change:

```ts
export interface ToolIgnoreIntegration {
  readonly doctor: (cwd: string) => Effect.Effect<ToolIgnoreReport, unknown>
  readonly refresh: (cwd: string) => Effect.Effect<Option.Option<string>, unknown>
}
```

to:

```ts
import { ToolIgnoreCheckFailed } from "../domain/errors.ts"

export interface ToolIgnoreIntegration {
  readonly doctor: (cwd: string) => Effect.Effect<ToolIgnoreReport, ToolIgnoreCheckFailed>
  readonly refresh: (cwd: string) => Effect.Effect<Option.Option<string>, ToolIgnoreCheckFailed>
}
```

- [ ] **Step 2: Audit each tool-ignore implementation**

Run: `grep -rln "ToolIgnoreIntegration" packages/cli/src/tool-ignores/`

For each implementation, narrow the error channel. If the implementation currently relies on `Effect.catch(...) => Effect.succeed(...)` to swallow errors, that already produces a `never` error channel (subtype of `ToolIgnoreCheckFailed`); no change needed.

For implementations that propagate underlying errors (e.g., from FileSystem), map them to `ToolIgnoreCheckFailed` at the boundary:

```ts
someInnerEffect.pipe(
  Effect.mapError((cause) => new ToolIgnoreCheckFailed({ tool: "Cargo", cause }))
)
```

- [ ] **Step 3: Run typecheck**

Run: `bun run --cwd packages/cli typecheck`
Expected: PASS. Any remaining `unknown` channel will surface as a type error and must be tagged.

- [ ] **Step 4: Run idiom check**

Run: `bun run --cwd packages/cli check:idioms`
Expected: no `Effect.Effect<X, unknown>` violations.

- [ ] **Step 5: Run tests**

Run: `bun run --cwd packages/cli test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/tool-ignores/
git commit -m "Tag tool-ignore integration error channels

ToolIgnoreIntegration.doctor and .refresh previously returned
Effect.Effect<X, unknown>. Now typed as ToolIgnoreCheckFailed; each
implementation maps underlying failures to the tagged error at the
integration boundary."
```

### Task 4.2: Sweep raw `process.*`, `console.*`, `throw` inside Effect

**Files:** any flagged by `check:idioms` after Phase 0/1.

- [ ] **Step 1: Run the idiom check**

Run: `bun run --cwd packages/cli check:idioms`

- [ ] **Step 2: Fix each violation**

For each `process.(env|argv|cwd|exit|exitCode)` outside `runtime.ts`:

- If it's a service-level read of env, lift to `Config.option(Config.string(...))` resolved through `RuntimeConfig` or a new dedicated config.
- If it's a CLI-bin entry, leave only the `RuntimeConfig.exit` boundary.

For each `console.(log|warn|error|debug)` outside Ink components and test files:

- Replace with `Effect.log`, `Effect.logWarning`, `Effect.logError`, or `Effect.logDebug`. If the call is inside a non-Effect function, lift the function to return Effect first.

For any `throw new SomeError(...)` inside `Effect.sync(...)` or `Effect.gen(...)`:

- Replace with `yield* Effect.fail(new SomeError(...))` (inside `Effect.gen`) or restructure with `Effect.fail` outside.

- [ ] **Step 3: Run check**

Run: `bun run --cwd packages/cli check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/
git commit -m "Remove raw process/console/throw escapes inside Effect

Routes remaining process.* reads through RuntimeConfig/Config, replaces
console.* with Effect.log*, and converts throws inside Effect.sync/gen
to Effect.fail with tagged errors."
```

### Task 4.3: Adopt `Effect.fn("ServiceName.method")` for major service methods

**Files:**

- Modify: `packages/cli/src/services/git.ts`
- Modify: `packages/cli/src/services/repository-hosts.ts`
- Modify: `packages/cli/src/services/vendor-notes.ts`
- Modify: `packages/cli/src/package-sync/service.ts`
- Modify: `packages/cli/src/project/service.ts`
- Modify: `packages/cli/src/project/surfaces.ts`
- Modify: `packages/cli/src/editors/service.ts`
- Modify: `packages/cli/src/tool-ignores/service.ts`

- [ ] **Step 1: Apply `Effect.fn` to each named service method**

For each service method definition, wrap it with `Effect.fn("ServiceName.methodName")`. Example for `Git.exec`:

Before:

```ts
export class Git extends Context.Service<Git, GitShape>()("ingraft/Git") {}

export const GitLive = Layer.effect(
  Git,
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner
    return {
      exec: (args: ReadonlyArray<string>, options: GitOptions = {}) =>
        Effect.gen(function* () {
          /* … */
        })
    }
  })
)
```

After:

```ts
export const GitLive = Layer.effect(
  Git,
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner
    return {
      exec: Effect.fn("Git.exec")(function* (
        args: ReadonlyArray<string>,
        options: GitOptions = {}
      ) {
        // body, using yield* directly
      })
    }
  })
)
```

`Effect.fn("name")` takes a generator function and produces a regular function whose effect carries the supplied name in spans and stack traces.

For each service file, wrap the public methods (those exposed in the service shape). Internal helpers stay as plain effects.

- [ ] **Step 2: Run typecheck and tests**

Run: `bun run --cwd packages/cli typecheck && bun run --cwd packages/cli test`
Expected: PASS.

- [ ] **Step 3: Run check**

Run: `bun run --cwd packages/cli check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/
git commit -m "Adopt Effect.fn for named service methods

Major service methods on Git, RepositoryHosts, VendorNotes,
PackageVersionSync, ProjectFiles, ProjectSurfaces, EditorSettings,
ToolIgnores wrapped in Effect.fn(\"Service.method\") for v4
stack-trace fidelity."
```

---

## Phase 5 — TUI Effect-ification

**Goal:** TUI subsystem becomes a proper Effect application with a `TuiRenderer` service, `Scope`-managed renderer, `SubscriptionRef` state, and `Stream`-driven keyboard/resize. One PR.

### Task 5.1: Create `TuiRenderer` service

**Files:**

- Create: `packages/cli/src/tui/renderer.ts`

- [ ] **Step 1: Write the service**

Create `packages/cli/src/tui/renderer.ts`:

```ts
import { createCliRenderer, type CliRenderer, type RenderableNode } from "@opentui/core"
import { Context, Effect, Layer, Queue, Scope, Stream } from "effect"

import { TuiRendererFailed } from "../domain/errors.ts"

export interface KeyEvent {
  readonly name: string
  readonly raw: string
  readonly ctrl: boolean
  readonly shift: boolean
  readonly meta: boolean
}

export interface TerminalSize {
  readonly width: number
  readonly height: number
}

export interface TuiRendererShape {
  readonly render: (node: RenderableNode) => Effect.Effect<void>
  readonly terminalSize: Effect.Effect<TerminalSize>
  readonly keyEvents: Stream.Stream<KeyEvent>
  readonly resizeEvents: Stream.Stream<TerminalSize>
  readonly requestExit: (code: number) => Effect.Effect<void>
}

export class TuiRenderer extends Context.Service<TuiRenderer, TuiRendererShape>()(
  "ingraft/TuiRenderer"
) {}

const acquireRenderer = Effect.tryPromise({
  try: () =>
    createCliRenderer({
      clearOnShutdown: true,
      enableMouseMovement: true,
      exitOnCtrlC: true,
      screenMode: "alternate-screen",
      targetFps: 30,
      useMouse: true
    }),
  catch: (cause) => new TuiRendererFailed({ phase: "acquire", cause })
})

const releaseRenderer = (renderer: CliRenderer) => Effect.sync(() => renderer.destroy?.())

const keyStream = (renderer: CliRenderer): Stream.Stream<KeyEvent> =>
  Stream.callback<KeyEvent>((queue) =>
    Effect.gen(function* () {
      const handler = (event: KeyEvent) => {
        Queue.unsafeOffer(queue, event)
      }
      renderer.on?.("keypress", handler)
      yield* Effect.addFinalizer(() => Effect.sync(() => renderer.off?.("keypress", handler)))
    })
  )

const resizeStream = (renderer: CliRenderer): Stream.Stream<TerminalSize> =>
  Stream.callback<TerminalSize>((queue) =>
    Effect.gen(function* () {
      const handler = () => {
        Queue.unsafeOffer(queue, {
          width: renderer.terminalWidth,
          height: renderer.terminalHeight
        })
      }
      renderer.on?.("resize", handler)
      yield* Effect.addFinalizer(() => Effect.sync(() => renderer.off?.("resize", handler)))
    })
  )

export const TuiRendererLive = Layer.scoped(
  TuiRenderer,
  Effect.gen(function* () {
    const renderer = yield* Effect.acquireRelease(acquireRenderer, releaseRenderer)
    return TuiRenderer.of({
      render: Effect.fn("TuiRenderer.render")(function* (node: RenderableNode) {
        yield* Effect.sync(() => {
          const previous = renderer.root.findDescendantById?.("dashboard")
          if (previous !== undefined) renderer.root.remove?.("dashboard")
          renderer.root.add?.(node)
          renderer.requestRender?.()
        })
      }),
      terminalSize: Effect.sync(() => ({
        width: renderer.terminalWidth,
        height: renderer.terminalHeight
      })),
      keyEvents: keyStream(renderer),
      resizeEvents: resizeStream(renderer),
      requestExit: (code: number) =>
        Effect.sync(() => {
          renderer.requestExit?.(code)
        })
    })
  })
)
```

Note: the `renderer.on/off/findDescendantById/remove/add/requestRender/requestExit` calls use optional chaining because the `@opentui/core` API is third-party — preserve whatever method names exist on the actual `CliRenderer` instance. Adapt to the real shape by reading the existing `tui/app.ts` and `tui/render.ts` to see what's actually invoked.

- [ ] **Step 2: Run typecheck**

Run: `bun run --cwd packages/cli typecheck`
Expected: PASS (or surfaces real shape mismatches against `@opentui/core` to fix).

- [ ] **Step 3: Commit (intermediate — no behavior change yet)**

```bash
git add packages/cli/src/tui/renderer.ts
git commit -m "Add TuiRenderer service wrapping @opentui/core

Context.Service exposing render, terminalSize, keyEvents and resizeEvents
Streams, and requestExit. TuiRendererLive uses Layer.scoped with
Effect.acquireRelease for clean teardown on scope close."
```

### Task 5.2: Migrate `DashboardAction` to `Data.TaggedEnum`

**Files:**

- Modify: `packages/cli/src/tui/dashboard.ts`

- [ ] **Step 1: Read the current file**

Run: `cat packages/cli/src/tui/dashboard.ts`

- [ ] **Step 2: Replace the hand-rolled action union**

Identify the existing `DashboardAction` union (likely `{ type: "refresh"; … } | { type: "cancel" } | …`). Migrate:

```ts
import { Data } from "effect"

export type DashboardAction = Data.TaggedEnum<{
  Refresh: { readonly message: string; readonly snapshot: DashboardSnapshot }
  Cancel: {}
  // … one variant per existing action type, keys preserved by name (use PascalCase)
}>
export const DashboardAction = Data.taggedEnum<DashboardAction>()
```

(Use the actual existing variant fields. Rename `type` → `_tag` via `Data.taggedEnum`; constructor sites become `DashboardAction.Refresh({ message, snapshot })`.)

- [ ] **Step 3: Replace `switch` with `Match`**

For each `switch (action.type)` (or `switch (action._tag)` if already renamed), replace with `Match.value(action).pipe(Match.tag(...), Match.exhaustive)`.

- [ ] **Step 4: Wrap pure dashboard functions in `Effect.sync`**

`createDashboardState`, `dispatchDashboard`, `commandPlanForSelection` — each becomes:

```ts
export const dispatchDashboard = (
  state: DashboardState,
  action: DashboardAction
): Effect.Effect<DashboardState> =>
  Effect.sync(() => {
    // existing pure body
  })
```

- [ ] **Step 5: Update call sites within tui/**

`tui/app.ts`, `tui/keyboard.ts`, `tui/cli-adapter.ts` all reference these. Mark them for update in subsequent tasks.

- [ ] **Step 6: Run typecheck**

Run: `bun run --cwd packages/cli typecheck`
Expected: many call-site errors (call sites in app.ts/keyboard.ts/cli-adapter.ts will fail). These get resolved in the next tasks. Do not commit yet — proceed.

### Task 5.3: Effect-ify `tui/status.ts`, `tui/keyboard.ts`, `tui/render.ts`, `tui/cli-adapter.ts`

**Files:**

- Modify: `packages/cli/src/tui/status.ts`
- Modify: `packages/cli/src/tui/keyboard.ts`
- Modify: `packages/cli/src/tui/render.ts`
- Modify: `packages/cli/src/tui/cli-adapter.ts`

- [ ] **Step 1: Wrap `tui/status.ts` exports in `Effect.sync`**

Read it (`cat packages/cli/src/tui/status.ts`) and wrap each exported helper:

```ts
import { Effect } from "effect"

export const formatStatus = (snapshot: Snapshot): Effect.Effect<string> =>
  Effect.sync(() => /* existing body */)
```

- [ ] **Step 2: Wrap `tui/keyboard.ts` handler in Effect**

`handleDashboardKey(state, event)` becomes:

```ts
import { Effect, Option } from "effect"

export const handleDashboardKey = (
  state: DashboardState,
  event: KeyEvent
): Effect.Effect<Option.Option<DashboardAction>> =>
  Effect.sync(() => {
    // existing body, but instead of returning `DashboardAction | null`,
    // return Option.some(action) or Option.none()
  })
```

If the existing function returned `DashboardAction | null` or similar, adapt to `Option.Option<DashboardAction>` (more idiomatic).

- [ ] **Step 3: Wrap `tui/render.ts` `renderDashboard` in Effect**

```ts
import { Effect } from "effect"
import type { RenderableNode } from "@opentui/core"

export const renderDashboard = (
  state: DashboardState,
  size: TerminalSize
): Effect.Effect<RenderableNode> =>
  Effect.sync(() => {
    // existing body that produces a RenderableNode using @opentui/core APIs
  })
```

- [ ] **Step 4: Convert `tui/cli-adapter.ts` to Effect**

`readSnapshot` and `runCommandPlan` currently use async/await with direct service access. Convert to:

```ts
import { Effect } from "effect"

import { ProjectFiles } from "../project/service.ts"
import { repoRoot } from "../services/git.ts"

export const readSnapshot = Effect.gen(function* () {
  const cwd = yield* repoRoot
  const projectFiles = yield* ProjectFiles
  // read snapshot using yield* …
  return { snapshot, message }
})

export const runCommandPlan = (plans: ReadonlyArray<CommandPlan>) =>
  Effect.gen(function* () {
    // … execute each plan as Effect …
  })
```

- [ ] **Step 5: Run typecheck**

Run: `bun run --cwd packages/cli typecheck`
Expected: remaining errors in `tui/app.ts` and `tui/launcher.ts` only. Status/keyboard/render/cli-adapter should typecheck now.

### Task 5.4: Rebuild `tui/app.ts` as Effect

**Files:**

- Modify: `packages/cli/src/tui/app.ts`

- [ ] **Step 1: Read the current file**

Run: `cat packages/cli/src/tui/app.ts`

- [ ] **Step 2: Replace with Effect-driven loop**

Replace the contents of `packages/cli/src/tui/app.ts` with:

```ts
import { Effect, Option, Stream, SubscriptionRef } from "effect"

import { readSnapshot, runCommandPlan } from "./cli-adapter.ts"
import {
  commandPlanForSelection,
  createDashboardState,
  dispatchDashboard,
  DashboardAction,
  type DashboardState
} from "./dashboard.ts"
import { handleDashboardKey } from "./keyboard.ts"
import { renderDashboard } from "./render.ts"
import { TuiRenderer } from "./renderer.ts"

export const runTuiApp = Effect.gen(function* () {
  const renderer = yield* TuiRenderer
  const initial = yield* readSnapshot
  const initialState = yield* createDashboardState(initial.snapshot)
  const stateRef = yield* SubscriptionRef.make(initialState)

  const renderLoop = stateRef.changes.pipe(
    Stream.runForEach((state) =>
      renderer.terminalSize.pipe(
        Effect.flatMap((size) => renderDashboard(state, size)),
        Effect.flatMap(renderer.render)
      )
    )
  )

  const keyLoop = renderer.keyEvents.pipe(
    Stream.runForEach((event) =>
      Effect.gen(function* () {
        const current = yield* SubscriptionRef.get(stateRef)
        const action = yield* handleDashboardKey(current, event)
        if (Option.isNone(action)) return

        // If the action is "Run", execute the selected plan; otherwise just dispatch.
        if (action.value._tag === "Run") {
          const plans = yield* commandPlanForSelection(current)
          if (plans.length === 0) {
            const next = yield* dispatchDashboard(current, DashboardAction.Cancel())
            yield* SubscriptionRef.set(stateRef, next)
            return
          }
          yield* runCommandPlan(plans)
          const refreshed = yield* readSnapshot
          const next = yield* dispatchDashboard(
            current,
            DashboardAction.Refresh({ message: refreshed.message, snapshot: refreshed.snapshot })
          )
          yield* SubscriptionRef.set(stateRef, next)
          return
        }

        const next = yield* dispatchDashboard(current, action.value)
        yield* SubscriptionRef.set(stateRef, next)
      })
    )
  )

  const resizeLoop = renderer.resizeEvents.pipe(
    Stream.runForEach(() =>
      SubscriptionRef.get(stateRef).pipe(
        Effect.flatMap((state) =>
          renderer.terminalSize.pipe(
            Effect.flatMap((size) => renderDashboard(state, size)),
            Effect.flatMap(renderer.render)
          )
        )
      )
    )
  )

  yield* Effect.fork(renderLoop)
  yield* Effect.fork(resizeLoop)
  yield* keyLoop
}).pipe(Effect.scoped)
```

Notes:

- `stateRef.changes` is a `Stream<State>` that emits the current value and every subsequent change.
- `renderLoop` and `resizeLoop` are forked so the main fiber runs `keyLoop`. The Scope ends when `keyLoop` finishes (e.g., the user presses Q or Ctrl+C).
- Adapt `DashboardAction.Run` to whatever your existing "run selection" action tag is named.

- [ ] **Step 3: Run typecheck**

Run: `bun run --cwd packages/cli typecheck`
Expected: PASS (or only `tui/launcher.ts` and `tui/runner.ts` remain).

### Task 5.5: Effect-ify `tui/launcher.ts`

**Files:**

- Modify: `packages/cli/src/tui/launcher.ts`

- [ ] **Step 1: Read the current file**

Run: `cat packages/cli/src/tui/launcher.ts`

- [ ] **Step 2: Rewrite using `ChildProcessSpawner`**

Replace contents with:

```ts
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { Effect } from "effect"
import { ChildProcessSpawner } from "effect/unstable/process"

import { RuntimeConfig } from "../app/runtime.ts"
import { BunRuntimeMissing, TuiLaunchFailed } from "../domain/errors.ts"

export interface TuiLaunchPlan {
  readonly _tag: "direct" | "spawn"
  readonly args: ReadonlyArray<string>
  readonly command?: string
}

export interface LaunchTuiOptions {
  readonly args?: ReadonlyArray<string>
  readonly bunCommand?: string
  readonly isBunRuntime?: boolean
  readonly moduleUrl?: string
}

const moduleExtensionSync = (moduleUrl: string): ".js" | ".ts" =>
  fileURLToPath(moduleUrl).endsWith(".ts") ? ".ts" : ".js"

export const moduleExtension = (moduleUrl: string): Effect.Effect<".js" | ".ts"> =>
  Effect.sync(() => moduleExtensionSync(moduleUrl))

export const siblingModulePath = (moduleUrl: string, name: string): Effect.Effect<string> =>
  Effect.sync(() =>
    resolve(dirname(fileURLToPath(moduleUrl)), `${name}${moduleExtensionSync(moduleUrl)}`)
  )

export const tuiLaunchPlan = ({
  args = [],
  bunCommand = "bun",
  isBunRuntime = "bun" in process.versions,
  moduleUrl = import.meta.url
}: LaunchTuiOptions = {}): Effect.Effect<TuiLaunchPlan> =>
  Effect.gen(function* () {
    if (isBunRuntime) return { _tag: "direct" as const, args }
    const runnerPath = yield* siblingModulePath(moduleUrl, "runner")
    return { _tag: "spawn" as const, args: [runnerPath, ...args], command: bunCommand }
  })

export const launchTui = (
  options: LaunchTuiOptions = {}
): Effect.Effect<void, BunRuntimeMissing | TuiLaunchFailed, ChildProcessSpawner | RuntimeConfig> =>
  Effect.gen(function* () {
    const plan = yield* tuiLaunchPlan(options)
    if (plan._tag === "direct") {
      const mod = yield* Effect.tryPromise({
        try: () => import("./app.ts"),
        catch: (cause) => new TuiLaunchFailed({ command: "direct import", cause })
      })
      // mod.runTuiApp is the Effect; provide TuiRenderer at the call boundary.
      yield* mod.runTuiApp
      return
    }
    const spawner = yield* ChildProcessSpawner
    const runtime = yield* RuntimeConfig
    const child = yield* spawner
      .spawn(plan.command ?? "bun", { args: [...plan.args], stdio: "inherit" })
      .pipe(
        Effect.mapError((cause) => {
          const code = (cause as { code?: string } | null)?.code
          if (code === "ENOENT") return new BunRuntimeMissing({})
          return new TuiLaunchFailed({ command: plan.command ?? "bun", cause })
        })
      )
    const exitCode = yield* child.exitCode
    yield* runtime.exit(typeof exitCode === "number" ? exitCode : 1)
  })
```

Note: adapt the `ChildProcessSpawner.spawn` signature to the actual v4 API exposed by `effect/unstable/process`. Inspect `node_modules/.bun/effect@4.0.0-beta.66/node_modules/effect/dist/unstable/process/ChildProcessSpawner.d.ts` for the precise method names and return shapes.

- [ ] **Step 3: Run typecheck**

Run: `bun run --cwd packages/cli typecheck`
Expected: surfaces any mismatches against the real `ChildProcessSpawner` API. Adjust call shape until clean.

### Task 5.6: Effect-ify `tui/runner.ts`

**Files:**

- Modify: `packages/cli/src/tui/runner.ts`

- [ ] **Step 1: Replace with the Effect entry**

Replace contents of `packages/cli/src/tui/runner.ts` with:

```ts
import { NodeRuntime } from "@effect/platform-node"
import { Effect, Logger } from "effect"

import { LiveLayer } from "../app/layers.ts"
import { runTuiApp } from "./app.ts"
import { TuiRendererLive } from "./renderer.ts"

const main = runTuiApp.pipe(
  Effect.provide(Logger.pretty),
  Effect.provide(TuiRendererLive),
  Effect.provide(LiveLayer)
)

NodeRuntime.runMain(main)
```

- [ ] **Step 2: Update `commands/tui.ts`**

Replace `packages/cli/src/commands/tui.ts` `openTui` to use the new Effect-native `launchTui`:

```ts
import { Effect } from "effect"

import { launchTui } from "../tui/launcher.ts"

export const openTui = launchTui().pipe(Effect.withSpan("ingraft.openTui"))
```

Adapt `tuiCmd` to use the new `openTui`; its shape stays the same (CLI command wrapping the Effect).

- [ ] **Step 3: Add `TuiLayer` to `app/layers.ts`**

In `packages/cli/src/app/layers.ts`, add:

```ts
import { TuiRendererLive } from "../tui/renderer.ts"

export const TuiLayer = Layer.mergeAll(TuiRendererLive, LiveLayer)
```

- [ ] **Step 4: Run typecheck and full check**

Run: `bun run --cwd packages/cli check`
Expected: PASS.

### Task 5.7: Update `tui-launcher.test.ts` and `tui-status.test.ts`

**Files:**

- Modify: `packages/cli/tests/tui-launcher.test.ts`
- Modify: `packages/cli/tests/tui-status.test.ts`

- [ ] **Step 1: Update `tui-launcher.test.ts`**

Replace contents of `packages/cli/tests/tui-launcher.test.ts` with:

```ts
import { describe, expect, test } from "bun:test"
import { pathToFileURL } from "node:url"
import { Effect } from "effect"

import { siblingModulePath, tuiLaunchPlan } from "../src/tui/launcher.ts"

describe("tui launcher", () => {
  test("uses a Bun child process for built Node executions", () => {
    const moduleUrl = pathToFileURL("/repo/packages/cli/dist/src/tui/launcher.js").href
    const plan = Effect.runSync(
      tuiLaunchPlan({ args: ["--debug"], isBunRuntime: false, moduleUrl })
    )
    expect(plan).toEqual({
      _tag: "spawn",
      args: ["/repo/packages/cli/dist/src/tui/runner.js", "--debug"],
      command: "bun"
    })
  })

  test("preserves TypeScript source paths during workspace development", () => {
    const moduleUrl = pathToFileURL("/repo/packages/cli/src/tui/launcher.ts").href
    expect(Effect.runSync(siblingModulePath(moduleUrl, "runner"))).toBe(
      "/repo/packages/cli/src/tui/runner.ts"
    )
  })

  test("runs directly when the CLI itself is already running in Bun", () => {
    const plan = Effect.runSync(tuiLaunchPlan({ isBunRuntime: true }))
    expect(plan).toEqual({ _tag: "direct", args: [] })
  })
})
```

- [ ] **Step 2: Update `tui-status.test.ts`**

Wrap every assertion that called the formatters with `Effect.runSync`. Read the file first, adapt mechanically.

- [ ] **Step 3: Run the tests**

Run: `bun test packages/cli/tests/tui-launcher.test.ts packages/cli/tests/tui-status.test.ts`
Expected: PASS.

### Task 5.8: Add `tui-runtime.test.ts` integration test

**Files:**

- Create: `packages/cli/tests/tui-runtime.test.ts`

- [ ] **Step 1: Write the integration test**

Create `packages/cli/tests/tui-runtime.test.ts`:

```ts
import { describe, expect, test } from "bun:test"
import { Effect, Layer, Ref, Stream, TestContext } from "effect"

import { runTuiApp } from "../src/tui/app.ts"
import { TuiRenderer, type KeyEvent, type TerminalSize } from "../src/tui/renderer.ts"
// Import any service layers the test needs (ProjectFiles stub, Git stub, etc.)
// using existing test helpers in tests/helpers if available.

const scriptedKeys = (events: ReadonlyArray<KeyEvent>): Stream.Stream<KeyEvent> =>
  Stream.fromIterable(events)

const fixedSize: TerminalSize = { width: 80, height: 24 }

const renderCalls: Array<unknown> = []

const StubTuiRenderer = Layer.succeed(
  TuiRenderer,
  TuiRenderer.of({
    render: (node) =>
      Effect.sync(() => {
        renderCalls.push(node)
      }),
    terminalSize: Effect.succeed(fixedSize),
    keyEvents: scriptedKeys([
      { name: "down", raw: "[B", ctrl: false, shift: false, meta: false },
      { name: "down", raw: "[B", ctrl: false, shift: false, meta: false },
      { name: "q", raw: "q", ctrl: false, shift: false, meta: false }
    ]),
    resizeEvents: Stream.empty,
    requestExit: () => Effect.void
  })
)

describe("runTuiApp", () => {
  test("processes keys and renders the dashboard", async () => {
    renderCalls.length = 0
    const program = runTuiApp.pipe(
      Effect.provide(StubTuiRenderer)
      // also provide stubbed ProjectFiles/Git layers using existing test helpers
    )
    await Effect.runPromise(program)
    expect(renderCalls.length).toBeGreaterThan(0)
  })
})
```

This is a skeleton — the test needs to also stub `ProjectFiles`, `Git`, etc., for `readSnapshot` and `runCommandPlan`. Use whatever stub layers already exist in `tests/helpers/`. If none exist, add a `tests/helpers/tui-layers.ts` helper that exposes minimal stubs.

- [ ] **Step 2: Run the test**

Run: `bun test packages/cli/tests/tui-runtime.test.ts`
Expected: PASS (or surfaces a real bug in the new TUI flow, which gets fixed).

- [ ] **Step 3: Manual Ctrl+C verification**

Run: `bun run --cwd packages/cli dev` (assuming this opens the TUI) — actually:

```bash
bun run --cwd packages/cli build
node packages/cli/dist/bin/ingraft.js
```

Wait for the TUI to appear, then press Ctrl+C.
Expected: terminal returns to normal alternate-screen-cleared state; no orphaned renderer process; exit code 0 or 130 (SIGINT).

- [ ] **Step 4: Run full check**

Run: `bun run --cwd packages/cli check`
Expected: PASS.

- [ ] **Step 5: Commit (Phase 5 final)**

```bash
git add packages/cli/src/tui/ packages/cli/src/app/layers.ts packages/cli/src/commands/tui.ts packages/cli/tests/tui-launcher.test.ts packages/cli/tests/tui-status.test.ts packages/cli/tests/tui-runtime.test.ts
git commit -m "Effect-ify the TUI subsystem

Introduces TuiRenderer service (Context.Service + Layer.scoped) wrapping
@opentui/core with acquireRelease lifecycle and Stream-driven keyboard/
resize input. Dashboard state is now a SubscriptionRef whose changes
stream drives renders. tui/launcher.ts uses ChildProcessSpawner.
tui-runtime integration test drives the loop through a stubbed renderer.
Ctrl+C cleanup verified manually."
```

---

## Final verification

- [ ] **Step 1: Run full check from the workspace root**

Run: `bun run check`
Expected: PASS — lint, format, typecheck, idiom check, all tests pass.

- [ ] **Step 2: Smoke test `ingraft init`**

Run:

```bash
cd /tmp && rm -rf ingraft-smoke && mkdir ingraft-smoke && cd ingraft-smoke && git init
node /Users/a12907/Documents/GitHub/ingraft/packages/cli/dist/bin/ingraft.js init
```

Expected: identical output to pre-refactor (you may want to capture pre-refactor output in Phase 0 to diff later).

- [ ] **Step 3: Smoke test TUI**

Run: `node packages/cli/dist/bin/ingraft.js` from inside a fresh git repo.
Expected: TUI opens; arrow keys navigate; Q or Ctrl+C exits cleanly with terminal restored.

- [ ] **Step 4: Tag the refactor commit**

(Optional, if you tag releases.) Bump version in `package.json` if appropriate to your release cadence.
