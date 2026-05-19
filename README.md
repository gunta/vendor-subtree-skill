# ingraft workspace

[![skills.sh](https://skills.sh/b/gunta/ingraft)](https://skills.sh/gunta/ingraft)

Monorepo for the `ingraft` CLI, website, dashboard, and agent skill.

`ingraft` is a repository-context tool for coding agents. Its main route today is
version-matched upstream source under `vendor/`, but it also helps choose lighter
routes: ignored local clones, shared cache links, narrow repo packs, lazy source
fetches, local search tools, and generated project instructions.

## Packages

- `packages/cli` - standalone CLI and OpenTUI dashboard published as `@ingraft/cli`.
- `packages/skill` - skill wrapper that runs the published CLI with `bunx`.
- `packages/tui` - internal development/test wrapper for the CLI dashboard.
- `packages/website` - Astro/Starlight marketing site and documentation.

The implementation lives in the CLI package. The skill does not copy source files or run a local TypeScript entrypoint; it only documents how an agent should invoke the package-managed command.

## Install

Run the CLI without installing it globally:

```sh
bunx @ingraft/cli@latest
npx @ingraft/cli@latest --help
pnpm dlx @ingraft/cli@latest deps
yarn dlx @ingraft/cli@latest doctor
```

Install through JavaScript package managers:

```sh
npm install -g @ingraft/cli
bun add -g @ingraft/cli
pnpm add -g @ingraft/cli
yarn global add @ingraft/cli
```

The short `npx ingraft@latest` and `npm install -g ingraft` entrypoints remain
available as compatibility aliases.

Install through the hosted shell bootstrap:

```sh
curl -fsSL https://ingraft.dev/install.sh | sh
```

Install through Homebrew or Nix:

```sh
brew tap oven-sh/bun
brew tap gunta/ingraft https://github.com/gunta/ingraft
brew install ingraft

nix run github:gunta/ingraft
nix profile install github:gunta/ingraft#ingraft
```

Install the agent skill through `skills.sh`:

```sh
npx skills add gunta/ingraft
```

See the website [Installation](https://ingraft.dev/docs/installation/) guide for runtime notes and package-manager-specific details.

## Development

```sh
bun install
bun run test
bun run typecheck
bun run build
```

Run the development entrypoint from the workspace:

```sh
bun run dev -- --help
```

Run the built CLI with Node:

```sh
node packages/cli/dist/bin/ingraft.js --help
```

Run context and dependency discovery from a project:

```sh
ingraft
ingraft tui
ingraft zod hex:jason swift:apple/swift-argument-parser Effect-TS/effect
ingraft add react:react expo:expo react-native:react-native
ingraft add android:com.squareup.okhttp3:okhttp
ingraft add https://github.com/gunta/confect/tree/effect4
ingraft add gunta/confect@effect4
ingraft deps --json
ingraft deps --yes
ingraft context
ingraft context pack vendor/effect --compress
ingraft context source zod
ingraft fork Effect-TS/effect
ingraft add Effect-TS/effect --local-only --include-dir packages/effect/src
git config ingraft.forkMode personal
ingraft init
ingraft doctor
```

`ingraft` with no arguments opens the interactive dashboard. Use `ingraft deps` for the non-interactive dependency scanner across npm `package.json`, Elixir `mix.exs`, Swift `Package.swift`, and Android Gradle manifests.

Run the dashboard from this workspace:

```sh
bun run dev:tui
```

Run the website locally:

```sh
bun run dev:website
```

The website dev script runs through Portless and is served at `https://ingraft.localhost`
after the local Portless CA is trusted. Use the direct Astro server when you need to
bypass the proxy:

```sh
bun run dev:website:local
```

## Runtime Model

The CLI is written with Effect and `@effect/platform` abstractions. The production layer uses `@effect/platform-node`, so non-interactive commands remain usable from Node.js while Bun remains the workspace test/dev runner. The default dashboard uses OpenTUI, so zero-arg `ingraft` launches it with Bun when the command is started from Node.

See [packages/cli/README.md](packages/cli/README.md) for CLI usage and [packages/skill/SKILL.md](packages/skill/SKILL.md) for the skill wrapper.

## Local-only mode

`--local-only` (alias `--no-commit`) vendors a repository entirely outside tracked git state. The ignore block is written to `.git/info/exclude` (untracked, per-clone) and metadata is persisted in `.git/ingraft/state.json` (also untracked). No commits are added to the host repository — vendored source never leaks to a fork's upstream when you push.

The flag is valid only with the `clone-ignore` and `cache-link` strategies. The `subtree` and `submodule` strategies commit upstream source by definition and are incompatible.

When the repo is a fork and you set `git config ingraft.forkMode personal`, `--local-only` becomes the implicit default for `add`. Use `ingraft init` to set fork mode interactively; `ingraft doctor` flags when a fork in personal mode has tracked vendor commits that would push upstream.

## Fork workspaces

Use `ingraft fork <upstream>` when you want to patch or study an upstream repository without turning `vendor/` into the editing surface:

```sh
ingraft fork Effect-TS/effect
```

The command creates or reuses your GitHub fork, clones or reuses an editable checkout in a parallel workspace such as `../forked/Effect-TS/effect`, and registers a read-only local vendor projection at `vendor/Effect-TS/effect` using `cache-link --local-only`. Agents can keep reading source under `vendor/`; edits, commits, pushes, and upstream pull requests happen in the sibling fork checkout.

## Include filters

In addition to the existing `--exclude`, `--exclude-dir`, `--exclude-ext`, and `--max-file-size` filters, `--include` and `--include-dir` provide positive selection — only matching paths are vendored. Combine for fine-grained control:

```sh
ingraft add Effect-TS/effect --include-dir packages/effect/src --include 'src/**/*.ts' --exclude '*.snap'
```
