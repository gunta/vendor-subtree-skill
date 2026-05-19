# ingraft

[![skills.sh](https://skills.sh/b/gunta/ingraft)](https://skills.sh/gunta/ingraft)

**Repository context for coding agents.** `ingraft` routes durable context into the repo itself, so agents — Claude, Codex, Cursor, Copilot, cloud workers, PR bots — find what they need across every handoff. Vendor upstream source when depth matters; route docs, packs, cache links, or search when a lighter path fits.

## Quick start

```sh
npx ingraft
```

No install needed. That opens the interactive dashboard inside any project. Use `ingraft deps`, `ingraft context`, and `ingraft doctor` for non-interactive scans, snapshots, and project hygiene.

> Install methods (bun, npm, Homebrew, Nix, agent skill), strategy guides, the full CLI reference, and the rest of the documentation live at **[ingraft.dev](https://ingraft.dev)**.

## Packages

This repo is the monorepo. Each package has its own README.

- [`packages/cli`](packages/cli) — the implementation, published as [`@ingraft/cli`](https://www.npmjs.com/package/@ingraft/cli).
- [`packages/ingraft`](packages/ingraft) — the short [`ingraft`](https://www.npmjs.com/package/ingraft) entrypoint that delegates to `@ingraft/cli`.
- [`packages/skill`](packages/skill) — agent skill wrapper that runs the published CLI through `bunx`.
- [`packages/tui`](packages/tui) — internal dev/test wrapper for the CLI dashboard.
- [`packages/website`](packages/website) — the Astro/Starlight site that powers [ingraft.dev](https://ingraft.dev).

The implementation lives in `packages/cli`. The skill does not copy source files or run a local TypeScript entrypoint; it only documents how an agent should invoke the package-managed command.

---

## Development

```sh
bun install
bun run test
bun run typecheck
bun run build
```

Run the CLI dev entrypoint from the workspace:

```sh
bun run dev -- --help
```

Run the dashboard:

```sh
bun run dev:tui
```

Run the website locally (served at `https://ingraft.localhost` via Portless once the local CA is trusted):

```sh
bun run dev:website
```

Skip the Portless proxy and use the direct Astro server:

```sh
bun run dev:website:local
```

Run the built CLI with Node:

```sh
node packages/cli/dist/bin/ingraft.js --help
```

### Runtime model

The CLI is written with Effect and `@effect/platform` abstractions. The production layer uses `@effect/platform-node`, so non-interactive commands stay usable from Node.js while Bun remains the workspace test/dev runner. The default dashboard uses OpenTUI, so zero-arg `ingraft` launches it with Bun when the command is started from Node.

For deeper details see [`packages/cli/README.md`](packages/cli/README.md) (CLI internals), [`packages/skill/SKILL.md`](packages/skill/SKILL.md) (skill wrapper), and the [docs at ingraft.dev](https://ingraft.dev/docs/) (strategies, `--local-only`, fork workspaces, include filters, doctor checks).
