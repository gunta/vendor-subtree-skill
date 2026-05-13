# Context Router + Knowledge Vendoring — Phase 1 Design

**Date:** 2026-05-13
**Author:** ingraft project (Gunther Brunner + Claude)
**Status:** Draft for review
**Companion:** [`docs/whitepaper.mdx`](../../whitepaper.mdx) — empirical motivation; this spec is the technical commitment.

## Problem

`ingraft` today is a git-subtree wrapper with submodule and clone-ignore fallbacks. The story is subtree-first. But the decision graph in `docs/comparison.mdx` itself shows subtree is *not always best* — long-tail deps want lazy fetch, docs want Context7, semantic queries want mgrep. The empirical whitepaper (`docs/whitepaper.mdx`) collects 35+ peer-reviewed papers and 50+ practitioner quotes that converge on the same operational principle: **the right context, at the right position, bounded, with model- and task-aware policies.** No single primitive is universally correct.

Independently, the Effect/Cherny argument generalizes: **agents read any navigable workspace text better than retrieval APIs.** The same insight that motivates `git subtree` for code motivates committing Notion pages, Linear tickets, and OpenAPI specs into the workspace as files an agent can `grep` and `Read` with its own tools. No existing tool does this — Glean/Unblocked index, Backstage runs a portal, RepoSwarm exports to a separate hub repo. None of them put cross-source knowledge **in the consuming project's workspace as committed text**.

Phase 1 ships the reposition (CLI is the context router for AI coding agents) with five Tier 1 connectors (github, npm/pypi/crates, openapi, notion, linear), a strategy expansion (vendor / fetch / mount / live / pack / skill / search / tool-mediate), a new directory convention (`vendor/<connector>/<artifact>`), and an auto-router heuristic that picks the strategy per target and explains its choice.

## Non-goals (deferred to Phase 2+)

- Tier 2 connectors (github-issues, jira, confluence, slack)
- Tier 3 connectors (figma, gdocs, postgres-schema, terraform)
- The mount strategy implementation (FUSE adapter). Conceptually first-class in the router; deferred because Windows-FUSE and CI containers add complexity disproportionate to demand.
- External plugin SPI for third-party connectors. Tier 1 is hardcoded in core; SPI emerges once the connector shape stabilizes.
- An MCP server flavor of ingraft. Phase 2.
- Multi-agent context coordination, cost-quality optimization, router-level evaluation methodology.

## Data model

### Directory convention

```
vendor/                          # COMMITTED — reproducible reference material
  github/
    effect-ts/effect/            # subtree (today: vendor/effect)
    colinhacks/zod/              # subtree
  notion/
    team-handbook/index.md       # exported page
    arch-decisions/
      adr-001-auth.md
  linear/
    DEV-42/index.md              # ticket + comments + metadata
    DEV-43/index.md
  openapi/
    payments-api.json            # pinned spec

.ingraft/                        # ingraft state
  config.toml                    # COMMITTED — connector configs, allowlists, aliases
  state.json                     # gitignored — lockfile of artifact versions/refs
  cache/                         # gitignored — `fetch` strategy
    npm/zod@3.22.0/
    pypi/requests@2.31.0/
    crates/tokio@1.28.0/
  mounts/                        # gitignored — `mount` strategy FUSE points (Phase 2+)

AGENTS.md                        # generated stanza: vendor/ surface explanation
```

**Two structural rules:**
1. `vendor/<connector>/<artifact>` — every committed artifact carries provenance in its path. No name collisions across connectors.
2. `vendor/` is committed; `.ingraft/cache/` and `.ingraft/mounts/` are not. Clean `git status` separation.

### Strategies (8 total)

| Strategy | Location | Latency | Phase |
|---|---|---|---|
| **vendor** | `vendor/<conn>/<id>` (committed) | none | P1 — all Tier 1 connectors |
| **fetch** | `.ingraft/cache/<conn>/<id>` (gitignored) | one-shot | P1 — npm/pypi/crates |
| **mount** | `.ingraft/mounts/<conn>` (FUSE) | live | P2+ |
| **live** | none (in-context) | live | P1 (via Context7 wrapper) |
| **pack** | one artifact (file) | one-shot | P1 (via existing Repomix wrapper) |
| **skill** | `~/.claude/skills/` | progressive | P1 (today's behavior; renamed conceptually) |
| **search** | external index | live | P2 (via mgrep wrapper) |
| **tool-mediate** | n/a | live | P1 — the agent's native grep over `vendor/` (no ingraft work needed; emergent) |

### Privacy classes

Per-artifact flag in `.ingraft/state.json`:

| Class | Location | Git tracked | Default for |
|---|---|---|---|
| `committed` | `vendor/<conn>/<id>` | yes | github, openapi, notion (public pages), linear (non-customer-private) |
| `gitignored` | `vendor/<conn>/<id>` (in `.gitignore`) | no | linear with customer-private label, notion in private spaces |
| `local-only` | `.ingraft/cache/<conn>/<id>` | no | npm/pypi/crates fetched packages |
| `mounted` | `.ingraft/mounts/<conn>` (FUSE) | no | P2+ — huge data, freshness > reproducibility |

`ingraft doctor` warns when class conflicts with detected content (PII patterns, secrets) or `.gitignore` configuration.

### Target syntax

```
<connector>:<id>[@version][?query]
```

Examples:
- `github:effect-ts/effect`
- `github:effect-ts/effect@v3.21.2`
- `npm:zod`
- `npm:zod@3.22.0`
- `pypi:requests`
- `crates:tokio@1.28.0`
- `notion:9b1a8c3d-...` (page UUID)
- `notion:https://www.notion.so/...` (URL form)
- `linear:DEV-42`
- `linear:DEV` (project — vendors all current-cycle issues)
- `openapi:https://api.example.com/openapi.json`
- `openapi:./schemas/payments.json` (local file)

Aliases configured in `.ingraft/config.toml`:
```toml
[aliases]
effect = "github:effect-ts/effect"
zod = "npm:zod"
react = "npm:react"
```

So `ingraft add effect` resolves to `github:effect-ts/effect` (backward compat for today's users).

## Connector SPI (internal abstraction)

```ts
// packages/cli/src/connectors/types.ts
import type { Effect, Stream } from "effect"

export type ConnectorId = "github" | "npm" | "pypi" | "crates" | "notion" | "linear" | "openapi"

export type Strategy = "vendor" | "fetch" | "mount" | "live" | "pack" | "skill" | "search" | "tool-mediate"

export type PrivacyClass = "committed" | "gitignored" | "local-only" | "mounted"

export interface Target {
  readonly connector: ConnectorId
  readonly id: string
  readonly version?: string
  readonly query?: Record<string, string>
}

export interface Artifact {
  readonly connector: ConnectorId
  readonly id: string
  readonly path: string            // relative to repo root
  readonly version: string         // ref / tag / commit / page-version
  readonly fetchedAt: string       // ISO 8601
  readonly sourceUrl: string
  readonly strategy: Strategy
  readonly privacyClass: PrivacyClass
  readonly metadata: Record<string, unknown>
}

export interface ListQuery {
  readonly limit?: number
  readonly filter?: string
}

export interface FetchOpts {
  readonly strategy?: Strategy
  readonly privacyClass?: PrivacyClass
  readonly recursive?: boolean
  readonly exclude?: ReadonlyArray<string>
}

export interface Connector {
  readonly id: ConnectorId
  readonly defaultStrategy: Strategy
  readonly authMechanism: "none" | "env" | "gh-cli" | "oauth" | "token-file"

  parseTarget(input: string): Effect.Effect<Target, ParseError>
  list(query: ListQuery): Stream.Stream<Artifact, ListError>
  fetch(target: Target, opts: FetchOpts): Effect.Effect<Artifact, FetchError>
  refresh(artifact: Artifact): Effect.Effect<Artifact, FetchError>
  remove(artifact: Artifact): Effect.Effect<void, RemoveError>
  emitAgentsMdStanza(artifacts: ReadonlyArray<Artifact>): string
  inferPrivacyClass(target: Target, metadata: Record<string, unknown>): PrivacyClass
}
```

The five Tier 1 connectors all implement this interface. Effect-TS service layer for DI. The router is a separate component (`packages/cli/src/router/`) that depends on the connector registry.

## Auto-router heuristic

Signals in priority order:

1. **Explicit CLI flag** — `--strategy=vendor|fetch|mount|live|pack`
2. **Existing lockfile entry** in `.ingraft/state.json` — keep existing strategy (idempotent)
3. **Per-target config** in `.ingraft/config.toml`:
   ```toml
   [targets."notion:team-handbook"]
   strategy = "vendor"
   privacy_class = "committed"
   ```
4. **Per-connector config** in `.ingraft/config.toml`:
   ```toml
   [connectors.linear]
   default_strategy = "vendor"
   default_privacy_class = "gitignored"
   ```
5. **Curated allowlist** — hardcoded "core framework" list (Effect, React, Vue, Svelte, Vite, Astro, Next, Express, Hono, ...) → `vendor` for github connector
6. **Heuristic from connector** — connector-specific rules:
   - `npm`/`pypi`/`crates`: default `fetch` (long-tail) unless target in core allowlist
   - `github`: default `vendor` (subtree) — that's today's behavior
   - `notion`: default `vendor` unless page size > 50MB
   - `linear`: default `vendor` for single issue; `vendor` recursive for project unless > 500 issues
   - `openapi`: always `vendor` (small JSON files)
7. **Fallback** — `fetch`

**Output always includes the choice + explanation:**

```
→ ingraft add notion:9b1a8c3d
→ Picked strategy=vendor (notion default; size 12KB; privacy=committed)
→ Committed to vendor/notion/team-handbook/index.md
→ Source: https://www.notion.so/...
→ Refreshed: 2026-05-13T15:42:00Z
```

For overrides:

```
→ ingraft add notion:9b1a8c3d --strategy=fetch
→ Picked strategy=fetch (explicit flag)
→ Cached at .ingraft/cache/notion/team-handbook/index.md
→ Not committed (in .gitignore)
```

## Tier 1 connector specifications

### github

**Today's behavior, renamed under `vendor/github/`.**

- Target: `github:<owner>/<repo>[@<ref>]`
- Default strategy: `vendor` (subtree)
- Alt strategies: `submodule` (gitlink), `clone-ignore` (cloned + in .gitignore), `fetch` (clone to `.ingraft/cache/github/`)
- Auth: `gh` CLI for private repos
- Backward compat: `vendor/<repo>` → `vendor/github/<owner>/<repo>` migration via `ingraft doctor --fix`. Aliases preserve short names: `effect` → `github:effect-ts/effect` → `vendor/github/effect-ts/effect/`.
- Subtree internals unchanged; only the prefix path changes.

### npm / pypi / crates (the OpenSrc-parity path)

**Native implementation. No wrapping `opensrc` as child process.**

- Target: `npm:<name>[@<version>]`, `pypi:<name>[@<version>]`, `crates:<name>[@<version>]`
- Default strategy: `fetch` (lazy cache)
- Process:
  1. Hit registry (registry.npmjs.org, pypi.org/pypi/<name>/json, crates.io/api/v1/crates/<name>)
  2. Resolve `repository.url` field
  3. Match version to git tag (heuristics: `v3.22.0`, `3.22.0`, `release-3.22.0`)
  4. Shallow clone at tag: `git clone --depth 1 --branch <tag> <url> .ingraft/cache/<ecosystem>/<name>/<version>/`
  5. Print absolute path
- Privacy class: `local-only` (never committed)
- Refresh: re-resolve version from lockfile if present; fall back to latest
- Promote to vendor: `ingraft promote npm:zod` → moves to `vendor/github/<owner>/zod` with subtree

Edge cases:
- Package has no `repository` field → error with suggestion to file an upstream PR
- Version tag mismatch → list candidate tags, ask user
- Monorepo packages (e.g., `@effect/platform-node`) → resolve to the parent repo + a subdirectory hint in metadata

### openapi

- Target: `openapi:<url>` or `openapi:<local-path>`
- Default strategy: `vendor`
- Process:
  1. Fetch URL (or read file) → JSON
  2. Validate against OpenAPI 3.x schema (warn, don't error, on validation failures)
  3. Write to `vendor/openapi/<slug>.json` where slug derives from `info.title`
  4. Emit YAML frontmatter sidecar: `vendor/openapi/<slug>.meta.yaml` with source URL, fetched_at, OpenAPI version
- Privacy class: `committed`
- Refresh: re-fetch, diff JSON, commit if changed
- Bonus: `ingraft add openapi:url --to vendor/openapi/payments.json` for explicit naming

### notion

- Target: `notion:<page-id>` or `notion:<page-url>` (URL form auto-extracts ID)
- Default strategy: `vendor`
- Auth: `NOTION_API_KEY` env var or `~/.config/ingraft/notion-token`
- SDK: `@notionhq/client`
- Process:
  1. Fetch page metadata
  2. Walk block tree depth-first; convert each block to markdown
  3. Resolve mentions (users, pages, databases) to readable form
  4. Frontmatter: `id`, `title`, `url`, `last_edited`, `created`, `author`, `parent`
  5. Write to `vendor/notion/<slug>/index.md` where slug derives from page title (sanitized)
  6. If page has child pages: write to `vendor/notion/<slug>/<child-slug>/index.md` (recursive)
- Privacy class: `inferPrivacyClass` checks if page is in a workspace marked "private" in config → `gitignored`, else `committed`
- Refresh: compare `last_edited` timestamp; re-fetch if changed
- Recursive flag: `ingraft add notion:<id> --recursive` vendors child pages too

Format example:
```markdown
---
id: 9b1a8c3d-...
title: Auth Architecture Decisions
url: https://www.notion.so/...
last_edited: 2026-05-12T10:30:00Z
author: alice@example.com
connector: notion
privacy_class: committed
---

# Auth Architecture Decisions

We use OAuth 2.0 with PKCE for the mobile clients...
```

Edge cases:
- Notion-specific blocks (toggle, callout, equation): render with semantic prefixes (`> [!callout]`)
- Images / files: download alongside `index.md` (`vendor/notion/<slug>/images/`)
- Databases: serialize as a CSV alongside `index.md`

### linear

- Target: `linear:<issue-key>` (e.g., `linear:DEV-42`) or `linear:<project-key>` (e.g., `linear:DEV`)
- Default strategy: `vendor`
- Auth: `LINEAR_API_KEY` env var or `~/.config/ingraft/linear-token`
- SDK: `@linear/sdk`
- Process for single issue:
  1. Fetch issue by identifier
  2. Fetch comments, attachments, linked issues
  3. Markdown render with sections: Description / Comments / Attachments / Links / Metadata
  4. Frontmatter: `key`, `title`, `state`, `assignee`, `cycle`, `project`, `labels`, `created`, `updated`
  5. Write to `vendor/linear/<key>/index.md`
- Process for project: list current-cycle issues by default; recursive flag includes all
- Privacy class: `inferPrivacyClass` checks labels — `customer-private`, `internal-secret` → `gitignored`. Configurable.
- Refresh: compare `updatedAt`; re-render if changed
- Filter flags:
  - `--cycle=current` (default), `--cycle=all`, `--cycle=2026-Q2`
  - `--state=todo,in-progress,done`
  - `--label=architecture`

Format example:
```markdown
---
key: DEV-42
title: Add OAuth PKCE flow for mobile
state: In Progress
assignee: alice@example.com
cycle: 2026-Q2
project: Auth Refresh
labels: [architecture, mobile, security]
created: 2026-04-01T09:00:00Z
updated: 2026-05-12T14:00:00Z
connector: linear
privacy_class: committed
---

# DEV-42: Add OAuth PKCE flow for mobile

## Description

The current OAuth flow uses confidential clients, which leaks the secret on mobile...

## Comments

**alice@example.com** (2026-04-02): We should also consider...

## Linked

- DEV-41: OAuth client registration
- ADR-001: see vendor/notion/arch-decisions/adr-001-auth.md
```

## CLI surface

### Top-level commands

```sh
ingraft                                      # interactive TUI; lists vendored, suggests actions
ingraft add <target>                         # auto-route + execute + explain
ingraft add <target> --strategy=<strategy>   # explicit
ingraft add <target> --dry-run               # print decision without executing
ingraft remove <target>                      # un-vendor (preserves git history)
ingraft update [<target>]                    # refresh one or all
ingraft list                                 # show all vendored + strategy + last-fetched
ingraft list --json                          # machine-readable
ingraft doctor                               # hygiene check
ingraft doctor --fix                         # auto-fix (incl. migration from flat vendor/)
ingraft promote <target>                     # fetch → vendor (commit it)
ingraft demote <target>                      # vendor → fetch (uncommit, keep cache)
ingraft connectors list                      # show available connectors + auth status
ingraft connectors auth <connector>          # interactive auth flow
ingraft context pack <paths>                 # existing — Repomix wrapper
ingraft context source <pkg>                 # DEPRECATED alias for `ingraft add npm:<pkg>` (back-compat)
ingraft init                                 # set up vendor/ + AGENTS.md + .ingraft/
ingraft refresh                              # regenerate agent docs, ignores, AGENTS.md
```

### AGENTS.md generation

`ingraft refresh` (or any add/remove/update) regenerates the AGENTS.md stanza:

```markdown
<!-- ingraft:begin -->
## Vendored Context

This project vendors external knowledge under `vendor/` via `ingraft`. Treat these as
**read-only reference material**. Do NOT edit files under `vendor/` unless explicitly asked.

### Strategies

- `vendor/github/*` — committed source from GitHub via `git subtree`. Patterns and APIs here are the source of truth.
- `vendor/notion/*` — snapshotted Notion pages (markdown export). Last refreshed: see frontmatter.
- `vendor/linear/*` — snapshotted Linear tickets (markdown export). Treat as read-only project history.
- `vendor/openapi/*` — pinned API specs.

### Vendored artifacts (24 total)

**GitHub source (2):**
- `vendor/github/effect-ts/effect` — subtree @ v3.21.2
- `vendor/github/colinhacks/zod` — subtree @ v3.22.0

**Notion (3):**
- `vendor/notion/team-handbook/` — Team onboarding handbook
- `vendor/notion/arch-decisions/adr-001-auth.md` — Auth ADR
- `vendor/notion/arch-decisions/adr-002-db.md` — DB ADR

**Linear (18):**
- `vendor/linear/DEV-42/` ... `vendor/linear/DEV-59/` — current cycle (2026-Q2)

**OpenAPI (1):**
- `vendor/openapi/payments-api.json` — pinned at 2026-05-12

Run `ingraft list` to see strategies + freshness.
Run `ingraft update` to refresh all.
<!-- ingraft:end -->
```

## Doctor extensions

Doctor checks beyond today's hygiene:

- **Migration**: detect flat `vendor/<repo>/` → suggest `ingraft doctor --fix` to migrate to `vendor/github/<repo>/`
- **Privacy mismatch**: an artifact marked `committed` but containing detected PII / secret patterns → warn
- **Stale cache**: `.ingraft/cache/` entries older than 30 days → suggest cleanup
- **fff suggestion**: `vendor/` has > 50 files and no fff MCP config detected → suggest installation
- **Connector auth**: connectors without valid auth → warn
- **Lockfile drift**: `.ingraft/state.json` references not found on disk → warn

## File layout (implementation)

```
packages/cli/src/
  connectors/
    types.ts                    # SPI interfaces
    registry.ts                 # connector lookup
    github/
      index.ts                  # subtree + namespace migration
      target.ts
    npm/
      index.ts                  # native opensrc-equiv
      registry-client.ts        # registry.npmjs.org
      tag-resolver.ts
    pypi/
      index.ts
      registry-client.ts        # pypi.org/pypi
    crates/
      index.ts
      registry-client.ts        # crates.io/api/v1
    notion/
      index.ts
      block-to-md.ts            # block tree → markdown
      auth.ts
    linear/
      index.ts
      issue-to-md.ts
      auth.ts
    openapi/
      index.ts
      validator.ts
  router/
    decide.ts                   # heuristic engine
    explain.ts                  # human-readable output
    signals.ts                  # signal extraction
  domain/
    strategy.ts                 # was vendor-strategy.ts; broadened
    artifact.ts
    privacy.ts
  project/
    layout.ts                   # vendor/ structure + .ingraft/
    migration.ts                # flat → namespaced
    agents-md.ts                # generation
  commands/
    add.tsx                     # refactored to call router
    promote.tsx                 # NEW
    demote.tsx                  # NEW
    connectors.tsx              # NEW
```

## Phasing within Phase 1

Even Phase 1 is too big to land in one PR. Land in this order:

1. **Foundation** (no user-visible changes yet)
   - Strategy + Artifact + PrivacyClass domain types
   - Connector SPI interfaces
   - Router skeleton (just dispatches; no heuristics yet)
   - `vendor/<connector>/<artifact>` layout types + migration helpers
2. **github connector under new namespace** (backward-compat focus)
   - Migrate existing subtree code into `connectors/github/`
   - `ingraft doctor --fix` migrates flat `vendor/<repo>` to `vendor/github/<repo>` (preserves git history via `git mv`)
   - Aliases preserve short names; today's `ingraft add effect` still works
3. **npm/pypi/crates fetch connector** (the OpenSrc-parity win)
   - Native registry resolution + shallow clone
   - `.ingraft/cache/` setup
   - `ingraft promote` to upgrade fetch → vendor
4. **openapi connector** (simplest non-code; validates the SPI)
   - HTTP fetch + JSON validation + commit
   - Demonstrates the per-connector frontmatter pattern
5. **notion connector** (real auth + format work)
   - Block tree → markdown
   - Recursive vendoring
   - Privacy inference
6. **linear connector** (similar shape to notion)
   - Issue / project / cycle filtering
   - Privacy inference from labels
7. **Router heuristic + explanation** (now that connectors are in place)
   - Signal extraction
   - Decision tree
   - Always-explain output
8. **Doctor extensions + AGENTS.md regeneration**
   - Privacy mismatch detection
   - fff suggestion
   - Auto-migration prompts
9. **Reposition narrative** (the user-facing story)
   - README rewrite
   - `docs/comparison.mdx` repositioning (ingraft into Orchestrator tier)
   - Website hero + strategies page

Each numbered item is a separate PR; each lands behind the existing surface (no breaking changes until step 9). The whitepaper at `docs/whitepaper.mdx` is reference material throughout.

## Risks

- **Notion API quotas + paginated block fetching**: large pages can require dozens of API calls. Mitigation: backoff + caching; document quotas; recommend `--shallow` flag for first-pass.
- **Linear ticket volume**: a project with 500+ tickets vendored recursively bloats `vendor/` fast. Mitigation: default `--cycle=current`; emit clear "X tickets vendored, run `--cycle=all` for full history" guidance.
- **github namespace migration**: users with existing `vendor/<repo>/` directories will see `git mv` operations in the migration PR. Mitigation: `ingraft doctor --fix` is opt-in; deprecation banner runs for 1 minor version before any breaking change.
- **OpenAPI version sprawl**: tracking a moving spec creates noisy diffs. Mitigation: pin by `info.version` field, refresh on demand only.
- **Privacy false negatives**: PII detection misses customer-private content. Mitigation: doctor is heuristic-only — the authoritative decision is the user's connector config + per-artifact class. Document the heuristics' limits.
- **Effect-TS dependency depth**: Tier 1 adds new external SDKs (`@notionhq/client`, `@linear/sdk`). Mitigation: keep them isolated to each connector module; ingraft core stays pure Effect.

## Open questions for the reviewer

1. **Is the `vendor/github/<owner>/<repo>` depth right, or should it be `vendor/github/<repo>` with owner only as metadata?** Two-level (with owner) avoids collisions when vendoring `facebook/react` and `pmndrs/react`; one-level is shorter. I lean two-level for clarity; the alias system gives users the short form.
2. **Should `fetch` ever auto-promote to `vendor` based on observation?** E.g., if `ingraft` notices `npm:zod` is in `.ingraft/cache/` AND in `package.json` deps AND imported in 10+ files, suggest promotion. Phase 1 keeps this manual; Phase 2 could add heuristic prompts.
3. **Mount strategy in Phase 1 or Phase 2?** I lean Phase 2. The whitepaper §7.7 makes the case conceptually; the Tier 1 connectors don't need it. Phase 2 can ship mount alongside Tier 2 (slack, jira) where it actually matters.
4. **Should `ingraft init` be opinionated about which connectors to set up?** Today's `init` creates `vendor/` + `AGENTS.md`. With multiple connectors, init could scan for `.notion-tokens`, `LINEAR_API_KEY` env, etc. and offer to configure each. Or stay minimal and let each `ingraft add <connector>:...` prompt for auth on demand.

## Acceptance criteria

Phase 1 ships when:

- [ ] `ingraft add github:effect-ts/effect` works identically to today's `ingraft add effect` (with new path `vendor/github/effect-ts/effect/`)
- [ ] `ingraft add effect` (alias) resolves to the above
- [ ] `ingraft add npm:zod` lazily fetches into `.ingraft/cache/npm/zod/<version>/` and prints the path
- [ ] `ingraft add openapi:<url>` commits the JSON to `vendor/openapi/<slug>.json` with a sidecar metadata file
- [ ] `ingraft add notion:<page-id>` exports the page and any children to `vendor/notion/<slug>/index.md` with YAML frontmatter, with `NOTION_API_KEY` env
- [ ] `ingraft add linear:DEV-42` exports the issue to `vendor/linear/DEV-42/index.md` with frontmatter and comments, with `LINEAR_API_KEY` env
- [ ] `ingraft add linear:DEV` exports the current-cycle issues recursively
- [ ] Every `add` prints the strategy decision and reason
- [ ] `ingraft list` shows all artifacts with connector / strategy / last-fetched / privacy class
- [ ] `ingraft update` refreshes all artifacts; per-connector logic compares versions/timestamps and only updates what changed
- [ ] `ingraft doctor --fix` migrates flat `vendor/<repo>` to `vendor/github/<owner>/<repo>` for existing users
- [ ] AGENTS.md is regenerated with the strategy explanation and artifact list
- [ ] `docs/comparison.mdx` repositions ingraft into a new "Orchestrator" tier above the existing four categories
- [ ] README rewritten with the context-router framing; Effect/subtree example remains as the canonical github connector use case

## References

- [`docs/whitepaper.mdx`](../../whitepaper.mdx) — empirical motivation (35+ papers, 50+ practitioner quotes, full landscape)
- [`docs/comparison.mdx`](../../comparison.mdx) — current tool comparison (to be repositioned)
- [Effect blog: The One Weird Git Trick](https://effect.website/blog/the-one-weird-git-trick-that-makes-coding-agents-more-effect-ive/)
- [Anthropic: Effective Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Anthropic: Equipping Agents for the Real World (Skills)](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
- [OpenSrc / vercel-labs](https://github.com/vercel-labs/opensrc) — native reimplementation target
- [fff / dmtrKovalenko](https://github.com/dmtrKovalenko/fff) — recommended workspace search MCP
- [HN: FUSE is All You Need](https://news.ycombinator.com/item?id=46580136) — mount strategy thesis
- [Notion API](https://developers.notion.com/) — SDK + auth model
- [Linear SDK](https://developers.linear.app/docs/sdk/getting-started) — SDK + auth model
- [agentskills.io](https://agentskills.io) — SKILL.md spec
- [AGENTS.md](https://agents.md) — convention this spec generates against
