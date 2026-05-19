# ingraft

Standalone CLI for routing repository context into coding-agent workflows.
The main route today is durable source for external git repositories, so agents
and language tooling can read version-matched upstream source without treating
it as application code. The same CLI also helps choose lighter routes: ignored
local clones, shared cache links, repo packs, lazy source fetches, and local
search tools.

The CLI is built with Effect, `@effect/cli`, `@effect/platform`, and the Node platform layer. Bun is used for workspace development, tests, and the OpenTUI dashboard. Non-interactive subcommands stay Node-compatible; the zero-argument dashboard launches through Bun because OpenTUI is Bun-based.

## Install

```sh
npm install -g ingraft
ingraft
```

Or run without installing:

```sh
npx ingraft --help
bunx ingraft
```

Homebrew and Nix package entrypoints are also maintained in this repository:

```sh
brew tap gunta/ingraft https://github.com/gunta/ingraft
brew install ingraft

nix run github:gunta/ingraft
nix profile install github:gunta/ingraft#ingraft
```

## Commands

```sh
ingraft
ingraft deps
ingraft deps --json
ingraft deps --yes
ingraft init
ingraft zod Effect-TS/effect
ingraft add effect
ingraft add effect-smol
ingraft add convex
ingraft add Effect-TS/effect
ingraft add zod @types/node Effect-TS/effect
ingraft add react:react expo:expo react-native:react-native
ingraft add swift:apple/swift-argument-parser
ingraft add android:com.squareup.okhttp3:okhttp
ingraft add Effect-TS/effect --ref main
ingraft add https://github.com/gunta/confect/tree/effect4
ingraft add gunta/confect@effect4
ingraft add Effect-TS/effect --tag v3.21.2
ingraft add Effect-TS/effect --release latest
ingraft add Effect-TS/effect --sync-package effect
ingraft add Effect-TS/effect --exclude-ext png --max-file-size 1MB
ingraft add Effect-TS/effect --exclude-dir docs --exclude '*.snap'
ingraft add Effect-TS/effect --strategy subtree
ingraft add Effect-TS/effect --strategy submodule
ingraft add Effect-TS/effect --strategy clone-ignore
ingraft add Effect-TS/effect --strategy cache-link
ingraft add Effect-TS/effect --cloudflare-artifact
ingraft add Effect-TS/effect --local-only
ingraft add Effect-TS/effect --no-commit
ingraft add Effect-TS/effect --include-dir packages/effect/src
ingraft add Effect-TS/effect --include 'src/**/*.ts'
ingraft add Effect-TS/effect --local-only --include-dir packages/effect
ingraft add-org gunta
ingraft add-org gunta --yes
ingraft add-org gunta --language typescript,svelte --since 90d
ingraft add-org gunta --include-archived --include-forks
ingraft add-org gunta --sort name
ingraft add-org gunta --strategy clone-ignore --concurrency 8
ingraft add-org gunta --dry-run
ingraft add-org gunta --refresh
ingraft fork Effect-TS/effect
ingraft fork Effect-TS/effect --owner your-org
ingraft fork Effect-TS/effect --checkout-root ../forked
ingraft fork status
ingraft update
ingraft update effect
ingraft list
ingraft list --json
ingraft doctor
ingraft doctor --json
ingraft doctor --fix
ingraft context
ingraft context --json
ingraft context pack
ingraft context pack vendor/effect --compress
ingraft context source zod
ingraft remove effect
ingraft remove effect --dangerously-rewrite-history
ingraft refresh
```

## Local-only mode and include filters

- `--local-only` (alias `--no-commit`) writes the vendor ignore to `.git/info/exclude` (untracked) and persists metadata in `.git/ingraft/state.json` (untracked). It is valid only with `clone-ignore` and `cache-link`. When `git config ingraft.forkMode personal` is set, `--local-only` becomes the implicit default.
- `--include` and `--include-dir` are positive filters. When set, only matching paths are vendored. Combine with `--exclude*` for fine-grained selection.
- `ingraft init` prompts for `ingraft.forkMode` (personal or contribute) when a fork is detected and the mode is unset. `ingraft doctor` warns when personal mode leaves tracked vendor commits on a branch.

Running `ingraft` with no arguments opens the interactive dashboard. Use `ingraft deps` for the non-interactive package scan: it reads project `package.json`, `mix.exs`, `Package.swift`, Gradle build files, and Gradle version catalogs; resolves npm, Hex, Swift source, and Maven SCM metadata; groups packages that share the same source repo; and asks which source repos to add or update. Passing positional targets is shorthand for adding them, so `ingraft zod hex:jason swift:apple/swift-argument-parser Effect-TS/effect` routes npm, Hex, Swift, and GitHub source context in one run. Repository aliases expand before package resolution, so `ingraft add effect` expands to `Effect-TS/effect`, and `ingraft add convex` expands to the Convex client and helper repositories. `deps --yes` processes every matched task without prompting; `deps --json` prints the detected candidates and planned tasks for tools such as the dashboard.

## Repository Aliases

Common repositories can be addressed with short aliases from
`src/aliases/repository-aliases.json`. That database is also where the CLI keeps
community-maintained strategy recommendations for repositories that are known to
work better as a `submodule`, `clone-ignore`, or `cache-link` target. Explicit `--strategy`
flags always win over those recommendations.

```sh
ingraft add effect
# expands to Effect-TS/effect

ingraft add effect-smol
# expands to Effect-TS/effect-smol

ingraft add convex
# expands to get-convex/convex-js and get-convex/convex-helpers

ingraft add vscode
# expands to microsoft/vscode and defaults to --strategy submodule
```

Unknown names still fall through to the npm package metadata flow, so ordinary
package names continue to work. Use `hex:<package>` for Hex, `swift:<owner/repo>`
or `swift:<url>` for Swift Package sources, and
`android:<group>:<artifact>` for Maven-backed Android dependencies.

## Adding entire organizations

`ingraft add-org <owner>` discovers every repository under a GitHub
organization or user account, lets you filter and select them interactively
in a TUI, and clones the selected repos in parallel under
`vendor/<owner>/<repo>`. Repositories are ordered by GitHub stars descending
by default, so the largest projects are easiest to review first. Use
`--sort name` for alphabetical order or `--sort pushed` for recently updated
repositories first.

Filters can be applied as CLI flags (`--language`, `--since`, `--visibility`,
`--include-archived`, `--include-forks`, `--sort`) or interactively in the TUI. The
default strategy for org-wide adds is `clone-ignore` so a hundred-repo org
doesn't bloat the host repository's history. Pass `--yes` (or run from a
non-TTY environment) to skip the TUI.

`add-org` uses the same `gh` CLI dependency as `add`. The first call for
each owner caches the repository list for one hour under `.ingraft/state/`;
pass `--refresh` to bypass the cache.

## Fork Workspaces

`ingraft fork <upstream>` is the editable-source workflow. It keeps the normal
`vendor/` contract intact: vendored paths remain read-only reference material
for agents and language tooling, while actual edits happen in a sibling
checkout that belongs to your GitHub fork.

```sh
ingraft fork Effect-TS/effect
```

By default, the command:

1. Reads the authenticated GitHub user from `gh`.
2. Creates or reuses `github.com/<you>/effect`.
3. Clones or reuses an editable checkout at `../forked/Effect-TS/effect`
   (`<GitHub workspace>/forked/Effect-TS/effect` when the host project lives
   under a `GitHub/` directory).
4. Sets `origin` to your fork and `upstream` to the source repository.
5. Registers `vendor/Effect-TS/effect` as a read-only `cache-link --local-only`
   projection of the fork remote.
6. Records the relationship in `.git/ingraft/forks.json` for
   `ingraft fork status`.

Use `--owner <user-or-org>` when the fork should live under a specific GitHub
organization. Use `--checkout-root <path>` when your local fork workspace is
somewhere other than the default sibling `forked/` directory. Use `--name` or
`--prefix` only when the default route name or vendor path would collide.

The practical workflow is:

```sh
ingraft fork Effect-TS/effect
cd ../forked/Effect-TS/effect
# edit, commit, push, and open upstream PRs from the fork checkout
cd -
ingraft update effect
```

`ingraft update` refreshes the read-only vendor projection from the fork remote
after your fork branch has been pushed. Local unpushed edits stay in the sibling
checkout and are intentionally not reflected under `vendor/`.

## Local Configuration

Configuration is optional. Add `.ingraft/config.toml` in a project when you want
per-user defaults or private aliases; `.ingraft/` is ignored by git by default.
CLI flags still take precedence over configured defaults.

```toml
[defaults]
strategy = "clone-ignore"
ref = "main"
exclude-dirs = ["docs"]
exclude-extensions = ["png"]
max-file-size = "1MB"

[[aliases]]
alias = "fx"
description = "Effect repositories"
strategy = "clone-ignore"
targets = ["Effect-TS/effect", "Effect-TS/effect-smol"]

[[aliases]]
alias = "vscode-local"
targets = [
  { target = "microsoft/vscode", strategy = "submodule" }
]
```

Supported `[defaults]` keys mirror `ingraft add`: `strategy`, `ref`, `tag`,
`release`, `sync-package`, `cloudflare-artifact`,
`cloudflare-artifact-depth`, `cloudflare-artifact-name`, `exclude`,
`exclude-dirs`, `exclude-extensions`, and `max-file-size`. If you pass any
version selector flag (`--ref`, `--tag`, `--release`, or `--sync-package`), the
configured version selector is ignored for that command.

## Context Routes

- `subtree` - default committed source snapshot via `git subtree`.
- `submodule` - gitlink for repositories that should not be committed into the host repository.
- `clone-ignore` - local clone under `vendor/` plus generated `.gitignore` entries.
- `cache-link` - ignored symlink under `vendor/` pointing at a shared resolved-commit checkout in the ingraft cache.
- `context pack` - narrow Repomix snapshot for one-shot chat or review contexts.
- `context source` - lazy OpenSrc source lookup for packages that should not be added to the repo.
- `context` - detection of complementary local search and context tools.

When a collocated `jj` repository is detected, `add` falls back to `clone-ignore` unless `cache-link` was explicitly requested, because both local strategies avoid git subtree and submodule mutations.

### Editable source routes

Prefer `ingraft fork <upstream>` when you expect to modify upstream source. It
keeps edits in a normal sibling fork checkout and keeps `vendor/` as read-only
agent context. A fork-backed `submodule` is still useful when the parent
repository must commit an editable gitlink, but it is no longer the default
recommendation for agent-facing context.

Use `subtree` for editable source only when the patch is intentionally private
to the host project and every clone must include the patched files without an
external checkout. Use `clone-ignore` only for local experiments that do not
need team-visible commits, and `cache-link` for shared read-only local
references.

## Dangerous History Rewrites

Normal `remove` only removes the vendor from the current branch history going forward. If a committed vendor subtree made the repository too large, you can explicitly remove that vendor path from every local git ref:

```sh
ingraft remove effect --dangerously-rewrite-history
```

This requires `git-filter-repo` and runs `git filter-repo --force --path <vendor-prefix>/ --invert-paths` after the normal remove. It rewrites commit SHAs, can break open pull request diffs, invalidates signatures, and requires coordinated force-pushes plus collaborator re-clones or careful rebases. Use it from a disposable fresh clone when possible.

## Version Selection

By default, the CLI resolves the host's default branch. You can pin a branch/ref, tag, latest release, exact release, or package-synced version:

```sh
ingraft add org/repo --ref main
ingraft add https://github.com/org/repo/tree/feature-branch
ingraft add org/repo@feature-branch
ingraft add org/repo --tag v1.2.3
ingraft add org/repo --release latest
ingraft add org/repo --release v1.2.3
ingraft add org/repo --sync-package package-name
```

Pasted hosted branch URLs and `owner/repo@branch` shorthand are treated like
`--ref` when no explicit version selector flag is passed.

Package sync reads project package manifests, detects the exact package version in the same order as source-reference tools such as opensrc (`node_modules/<package>/package.json`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, then the manifest range), and maps that installed version to npm `gitHead` metadata or common upstream tag formats. React, Expo, and React Native dependencies stay npm-backed while preserving ecosystem-specific sync selectors. For Elixir projects, `mix.exs` dependencies and `mix.lock` versions resolve through Hex metadata and common upstream tag formats. Swift packages read direct `Package.swift` source URLs. Android dependencies read Gradle coordinates and version catalogs, then use Maven POM SCM metadata to find upstream repositories and tags.

Npm package targets are accepted directly, and app ecosystem targets use explicit prefixes:

```sh
ingraft zod
ingraft add zod @types/node hex:jason react:react expo:expo react-native:react-native
ingraft add swift:apple/swift-argument-parser android:com.squareup.okhttp3:okhttp Effect-TS/effect
```

## TUI

```sh
ingraft
```

Running `ingraft` with no arguments opens the interactive dashboard. It shows dependency matches and source-context tasks. It reads `ingraft deps --json`, lets you select add/update tasks, previews exact commands, and only runs them after confirmation. OpenTUI currently requires Bun, so the default dashboard needs Bun even when other subcommands are run with Node.

## Tooling Integration

`refresh` keeps agent docs and detected local tooling configuration in sync. It only writes ignore settings for tools that are present, including common TypeScript, JavaScript, Python, Rust, Swift, Android, Elixir, Zig, CSS, Markdown, editor, code-agent, and monorepo surfaces. `doctor` reports detected languages, editors, agent files, lint/format tools, monorepo tools, durable source routes, context-tool routes, ignore status, and version-sync status. `doctor --fix` runs the same generated-file repair pass before reporting, which is the fastest way to repair drift in agent docs, `.gitattributes`, editor excludes, and detected tool ignores.

The "Durable source routes" table now includes a `Type` column that
classifies each route as `own` (you own the upstream), `fork` (the
vendored repo is a fork of another GitHub repo), `upstream` (external
upstream you don't own), `non-github` (other hosts), or `unknown`
(metadata not yet cached). The classification uses `gh repo view` /
`gh api user` and caches results under `.ingraft/state/`.

Monorepo support covers package-manager workspaces plus Turborepo, Nx/Lerna, pnpm workspaces, moon, Bazel, Rush, Lage, Pants, Buck2, Gradle, Maven reactor projects, and Please. Safe automatic edits are currently applied to `turbo.json`/`turbo.jsonc`, `nx.json`, `pnpm-workspace.yaml`, `.moon/workspace.yml`, `.moon/workspace.yaml`, and `.bazelignore`; the other tools are detected and reported without source-config rewrites.

## Optional Context Tools

Vendored source is the durable route. `ingraft context` covers lighter routes
for cases where committing source is too heavy, too temporary, or the wrong
authority boundary:

```sh
ingraft context
ingraft context --json
ingraft context pack
ingraft context pack vendor/effect --compress
ingraft context source zod
```

`context` detects curated optional tools in the repository: Repomix for AI-readable snapshots, OpenSrc for long-tail dependency source paths, and Repobase for local semantic search. `context pack` wraps `npx -y repomix@latest` and defaults to `vendor/`; pass paths when you want a narrower snapshot. `context source <target>` wraps `npx -y opensrc@latest path <target>` and prints the cached source path.

## Development

From the workspace root:

```sh
bun install
bun run test
bun run typecheck
bun run build
```

Development entrypoint:

```sh
bun packages/cli/scripts/vendor.ts --help
```

Built Node entrypoint:

```sh
node packages/cli/dist/bin/ingraft.js --help
```
