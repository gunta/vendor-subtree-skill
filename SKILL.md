---
name: ingraft
description: Vendors upstream repositories into a project's vendor/ directory via git subtree, submodule, or ignored clone. Use when the user wants to vendor a dependency, copy upstream source for offline agent reference, scan package manifests for vendoring candidates, run any ingraft command, or set up, refresh, update, or remove vendored repos in a monorepo. Also use when the user mentions git subtree, vendored dependencies, or bundling upstream source into a project.
---

# ingraft

Thin agent wrapper around the `ingraft` CLI. The vendoring implementation lives in the npm package; the skill never executes a local TypeScript entrypoint.

This root `SKILL.md` is the install target for `skills.sh`:

```sh
npx skills add gunta/ingraft
```

## Invocation

Prefer the package-managed CLI:

```sh
bunx ingraft@latest --help
```

If the command is already installed in the project or globally, use:

```sh
ingraft --help
```

Do not run `scripts/vendor.ts` from the repository. The skill intentionally delegates to the published CLI so agents get the current standalone implementation.

## Intent Routing

| User intent                                     | Command                                                   |
| ----------------------------------------------- | --------------------------------------------------------- |
| "open dashboard", "TUI"                         | `bunx ingraft@latest` or `bunx ingraft@latest tui`        |
| "auto vendor dependencies", "scan dependencies" | `bunx ingraft@latest deps`                                |
| "set up vendoring"                              | `bunx ingraft@latest init`                                |
| "vendor this repo"                              | `bunx ingraft@latest add <repo>`                          |
| "vendor these packages/repos"                   | `bunx ingraft@latest <package-or-repo> <package-or-repo>` |
| "show vendored repos"                           | `bunx ingraft@latest list`                                |
| "refresh agent docs/tool ignores"               | `bunx ingraft@latest refresh`                             |
| "check vendor status"                           | `bunx ingraft@latest doctor`                              |
| "repair vendor hygiene drift"                   | `bunx ingraft@latest doctor --fix`                        |
| "detect optional context tools"                 | `bunx ingraft@latest context`                             |
| "pack vendored context for chat"                | `bunx ingraft@latest context pack`                        |
| "fetch dependency source path"                  | `bunx ingraft@latest context source <package>`            |
| "remove vendored repo"                          | `bunx ingraft@latest remove <name>`                       |
| "purge vendored repo from git history"          | See "Destructive history rewrite" below                   |

## Common Commands

```sh
bunx ingraft@latest
bunx ingraft@latest tui
bunx ingraft@latest deps
bunx ingraft@latest deps --json
bunx ingraft@latest deps --yes
bunx ingraft@latest init
bunx ingraft@latest zod Effect-TS/effect
bunx ingraft@latest add Effect-TS/effect
bunx ingraft@latest add zod @types/node Effect-TS/effect
bunx ingraft@latest add Effect-TS/effect --ref main
bunx ingraft@latest add Effect-TS/effect --tag v3.21.2
bunx ingraft@latest add Effect-TS/effect --release latest
bunx ingraft@latest add Effect-TS/effect --sync-package effect
bunx ingraft@latest add Effect-TS/effect --exclude-ext png --max-file-size 1MB
bunx ingraft@latest add Effect-TS/effect --exclude-dir docs --exclude '*.snap'
bunx ingraft@latest add Effect-TS/effect --strategy subtree
bunx ingraft@latest add Effect-TS/effect --strategy submodule
bunx ingraft@latest add Effect-TS/effect --strategy clone-ignore
bunx ingraft@latest update effect
bunx ingraft@latest update --all
bunx ingraft@latest list
bunx ingraft@latest doctor
bunx ingraft@latest doctor --fix
bunx ingraft@latest context
bunx ingraft@latest context tools --json
bunx ingraft@latest context pack vendor/effect --compress
bunx ingraft@latest context source zod
bunx ingraft@latest remove effect
bunx ingraft@latest refresh
```

## Behavior Notes

- The default strategy is `subtree`.
- Use `submodule` when the upstream repository should stay separate from the host commit history.
- Use `clone-ignore` for very large repositories, local-only references, or jj-collocated repositories.
- Use filters to omit directories, file extensions, globs, or files over a size limit.
- Use `--sync-package <name>` when the vendored source should follow the version used by the host package manifest; use `hex:<name>`, `swift:<owner/repo>`, or `android:<group>:<artifact>` for non-npm ecosystems.
- Npm, React, Expo, and React Native package targets use exact installed/locked versions when available: `node_modules`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, then `bun.lock`.
- Hex package targets use `mix.lock` when available and fall back to Hex package metadata.
- Swift package targets read direct `Package.swift` source URLs. Android package targets read Gradle coordinates and Maven POM SCM metadata.
- Running `ingraft` with no arguments opens the interactive TUI. Agents should use `ingraft deps` for the non-interactive package scan.
- `doctor` is the first diagnostic command to run when tooling/editor ignore behavior looks wrong.
- `doctor --fix` repairs generated agent docs, repository hygiene files, editor settings, and detected tool ignores before reporting.
- `context` detects curated optional context tools. `context pack` wraps Repomix for snapshots, and `context source` wraps OpenSrc for local source paths.
- Monorepo tooling is supported through `doctor`/`refresh`: Turborepo, Nx/Lerna, pnpm workspaces, moon, Bazel, Rush, Lage, Pants, Buck2, Gradle, Maven reactor projects, Please, and package-manager workspaces.

## Destructive history rewrite

`remove --dangerously-rewrite-history` deletes a vendor path from every commit in every local ref. Use only when the user explicitly asks to purge a vendor from git history (for example, to remove a leaked secret or a large vendored binary). A plain `remove` is almost always sufficient.

Work through this checklist before invoking it:

```
- [ ] User explicitly asked to rewrite history (not just remove the vendor)
- [ ] `git filter-repo --version` succeeds (dependency is installed)
- [ ] `git status` is clean
- [ ] User understands every commit SHA after the vendor's introduction will change
- [ ] User has a plan for coordinating force-pushes or re-clones with collaborators
- [ ] Open PRs and tags pointing at old SHAs are accounted for
```

Run only after every box is checked:

```sh
bunx ingraft@latest remove <name> --dangerously-rewrite-history
```

If any box is unchecked, stop and clarify with the user before proceeding.
