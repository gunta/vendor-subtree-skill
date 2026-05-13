# ingraft workspace

[![skills.sh](https://skills.sh/b/gunta/ingraft)](https://skills.sh/gunta/ingraft)

Monorepo for the `ingraft` CLI and the agent skill that delegates to it.

## Packages

- `packages/cli` - standalone CLI and OpenTUI dashboard published as `ingraft`.
- `packages/skill` - skill wrapper that runs the published CLI with `bunx`.
- `packages/tui` - internal development/test wrapper for the CLI dashboard.
- `packages/website` - Astro/Starlight marketing site and documentation.

The implementation lives in the CLI package. The skill does not copy source files or run a local TypeScript entrypoint; it only documents how an agent should invoke the package-managed command.

## Install

Run the CLI without installing it globally:

```sh
bunx ingraft@latest
npx ingraft@latest --help
```

Install through package managers:

```sh
brew tap gunta/ingraft https://github.com/gunta/ingraft
brew install ingraft

nix run github:gunta/ingraft
nix profile install github:gunta/ingraft#ingraft
```

Install the agent skill through `skills.sh`:

```sh
npx skills add gunta/ingraft
```

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

Run dependency discovery from a project:

```sh
ingraft
ingraft tui
ingraft zod hex:jason swift:apple/swift-argument-parser Effect-TS/effect
ingraft add react:react expo:expo react-native:react-native
ingraft add android:com.squareup.okhttp3:okhttp
ingraft deps --json
ingraft deps --yes
ingraft context
ingraft context pack vendor/effect --compress
ingraft context source zod
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
