# `ingraft add-org` — bulk vendoring from a GitHub organization or user

**Status:** Draft
**Date:** 2026-05-19
**Owner:** Gunther Brunner

## Summary

Add a new `ingraft add-org <owner>` subcommand that discovers every repository
under a GitHub organization or user, lets the operator filter and select
interactively in a TUI (or non-interactively via flags), and clones the
selected repos into `vendor/<owner>/<repo>` in parallel using the existing
vendor strategies.

The change also:

- Introduces a default vendor-path shape of `vendor/<owner>/<repo>` for all
  hosted-repo adds (existing repos stay where they are; no migration needed).
- Adds local, gitignored state under `.ingraft/state/` for the org repo-list
  cache, per-org TUI session memory, and a derived vendor-state index used as
  a fast path inside `listVendored`.
- Keeps `git` commit trailers as the authoritative source for vendored repos;
  local state is purely a cache that is rebuildable on demand.

## Motivation

`ingraft add` is good for one or a few repositories. When an operator wants to
pull every repo in an org (own work, a vendor's libraries, a research org's
stack) for context-routing, today's flow forces them to:

1. Hand-list every repo.
2. Filter them manually by language, archived state, or staleness.
3. Run `add` for each one serially (`addManyImpl` runs with `concurrency: 1`).
4. Use the bare repo name as the path, which collides across owners.

`add-org` is the natural unit for bulk vendoring of an entire org and removes
all four pain points.

## Goals

- One-command discovery and bulk add of all repos under a GitHub owner.
- Interactive selection with live filtering in the TUI.
- Non-interactive mode for CI / piping (`--yes` and TTY auto-detect).
- Parallel cloning (default 8, configurable).
- Per-owner nested vendor paths to avoid name collisions.
- Cached org listings and persisted TUI session preferences so reopening the
  TUI for the same owner is fast and remembers the last filter/selection.

## Non-goals

- GitLab groups, Bitbucket workspaces, or other host equivalents (v1 is
  GitHub-only via the existing `gh` CLI).
- Auto-migration of existing `vendor/<name>` paths to `vendor/<owner>/<name>`.
- A bulk-operation history log (`.ingraft/state/history.jsonl`) — deferred to a
  later iteration.
- Editable forks / per-repo override flags in the TUI beyond filter/select.
- Strict-mode abort-on-first-failure (`--strict`).

---

## 1. Architecture

```
ingraft add-org <owner> [flags]
   │
   ├─ services/github-org.ts          gh repo list --json … → OrgRepository[]
   ├─ services/local-state.ts         .ingraft/state/* read/write
   ├─ domain/org-filter.ts            pure filters + parseSince
   ├─ tui/add-org/                    OpenTUI screen (Bun) with live filtering
   │    ├─ state.ts                   AddOrgState + dispatchAddOrg reducer
   │    ├─ render.ts                  OpenTUI render fn
   │    ├─ keyboard.ts                key → AddOrgAction mapping
   │    └─ runner.ts                  Effect.forEach + progress dispatch
   ├─ commands/add-org.tsx            command wiring; TTY → TUI or non-interactive
   └─ commands/add.tsx (modified)     default prefix → vendor/<owner>/<name>
```

**Flow at command entry:**

- `--yes` set OR stdin/stdout is not a TTY → discover → apply flag filters →
  call `addImpl` in parallel with `Effect.forEach(..., { concurrency })`.
- Otherwise → discover (warm from cache when fresh) → launch the OpenTUI
  screen → on Enter, run the same parallel add with live progress lines
  appended into the TUI.

**Reuse, not rewrite:**

- `addImpl` from `packages/cli/src/commands/add.tsx` handles every per-repo
  strategy. `add-org` is orchestration only.
- Run-state pattern (`browsing` → `confirming-run` → `running`) mirrors
  `packages/cli/src/tui/dashboard.ts:dispatchDashboard`.
- OpenTUI renderer machinery is reused from `packages/cli/src/tui/renderer.ts`
  and the existing Bun launcher.

**Repo discovery method (chosen):** `gh repo list <owner> --json …`. One call,
one source of truth for the metadata (name, owner, defaultBranchRef, pushedAt,
primaryLanguage, isArchived, isFork, visibility, description, url). Auto-handles
both org and user accounts. Reuses the existing `services/gh.ts` wrapper.

REST API direct and a gh/REST hybrid were considered. They add code without
solving a real problem given `gh` is already a project dependency.

## 2. Command surface

```
ingraft add-org <owner> [flags]

Filters (applied pre-TUI; all editable inside the TUI):
  --language <list>      Comma-separated. Match GitHub primaryLanguage
                         case-insensitively (e.g. "typescript,svelte").
  --since <when>         ISO date (2026-01-01) or relative (90d, 12w, 6m).
                         Compared against repo's pushedAt.
  --include-archived     Include archived repos. Default: skip.
  --include-forks        Include forks. Default: skip.
  --visibility <kind>    public | private | internal | all. Default: all.

Behavior:
  --yes                  Skip the TUI; use flag filters as-is. Auto-set when
                         stdin/stdout is not a TTY.
  --dry-run              Discover, filter, list — but don't clone.
  --refresh              Bypass the org repo-list cache.
  --concurrency <n>      Parallel clones. Default 8. Clamped to [1, 32].

Strategy & version (passthrough to addImpl):
  --strategy <s>         subtree | submodule | clone-ignore | cache-link.
                         Default: clone-ignore.
  --ref / --tag / --release  Same as `add`. Applied uniformly to every repo.
                         Per-repo failures (e.g. tag missing) don't abort the
                         batch.
```

`--name` and `--prefix` are intentionally absent — they cannot apply uniformly
across many repos. The path shape is fixed at `vendor/<owner>/<repo>` for
`add-org`.

`<owner>` accepts both organizations and user accounts; `gh repo list` does
not distinguish them at the API level.

## 3. Local state model

**Location:** `.ingraft/state/` — sibling of the existing
`.ingraft/config.toml`, already gitignored. A new `LocalState` service is the
only writer.

```
.ingraft/
├── config.toml                  existing, user-edited
└── state/                       new, machine-managed
    ├── orgs/
    │   └── <owner>.json         one per owner queried via add-org
    └── index.json               derived vendor index
```

**Schema (Effect Schema, version-tagged JSON):**

Note on naming: CLI flags are positive (`--include-archived`, `--include-forks`)
while internal state uses the inverse (`excludeArchived`, `excludeForks`). The
mapping is mechanical — `excludeX = !flagIncludeX`. Default state is
`excludeArchived: true, excludeForks: true` (matches the flag defaults).

```ts
// .ingraft/state/orgs/<owner>.json
{
  schemaVersion: 1,
  owner: "gunta",
  fetchedAt: "2026-05-19T14:33:21Z",
  repos: [
    { name, owner, defaultBranch, pushedAt, primaryLanguage,
      isArchived, isFork, visibility, description, url }
  ],
  preferences: {
    language: ["typescript"],
    since: "90d",
    excludeArchived: true,
    excludeForks: true,
    visibility: "all",
    selectedNames: ["repo1", "repo2"]
  }
}

// .ingraft/state/index.json
{
  schemaVersion: 1,
  headSha: "abc123...",
  builtAt: "...",
  repos: [ VendoredRepo, ... ]
}
```

**Invalidation rules:**

| File                  | Invalid when                                       | Action                       |
| --------------------- | -------------------------------------------------- | ---------------------------- |
| `orgs/<owner>.json`   | `now - fetchedAt > 1h`, or `--refresh` passed      | Re-fetch from gh             |
| `index.json`          | `headSha !== currentHeadSha`                       | Rebuild from `git log`       |
| Any file              | parse error / unknown schema version               | Log debug, delete, rebuild   |

Local state never blocks the command — it can only make it faster. A cache
write failure is logged at debug and ignored.

**`LocalState` API surface:**

```ts
readOrgCache(owner): Effect<Option<OrgCache>>
writeOrgCache(owner, cache): Effect<void>
readVendorIndex(cwd, currentHeadSha): Effect<Option<VendoredRepo[]>>
writeVendorIndex(cwd, headSha, repos): Effect<void>
clearOrg(owner): Effect<void>
```

**Fast-path integration:** `listVendored` in
`packages/cli/src/domain/vendor-state.ts:429` gains a check for
`LocalState.readVendorIndex` first, falling through to the existing git-log
scan on miss. Transparent to every caller; benefits every command on
workspaces with many vendor commits.

## 4. TUI screen

```
┌─ ingraft add-org ─────────────────────────────── gunta ──────┐
│ Language: typescript,svelte_   Since: 90d_   Visibility: all │
│ [x] Skip archived   [x] Skip forks                           │
├──────────────────────────────────────────────────────────────┤
│ /search-by-name_                            42 / 137 shown   │
├──────────────────────────────────────────────────────────────┤
│  > [x] gunta/ingraft         ts    2d ago    public  ─       │
│    [x] gunta/website         ts    5d ago    public  ─       │
│    [ ] gunta/legacy-thing    ts    14d ago   public  [added] │
│    [x] gunta/svelte-app      svelte 1h ago   public  ─       │
│    ...                                                       │
├──────────────────────────────────────────────────────────────┤
│ 3 selected   strategy: clone-ignore   concurrency: 8         │
│ j/k move  space select  / search  Tab filters  enter run  q  │
└──────────────────────────────────────────────────────────────┘
```

**State machine** — new file `packages/cli/src/tui/add-org/state.ts`, pure
reducer mirroring `dashboard.ts:dispatchDashboard`:

```ts
type AddOrgMode = "filtering" | "browsing" | "confirming-run" | "running" | "done"

type AddOrgState = {
  owner: string
  mode: AddOrgMode
  repos: OrgRepository[]
  filters: {
    language: string[]
    since: string | null
    excludeArchived: boolean
    excludeForks: boolean
    visibility: "public" | "private" | "internal" | "all"
    search: string
  }
  focusedIndex: number
  selected: Set<string>           // "owner/name"
  vendored: Set<string>           // already in vendor-state → [added]
  strategy: VendorStrategy
  concurrency: number
  runProgress: Map<string, "queued" | "running" | "success" | "error">
  logLines: string[]
}

type AddOrgAction =
  | MoveUp | MoveDown | PageUp | PageDown
  | ToggleSelected | SelectAllFiltered | ClearSelection
  | FocusFilter("language"|"since"|"visibility"|"search")
  | SetLanguage(string[]) | SetSince(string|null) | SetVisibility(...)
  | ToggleArchived | ToggleForks
  | SetSearch(string)
  | SetStrategy(VendorStrategy) | SetConcurrency(number)
  | Confirm | Cancel | StartRun
  | TickProgress(name, status) | AppendLog(line) | FinishRun
```

`filteredRepos(state)` is a pure derived function — never stored.

**Files:**

- `packages/cli/src/tui/add-org/state.ts` — types and reducer.
- `packages/cli/src/tui/add-org/render.ts` — OpenTUI render function.
- `packages/cli/src/tui/add-org/keyboard.ts` — key → action mapping.
- `packages/cli/src/tui/add-org/runner.ts` — orchestrates
  `Effect.forEach(selected, addImpl, { concurrency })` while dispatching
  `TickProgress` actions back into the state.

**v1 TUI editability:** filters, search, selection, and confirm/cancel are
fully editable in the TUI. Strategy, concurrency, and version flags are
*displayed* in the status bar but only settable from the CLI in v1; the
`SetStrategy` / `SetConcurrency` actions in the reducer are defined as
forward-compatibility seams.

**Bun-only**, consistent with the existing dashboard. When invoked from Node,
the launcher re-execs through Bun (existing pattern in `tui/launcher.ts`).

**Session memory:** on enter, `LocalState.readOrgCache(owner)` restores
`filters` and `selected`. On exit (success or cancel), the current filters
and selection are persisted back.

## 5. Path-structure change and migration

**Change** to `packages/cli/src/commands/add.tsx:1003`:

- If `--prefix` provided → use it (unchanged).
- Else if the URL is a hosted repo with `nameWithOwner` → `vendor/${owner}/${name}`.
- Else (bare URL without an owner segment) → `vendor/${finalName}` (current).

`finalName` itself stays as the repo name only. It remains the lookup key in
`vendor-state`, so `ingraft list`, `update`, and `remove` keep their current
ergonomics.

**Migration:** none required. Existing `vendor/effect` and `vendor/effect-smol`
keep working — `listVendored` reads each repo's actual prefix from the commit
trailer, not from a path convention. `findByName({ name: "effect" })` still
resolves to `vendor/effect` for the existing entry.

**Name collisions:** two repos named `effect` from different owners would
share the same `name` key. Today this is already a latent problem; with
nested paths it becomes more likely. The first `add` wins; the second hits
the existing `VendoredRepoAlreadyExists` error. Workaround: user passes
`--name <owner>-<repo>` to disambiguate. A future change could make `name`
include the owner — out of scope here.

**Docs and tests touched:**

- `packages/cli/README.md` — update path examples.
- `packages/cli/src/services/vendor-notes.ts` — the generated AGENTS.md
  section already records each repo's real prefix; no template change.
- Existing add tests at `packages/cli/tests/` — update expected prefixes only
  for new fixtures; preserve old-shape expectations for existing fixtures.

## 6. Error handling

New error tags added to `packages/cli/src/domain/errors.ts`:

| Error                          | When                                          | Exit | Hint                                                                  |
| ------------------------------ | --------------------------------------------- | ---- | --------------------------------------------------------------------- |
| `GitHubCliMissing`             | `gh` binary not on PATH                       | 127  | "Install GitHub CLI: brew install gh, then gh auth login."            |
| `GitHubCliUnauthenticated`     | `gh repo list` fails with auth error          | 4    | "Run gh auth login to authenticate."                                  |
| `GitHubOrgNotFound`            | No repos AND `gh api /users/<owner>` 404s     | 5    | "Owner not found, or no public repos visible to your token."         |
| `OrgFilterParseFailed`         | `--since 90bogus`, empty `--language`         | 2    | "Use ISO date (2026-01-01) or relative (90d, 12w, 6m)."               |
| `LocalStateSchemaMismatch`     | `.ingraft/state/*.json` unknown version       | —    | "Cleared incompatible local state file." (warn, delete, rebuild — not surfaced as a typed error to the user) |

`AddOrgPartialFailure` is intentionally *not* a typed Effect error. Per-repo
failures are caught and recorded in the run summary; the command itself
completes successfully when at least one repo succeeded.

**Partial-failure policy:**

- Per-repo failures are caught inside `Effect.forEach({ concurrency })`. One
  repo failing does not abort the others.
- Each failure produces a log line in the TUI (or stderr non-interactively)
  formatted `repo: <owner>/<name> reason: <message>`.
- Exit code: `0` if all succeeded; `0` with a non-zero summary on stderr if
  some succeeded; non-zero only when every repo failed or discovery failed.

**TTY detection:** mirrors `prompts.tsx:71` —
`if (!input.isTTY || !output.isTTY)` triggers non-interactive mode.

**Cache write failures** (read-only fs, disk full): log at debug, continue.

**Concurrency clamping:**

- `--concurrency 0` or negative → error with the hint to use 1+.
- `--concurrency >32` → soft-clamped to 32 with a warning.

## 7. Testing

Existing test layout under `packages/cli/tests/` with Bun's test runner.

**Pure-function unit tests:**

| File                                    | Coverage                                                                                                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/domain/org-filter.test.ts`       | `parseSince` happy + error paths; filter composition (language ∧ since ∧ archived ∧ forks ∧ visibility ∧ search) over a hand-built `OrgRepository[]`.               |
| `tests/tui/add-org/state.test.ts`       | `dispatchAddOrg` per action; mode transitions; `filteredRepos` derivation; selection persists across filter changes; pre-vendored repos excluded from default sel.  |
| `tests/config/local-state.test.ts`      | Round-trip read/write; TTL expiry; schema-version mismatch deletes and rebuilds; corrupt JSON deletes and rebuilds; cache miss path.                                |

**Service tests with mocked process spawner:**

| File                                | Coverage                                                                                                                                |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/services/github-org.test.ts` | Mock `gh repo list --json` stdout → parsed `OrgRepository[]`; `--limit 1000` cap; `gh` missing → typed error; auth stderr → typed error. |

**Integration tests (real `git`, fake remote):**

| File                                   | Coverage                                                                                                                                                                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/commands/add-org.test.ts`       | Non-interactive `--yes` end-to-end: discover → filter → parallel add into a temp git repo with file:// remote. Verify (a) `vendor/<owner>/<repo>` prefix, (b) trailers, (c) one repo failing doesn't abort others, (d) cache populated. |
| `tests/commands/add.test.ts` (modify)  | New cases for the prefix-shape change; existing fixtures keep their old-shape expectations to prove no migration is needed.                                                                                                |

**Not tested:**

- Actual OpenTUI rendering (manual). State machine is tested in isolation.
- Real `gh` calls (mocked at the spawn boundary).
- Live GitHub API.

**Existing tests that must keep passing:**

- All `vendor-state` parsing tests — `LocalState`'s derived-index fast-path
  is transparent.
- `addManyImpl` tests — `add` semantics unchanged except for prefix default.

## Open questions resolved during brainstorm

- Command shape: new `add-org` subcommand (not a flag on `add`).
- Filters: language, since, include-archived, include-forks (latter two
  default to skip).
- Default strategy: `clone-ignore`.
- Concurrency: 8, configurable.
- Path shape: `vendor/<owner>/<repo>` for all hosted adds (not just `add-org`).
- Migration: none — existing repos stay put.
- TUI scope: full OpenTUI screen with live filtering and multi-select.
- Local state: cache, session memory, derived vendor index. No history log
  for v1.
