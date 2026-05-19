---
name: ingraft
description: Routes repository context into coding-agent workflows. Use when the user wants to add durable upstream source under vendor/, choose between subtree, submodule, ignored clone, or cache-linked checkouts, pack context for chat, fetch dependency source, detect optional context tools, scan package manifests for context candidates, run any ingraft command, or refresh agent/editor hygiene in a monorepo. Also use when the user mentions git subtree, vendored dependencies, repository context, context routing, Repomix, OpenSrc, or bundling upstream source into a project.
---

# ingraft

Thin agent wrapper around the `ingraft` CLI. The repository-context implementation lives in the npm package; the skill never executes a local TypeScript entrypoint.

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
| "scan dependencies for context"                 | `bunx ingraft@latest deps`                                |
| "set up repository context"                     | `bunx ingraft@latest init`                                |
| "add durable source context"                    | `bunx ingraft@latest add <repo>`                          |
| "add these packages/repos as context"           | `bunx ingraft@latest <package-or-repo> <package-or-repo>` |
| "show context routes"                           | `bunx ingraft@latest list`                                |
| "refresh agent docs/tool ignores"               | `bunx ingraft@latest refresh`                             |
| "check context health"                          | `bunx ingraft@latest doctor`                              |
| "repair context hygiene drift"                  | `bunx ingraft@latest doctor --fix`                        |
| "detect optional context tools"                 | `bunx ingraft@latest context`                             |
| "pack repository or vendor context for chat"    | `bunx ingraft@latest context pack`                        |
| "fetch dependency source path"                  | `bunx ingraft@latest context source <package>`            |
| "vendor without committing", "fork-safe vendor" | `bunx ingraft@latest add <repo> --local-only`             |
| "fork and edit upstream source"                 | `bunx ingraft@latest fork <repo>`                         |
| "vendor only these dirs"                        | `bunx ingraft@latest add <repo> --include-dir <path>`     |
| "configure fork mode"                           | `bunx ingraft@latest init`                                |
| "remove durable source context"                 | `bunx ingraft@latest remove <name>`                       |
| "purge vendored source from git history"        | See "Destructive history rewrite" below                   |

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
bunx ingraft@latest add Effect-TS/effect --strategy cache-link
bunx ingraft@latest add Effect-TS/effect --local-only
bunx ingraft@latest add Effect-TS/effect --no-commit
bunx ingraft@latest add Effect-TS/effect --include-dir packages/effect/src
bunx ingraft@latest add Effect-TS/effect --include 'src/**/*.ts'
bunx ingraft@latest add Effect-TS/effect --local-only --include-dir packages/effect
bunx ingraft@latest fork Effect-TS/effect
bunx ingraft@latest fork Effect-TS/effect --owner your-org
bunx ingraft@latest fork status
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
- Use `cache-link` when repeated local projects should share one read-only resolved-commit checkout through an ignored `vendor/` symlink.
- Use `fork <repo>` when upstream source should be editable: it creates or reuses a GitHub fork, clones an editable checkout beside the host repo (for example `../forked/<upstream-owner>/<repo>`), and registers a read-only `cache-link --local-only` vendor projection under `vendor/`.
- Use filters to omit directories, file extensions, globs, or files over a size limit.
- Use `--sync-package <name>` when durable source should follow the version used by the host package manifest; use `hex:<name>`, `swift:<owner/repo>`, or `android:<group>:<artifact>` for non-npm ecosystems.
- Npm, React, Expo, and React Native package targets use exact installed/locked versions when available: `node_modules`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, then `bun.lock`.
- Hex package targets use `mix.lock` when available and fall back to Hex package metadata.
- Swift package targets read direct `Package.swift` source URLs. Android package targets read Gradle coordinates and Maven POM SCM metadata.
- Running `ingraft` with no arguments opens the interactive TUI. Agents should use `ingraft deps` for the non-interactive package scan.
- `--local-only` (alias `--no-commit`) writes the vendor ignore to `.git/info/exclude` (untracked) and persists metadata in `.git/ingraft/state.json` (untracked). It is valid only with `clone-ignore` and `cache-link`. When `git config ingraft.forkMode personal` is set, `--local-only` becomes the implicit default.
- `--include` and `--include-dir` are positive filters. When set, only matching paths are vendored. Combine with `--exclude*` for fine-grained selection.
- `ingraft init` prompts for `ingraft.forkMode` (personal or contribute) when a fork is detected and the mode is unset. `ingraft doctor` warns when personal mode leaves tracked vendor commits on a branch.
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
