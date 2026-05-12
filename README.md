# vendor-subtree-skill

A cross-agent skill that vendors external git repositories into your project as `git subtree` directories, so coding agents (Claude Code, Codex, Cursor, etc.) can read the source as plain files instead of guessing from docs and web snippets.

Inspired by [Maxwell Brown's post on the Effect blog](https://effect.website/blog/the-one-weird-git-trick-that-makes-coding-agents-more-effect-ive/).

[![skills.sh](https://skills.sh/b/gunta/vendor-subtree-skill)](https://skills.sh/gunta/vendor-subtree-skill)

## What you get

After one command:

- `vendor/<name>/` — the external repo's source, flat files, no submodule boundary.
- An auto-generated `<!-- vendor-subtree-skill:begin -->` section in `AGENTS.md` (and `CLAUDE.md` if present) telling every agent how to treat the vendored code.
- `.vscode/settings.json` exclusions so the editor doesn't suggest auto-imports from, search, or watch the vendored directory.
- A clean `--squash`ed commit per add/update.

**No manifest file.** Metadata lives in git commit trailers, so git itself is the source of truth.

**Standalone CLI.** The tool is a Bun + TypeScript package built on [Effect](https://effect.website/) (`@effect/cli`, `@effect/platform`, `@effect/platform-bun`, and Effect Schema). It can run as a project-local script with `bun scripts/vendor.ts`, or as an installed CLI via the `vendor-subtree` bin.

## Install

### Via skills.sh (recommended)

```bash
npx skills add gunta/vendor-subtree-skill
```

This installs to the right path for each agent you have (`~/.claude/skills/`, `~/.codex/skills/`, `~/.cursor/skills/`, etc).

### Manually for a single agent

```bash
# Claude Code
git clone https://github.com/gunta/vendor-subtree-skill ~/.claude/skills/vendor-subtree-skill

# Codex
git clone https://github.com/gunta/vendor-subtree-skill ~/.codex/skills/vendor-subtree-skill

# Cursor (project-local only)
git clone https://github.com/gunta/vendor-subtree-skill .cursor/skills/vendor-subtree-skill
```

### As a standalone CLI

Clone and run it directly:

```bash
git clone https://github.com/gunta/vendor-subtree-skill
cd vendor-subtree-skill
bun install
cd /path/to/your/project
bun /path/to/vendor-subtree-skill/scripts/vendor.ts init
```

For global local development, link the bin:

```bash
bun link
vendor-subtree --help
```

## Requirements

- **Bun** ≥ 1.0 — `curl -fsSL https://bun.sh/install | bash` or `npm install -g bun`
- **git** with `git subtree` (ships with git ≥ 1.7.11; present in every modern install)

## Caveats

- **Dependencies are pinned by `bun.lock`.** The package commits its runtime dependencies instead of relying on Bun auto-install.
- **`.vscode/settings.json` is parsed as JSONC.** Comments and existing formatting are preserved where possible via `jsonc-parser`.

## Usage

In an agent that has the skill installed, just talk:

> subtree Effect-TS/effect

> vendor the effect-smol repo too

> what's vendored?

> update all vendored repos

> remove effect

Or run the script directly. Auto-generated help is available for every command:

```bash
bun scripts/vendor.ts --help                            # full help (powered by @effect/cli)
bun scripts/vendor.ts add --help                        # per-subcommand help
bun scripts/vendor.ts --version                         # 0.3.0

bun scripts/vendor.ts init                              # one-time bootstrap
bun scripts/vendor.ts add Effect-TS/effect              # add a vendored repo
bun scripts/vendor.ts add Effect-TS/effect --ref main   # pin a ref
bun scripts/vendor.ts add git@github.com:org/lib.git    # SSH (private)
bun scripts/vendor.ts update Hello-World                # pull latest
bun scripts/vendor.ts update --all                      # pull all
bun scripts/vendor.ts list                              # show what's vendored
bun scripts/vendor.ts list --json                       # machine-readable
bun scripts/vendor.ts remove Hello-World                # remove
bun scripts/vendor.ts refresh                           # regenerate AGENTS.md + .vscode
bun scripts/vendor.ts --completions zsh                 # generate shell completions
```

## How it works

`git subtree` already records `git-subtree-dir:` trailers in the commit messages it creates. This skill adds two more — `vendor-source-url:` and `vendor-source-ref:` — to the merge commit it generates for every `add` and `update`:

```
vendor: add effect (https://github.com/Effect-TS/effect.git@main)

git-subtree-dir: vendor/effect
vendor-source-url: https://github.com/Effect-TS/effect.git
vendor-source-ref: main
```

`list`, `update`, and `refresh` discover the current state from `git log` trailer placeholders and validate parsed records with Effect Schema. No `.vendor.json`, no hidden state.

## Why subtree, not submodule

For the "agent reads source as reference" use case, subtree is materially better:

- Submodule boundaries (`.git` inside the submodule directory) cause many agents' file-search tools to stop traversal. There are open issues on Claude Code documenting this for Glob/Grep/LS. Subtree directories are just files.
- Submodules require explicit init after clone (`git submodule update --init --recursive`) — easy to forget, breaks CI for the unaware.
- Codex Cloud and similar ephemeral environments need per-submodule auth setup to clone private submodules. Subtree's content is already in the parent repo.

The tradeoff is repo size: subtrees commit the full content (squashed). For the agent-reference use case, that's the right tradeoff.

## Compatibility

| Agent | Project path | Verified |
|---|---|---|
| Claude Code | `.claude/skills/` | ✓ |
| Codex | `.agents/skills/` | ✓ |
| Cursor | `.cursor/skills/` | ✓ |
| Any AGENTS.md-aware agent | n/a — reads project `AGENTS.md` | ✓ |

After initialization, `AGENTS.md` references the command form that was used: project-local runs point at `bun scripts/vendor.ts`, while installed CLI runs point at `vendor-subtree`.

## Development (skill maintainers)

The CLI is split into focused TypeScript modules under `src/`, with `scripts/vendor.ts` kept as the Bun entrypoint.

```bash
bun install
bun test
bun run typecheck
bun scripts/vendor.ts --help
```

Key modules:

- `src/cli.ts` wires the top-level Effect CLI and pretty logging.
- `src/commands/` contains each subcommand implementation.
- `src/git.ts` exposes git through an injectable Effect service.
- `src/errors.ts` defines the typed domain error union used in the Effect error channel.
- `src/log.ts` keeps colors and command spans consistent.
- `src/project-files.ts` owns the shared AGENTS/CLAUDE/VS Code refresh flow.
- `src/vendor-state.ts` reads git trailers and validates repo records with Effect Schema diagnostics.
- `src/vscode-settings.ts` edits JSONC settings without stripping comments.

## License

MIT.
