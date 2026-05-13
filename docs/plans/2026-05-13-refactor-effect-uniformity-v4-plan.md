---
title: "Refactor: idiomatic Effect v4 uniformity across CLI"
type: refactor
date: 2026-05-13
---

# Refactor: idiomatic Effect v4 uniformity across CLI

## Overview

Make every function in `packages/cli/src/` return an `Effect`-family value (`Effect`, `Stream`, `Layer`, `Scope`-managed resource), targeting v4 idioms throughout. The codebase is already substantially v4-migrated (`Context.Service`, `effect/unstable/cli`, `effect/unstable/process`, `Data.TaggedError`, `Schema` from core, `Result` instead of `Either`). The one consistent v3 leftover is `Effect.catchAll` (22 sites). This refactor finishes the v4 migration in Phase 0 and then expands Effect coverage to the remaining non-Effect code in Phases 1–5.

The user has explicitly chosen full uniformity over Effect's own "keep pure things pure" guidance. Pure helpers used in Effect contexts (e.g., `scriptRelTo`) get wrapped in `Effect.sync` even when this adds ceremony at call sites. The cost is acknowledged.

CLI public behavior is unchanged: same flags, same exit codes, same output. This is a pure refactor.

## Goals

1. Every exported function in scope returns an `Effect`-family type.
2. Every error channel has a concrete tagged-union type. No `Effect.Effect<X, unknown>`.
3. All code uses v4 idioms (`Context.Service`, `Effect.catch`, `Scope.provide`, `Result`, `Schema` from core, `effect/unstable/*` where applicable).
4. Side-effecting reads of `process.*` and env vars live behind `RuntimeConfig` or `Config`, not in random files.
5. The TUI subsystem becomes a proper Effect runtime with `Scope`-managed renderer, `SubscriptionRef` state, and `Stream`-driven keyboard/resize input.
6. Major service methods adopt `Effect.fn("name")` for v4 stack-trace fidelity.

## Non-goals

- **Ink React components** (`app/ink/*.tsx`). React owns rendering; Effect orchestrators call them via `Effect.tryPromise(() => renderInkOnce(...))`. Effect-ifying React props is incoherent.
- **Static `MonorepoToolDefinition` exports** (`tool-ignores/monorepo/**/*.ts`, 13 files). These are data — object literals whose methods already return Effect. The data declarations have no function bodies to convert.
- **`index.ts` re-export barrels.**
- **`domain/constants.ts`, `app/theme.ts`.** Const-only.
- **`domain/errors.ts`.** Class declarations only (new classes will be added).
- **Behavioral changes.** Same UX, same exit codes, same output.

## Current state (v4 migration status)

| v3 idiom                                            | Files remaining                                                                                                             |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `Effect.Service`                                    | 0                                                                                                                           |
| `@effect/cli` imports                               | 0                                                                                                                           |
| `@effect/platform"` (core, non-`-node`)             | 0                                                                                                                           |
| `@effect/schema`                                    | 0                                                                                                                           |
| `Context.Tag` / `Context.GenericTag`                | 0                                                                                                                           |
| `Either` (renamed to `Result`)                      | 0                                                                                                                           |
| `Scope.extend`                                      | 0                                                                                                                           |
| `FiberRef` (renamed to `Context.Reference`)         | 0                                                                                                                           |
| `Effect.catchAll` → `Effect.catch`                  | **9 files, 22 sites**                                                                                                       |
| `Effect.promise` (prefer typed `Effect.tryPromise`) | 10 sites (9 Ink renderer wrappers + 1 prompt input read; `commands/tui.ts:7` is the TUI launcher and disappears in Phase 5) |

Files still using `Effect.catchAll`:

- `services/git.ts:130, 198`
- `services/repository-hosts.ts:44`
- `services/vendor-notes.ts:58, 86`
- `domain/vendor-state.ts:431`
- `context-tools/service.ts:158`
- `package-sync/service.ts:361, 482, 597, 626, 687, 721, 769, 851, 969, 999`
- `package-sync/version-detect.ts:41`
- `project/languages.ts:147, 175, 186`
- `tool-ignores/language-analyzers/typescript.ts:39`

## Signature conventions

| Original shape                              | New shape                                                                                | Notes                                                                              |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `(args) => X` pure deterministic            | `(args) => Effect.Effect<X>` via `Effect.sync`                                           | Adds `yield*` at call sites.                                                       |
| `(args) => Option<X>` from a parser         | `(args) => Effect.Effect<X, ParseError>`                                                 | Surfaces previously-swallowed parse failures. Tagged error replaces `Option.none`. |
| `(args) => boolean` swallowing parse errors | `(args) => Effect.Effect<boolean, ParseError>`                                           | Callers that want the swallow can `Effect.orElseSucceed(() => false)`.             |
| `async (args) => Promise<X>`                | `(args) => Effect.Effect<X, TaggedError, R>` via `Effect.tryPromise` or platform service | No bare `Effect.promise` for fallible work.                                        |
| Mutable `let state` in long-lived flow      | `SubscriptionRef<State>`                                                                 | Required for `Stream`-driven updates.                                              |
| Imperative event listeners                  | `Stream<Event>` via `Stream.async`                                                       | Composable, cancellation-aware.                                                    |
| Acquired resources                          | `Effect.acquireRelease` inside `Scope`                                                   | Guaranteed cleanup via `Layer.scoped`.                                             |
| Named service methods                       | `Effect.fn("ServiceName.method")(...)`                                                   | Better v4 stack traces.                                                            |

## Non-negotiable invariants

1. No `Effect.Effect<X, unknown>`. Every error channel is a concrete tagged-union type.
2. No raw `process.env`, `process.argv`, `process.cwd`, `process.exit`, `process.exitCode` outside `app/runtime.ts` (`RuntimeConfig` service).
3. No bare `throw` inside `Effect.sync` / `Effect.gen`. Use `Effect.fail(new TaggedError(...))`.
4. No v3-renamed APIs: `Effect.catchAll`, `Effect.catchAllCause`, `Effect.catchAllDefect`, `Effect.catchSome`, `Effect.Service`, `Context.Tag`, `Context.GenericTag`, `Scope.extend`, `Either`, `FiberRef`. (Enforced via lint guard.)
5. No `@effect/cli`, `@effect/platform"` (core), or `@effect/schema` imports. (Enforced via lint guard.) `@effect/platform-node` is allowed; it remains a separate package in v4.

## New tagged errors

Added to `domain/errors.ts`:

```ts
export class TomlParseFailed extends Data.TaggedError("TomlParseFailed")<{
  readonly source?: string
  readonly cause: unknown
}> {}
// Same shape: YamlParseFailed, JsonParseFailed, JsoncParseFailed,
// JavaScriptParseFailed, TypeScriptParseFailed.

export class SchemaDecodeFailed extends Data.TaggedError("SchemaDecodeFailed")<{
  readonly source: string
  readonly issue: SchemaIssue.SchemaIssue
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

All extend the `VendorError` union, get cases in `errorPresentation` / `exitCodeOf`, and are listed in `cli.tsx`'s `Effect.catchTags(...)`.

## New service: `TuiRenderer`

Encapsulates `@opentui/core` so the TUI loop is testable and the renderer lifecycle is scope-managed.

```ts
export interface TuiRendererShape {
  readonly render: (node: RenderableNode) => Effect.Effect<void>
  readonly terminalSize: Effect.Effect<{ readonly width: number; readonly height: number }>
  readonly keyEvents: Stream.Stream<KeyEvent>
  readonly resizeEvents: Stream.Stream<{ readonly width: number; readonly height: number }>
  readonly requestExit: (code: number) => Effect.Effect<void>
}

export class TuiRenderer extends Context.Service<TuiRenderer, TuiRendererShape>()(
  "ingraft/TuiRenderer"
) {}

export const TuiRendererLive = Layer.scoped(
  TuiRenderer,
  Effect.gen(function* () {
    const renderer = yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: () =>
          createCliRenderer({
            backgroundColor: colors.background,
            clearOnShutdown: true,
            enableMouseMovement: true,
            exitOnCtrlC: true,
            screenMode: "alternate-screen",
            targetFps: 30,
            useMouse: true
          }),
        catch: (cause) => new TuiRendererFailed({ phase: "acquire", cause })
      }),
      (r) => Effect.sync(() => r.destroy?.())
    )
    return TuiRenderer.of({
      render: Effect.fn("TuiRenderer.render")((node) =>
        Effect.sync(() => {
          /* mount/replace node and requestRender */
        })
      ),
      terminalSize: Effect.sync(() => ({
        width: renderer.terminalWidth,
        height: renderer.terminalHeight
      })),
      keyEvents: Stream.async<KeyEvent>((emit) => {
        /* attach handler; cleanup */
      }),
      resizeEvents: Stream.async<{ width: number; height: number }>(/* … */),
      requestExit: (code) => Effect.sync(() => renderer.requestExit?.(code))
    })
  })
)
```

A separate `TuiLayer = Layer.mergeAll(TuiRendererLive, LiveLayer)` is provided to the TUI entry point.

## Parser pattern (Schema-aware)

Each `config/*.ts` file exposes a raw text-parse Effect plus a schema-validating combinator:

```ts
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
        Schema.decodeUnknown(schema)(value).pipe(
          Effect.mapError((issue) => new SchemaDecodeFailed({ source: "toml", issue }))
        )
      )
    )
```

Same shape for YAML, JSONC, JS/TS source extraction. `jsonc-settings.ts` result types migrate to `Data.TaggedEnum`:

```ts
export type SettingsMergeResult = Data.TaggedEnum<{
  Unchanged: {}
  Updated: { readonly text: string }
  Invalid: { readonly message: string }
}>
export const SettingsMergeResult = Data.taggedEnum<SettingsMergeResult>()
```

Pattern-matching on results uses `Match.value(...).pipe(Match.tag(...), Match.exhaustive)`.

## Phases

Each phase is independently mergeable. `bun run check` (lint + format + typecheck + test) must be clean before merging each phase.

### Phase 0 — Finish v4 cleanup

- Rename all 22 `Effect.catchAll` → `Effect.catch` sites in the 9 files listed above.
- Add lint/grep CI guard rejecting v3-named APIs and v3 import paths (see Invariants 4 and 5).
- **Files touched:** ~10. **Behavior change:** none.

### Phase 1 — Foundation: errors and Config

- Add new `Data.TaggedError` classes to `domain/errors.ts`.
- Extend `VendorError`, `errorPresentation`, `exitCodeOf`.
- Register new tags in `cli.tsx`'s `Effect.catchTags`.
- Replace the dropped `colors` field in `RuntimeConfig` with an `Effect.Config`-driven resolution (read `NO_COLOR`, `FORCE_COLOR`, `TERM` through `Config.option(Config.string(...))`).
- Convert the 9 Ink-render/mount `Effect.promise(...)` sites (`cli.tsx:78`, `app/log.tsx:18`, `commands/deps.tsx:221`, `commands/doctor.tsx:157`, `commands/add.tsx:1012,1028`, `commands/list.tsx:69`, `services/prompts.tsx:66`) to `Effect.tryPromise` mapping to `InkRenderFailed`.
- Convert the async prompt-input site (`services/prompts.tsx:69`) to `Effect.tryPromise` mapping to `PromptInputFailed`.
- The remaining `Effect.promise(() => launchTui())` site (`commands/tui.ts:7`) is left for Phase 5, which replaces `launchTui` with a native Effect.
- **Files touched:** ~7. **Tests:** existing pass; add cases for `InkRenderFailed` and `PromptInputFailed` propagation.

### Phase 2 — Pure helper Effect-ification

- `project/script.ts`: wrap `scriptRelTo`, `bunInvocation`, `commandInvocation` in `Effect.sync`.
- Update all call sites (`commands/init.ts`, `project/agent-docs.ts`, etc., all already in `Effect.gen`) to `yield*` the new Effects.
- Update `script.test.ts` to use `Effect.runSync`.
- **Files touched:** ~6. **Tests:** `script.test.ts` adapted.

### Phase 3 — Config parser refactor with Schema

- Convert `config/toml.ts`, `config/yaml.ts`, `config/jsonc-settings.ts`, `config/javascript-source.ts`, `config/typescript-source.ts`, `config/package-json.ts` to the `parseXText` + `parseXWith` pattern.
- Migrate `jsonc-settings.ts` tagged unions to `Data.TaggedEnum` and `switch` to `Match`.
- Update all call sites (`editors/*.ts`, `tool-ignores/*.ts`, `project/*.ts`) to `yield*` the new Effects.
- Define Schema types for the structured config shapes (e.g., `package.json`, `tsconfig.json` subsets) as needed by call sites.
- Update `config-parsers.test.ts` and dependent service tests.
- **Files touched:** ~12–15. **Tests:** parser tests adapted plus new cases that assert tagged failures on malformed input.

### Phase 4 — Audit sweep on existing Effect files

Apply mechanical fixes across all 61 Effect-using files:

1. Replace any remaining `Effect.promise(...)` with `Effect.tryPromise({ try, catch })` mapping to a concrete tagged error.
2. Replace stray `console.*` outside `app/ink/**` with `Effect.log*` or remove.
3. Move any `process.(env|argv|cwd|exit|exitCode)` access outside `app/runtime.ts` behind `RuntimeConfig` or `Config`.
4. Replace any raw `throw new ...` inside `Effect.sync`/`Effect.gen` with `Effect.fail(new TaggedError(...))`.
5. Replace `Effect.Effect<X, unknown>` signatures (notably `ToolIgnoreIntegration.doctor`/`refresh` in `tool-ignores/common.ts`) with `ToolIgnoreCheckFailed`.
6. Adopt `Effect.fn("ServiceName.method")` for major service methods in `Git`, `ProjectFiles`, `ProjectSurfaces`, `EditorSettings`, `ToolIgnores`, `RepositoryHosts`, `PackageVersionSync`.

Lint guard from Phase 0 is the durable enforcer.

- **Files touched:** ~15. **Tests:** type-level changes mostly; existing tests pass.

### Phase 5 — TUI Effect-ification

- Add `TuiRenderer` service + `TuiRendererLive` + `TuiLayer`.
- Convert `tui/runner.ts`, `tui/launcher.ts`, `tui/app.ts`, `tui/cli-adapter.ts`, `tui/dashboard.ts`, `tui/keyboard.ts`, `tui/render.ts`, `tui/status.ts`.
- `tui/app.ts`: `let state` → `SubscriptionRef`; render closure → `state.changes.pipe(Stream.runForEach(...))` forked in scope; keyboard handling → `renderer.keyEvents.pipe(Stream.runForEach(...))`.
- `tui/launcher.ts`: `spawnSync` → `CommandExecutor`. ENOENT → `BunRuntimeMissing`. `process.exitCode = ...` → `RuntimeConfig.exit(code)`. Drop `options.spawn` injection; tests use a stub `CommandExecutor` layer.
- Migrate `DashboardAction` to `Data.TaggedEnum`; replace `switch` with `Match`.
- Adopt `Effect.fn("Tui.method")` for service methods.
- Update `tui-launcher.test.ts`, `tui-status.test.ts`.
- Add `tui-runtime.test.ts`: drive a scripted `Stream<KeyEvent>` through a stub `TuiRenderer` layer to assert dashboard state transitions and rendered output.
- **Files touched:** ~10. **Tests:** TUI tests rewritten; one new integration test added.

## Testing strategy

- Per-phase gate: `bun run check` clean before merge.
- New cases in `config-parsers.test.ts` asserting tagged failures on malformed input (today these silently return `Option.none`/`false`).
- New `tui-runtime.test.ts`: stubbed `TuiRenderer` layer with `Stream.fromIterable([key1, key2, ...])` as `keyEvents`; assert observed state via `SubscriptionRef.get`. Use `TestClock` for time-driven dashboard logic.
- Smoke verification: `ingraft init` against a temp git repo produces identical output to pre-refactor.

## Lint guards (durable)

Add to CI (custom grep step in `bun run check` or oxlint plugin if available). Failing patterns:

- `Effect\.promise\(` — typed `Effect.tryPromise` required.
- `Effect\.catchAll\b`, `Effect\.catchAllCause`, `Effect\.catchAllDefect`, `Effect\.catchSome\b` — v3 names.
- `Effect\.Service\b`, `Context\.Tag\b`, `Context\.GenericTag` — v3 service patterns.
- `Scope\.extend\b` — v3 name.
- `\bEither\b` (excluding `EitherWise` etc.) — v3 name.
- `FiberRef\b` (excluding `Context.Reference`) — v3 name.
- `Effect\.Effect<[^>]*,\s*unknown` — untyped error channel.
- `from\s+"@effect/cli"` — v3 CLI package.
- `from\s+"@effect/platform"` (not `-node`) — v4 core moved to `"effect"`.
- `from\s+"@effect/schema"` — v4 Schema moved to `"effect"`.
- `\bprocess\.(env|argv|cwd|exit|exitCode)\b` outside `packages/cli/src/app/runtime.ts`.
- `console\.(log|warn|error|debug)\b` outside `packages/cli/src/app/ink/**` and test files.

## Risks

| Risk                                                                                             | Likelihood       | Mitigation                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------ | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TUI Ctrl+C / signal handling regresses. `Scope`-managed renderer must release cleanly on SIGINT. | Medium           | `NodeRuntime.runMain` handles SIGINT/SIGTERM → fiber interrupt → scope finalizers. Add explicit `Effect.addFinalizer` calling `renderer.destroy()`. Manual verify: `bun run tui`, Ctrl+C, clean terminal. |
| Parser behavior change: bad TOML now fails-fast instead of silently returning `false`.           | Medium           | Audit every call site as part of Phase 3. Sites that want the swallow get explicit `Effect.orElseSucceed(() => false)`. Tests assert the swallow behavior at chosen sites.                                |
| Call-site churn cascade from wrapping pure helpers.                                              | Medium           | Verified pre-Phase-2 that all consumers of `script.ts` and `config/*` are in `Effect.gen`. Any non-Effect consumer becomes part of Phase 4.                                                               |
| `Data.TaggedEnum` migration of `SettingsMergeResult`/`ParsedSettings`/`DashboardAction`.         | Low              | Constructors are mechanically substitutable. Tests verify shape.                                                                                                                                          |
| Anti-idiomatic verbosity at call sites for wrapped pure helpers.                                 | High (by design) | Acknowledged tradeoff for chosen approach. Lint guards keep it consistent.                                                                                                                                |
| `Effect.fn` adoption introduces span overhead.                                                   | Low              | CLI is not latency-sensitive. Use `Effect.fnUntraced` for any inner hot loop if measured.                                                                                                                 |
| Schema decoding errors are now surfaced where they were swallowed.                               | Low              | `SchemaDecodeFailed` is registered in `Effect.catchTags`; user sees a clear error rather than silent fallback.                                                                                            |

## Rollback

Each phase is its own PR. Phases 0–4 are independent — any can be reverted without affecting earlier phases. Phase 5 is an atomic TUI replacement; if it regresses, revert the single PR.

## File inventory

**In scope (~40–50 files across 5 phases):**

- Phase 0: 9 files (`Effect.catchAll` sites) + 1 lint config.
- Phase 1: `domain/errors.ts`, `cli.tsx`, `app/runtime.ts`, `app/log.tsx`, `commands/{deps,doctor,add,list}.tsx`, `services/prompts.tsx`. (10 files; covers new errors, `Config`-based color, 9 Ink-render conversions, 1 prompt-input conversion.)
- Phase 2: `project/script.ts` + ~5 call-site files.
- Phase 3: `config/*.ts` (6 files) + ~6–9 call-site files (`editors/*`, `tool-ignores/*`, `project/*`).
- Phase 4: ~15 Effect-using files (sweep).
- Phase 5: `tui/*.ts` (8 files) + `app/layers.ts` (TuiLayer export) + 2 updated tests + 1 new test.

**Out of scope (not touched):**

- `app/ink/*.tsx` (4 files): React presentational.
- `tool-ignores/monorepo/**/*.ts` (13 files): static data exports.
- All `index.ts` re-export barrels.
- `domain/constants.ts`, `app/theme.ts`: const-only.
