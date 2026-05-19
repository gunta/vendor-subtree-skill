---
name: ingraft
description: Routes repository context into coding-agent workflows. Use when the user wants to add durable upstream source under vendor/, choose between subtree, submodule, ignored clone, or cache-linked checkouts, pack context for chat, fetch dependency source, detect optional context tools, scan package manifests for context candidates, run any ingraft command, or refresh agent/editor hygiene in a monorepo. Also use when the user mentions git subtree, vendored dependencies, repository context, context routing, Repomix, OpenSrc, or bundling upstream source into a project.
---

# ingraft

Thin agent wrapper around the `ingraft` CLI. The repository-context implementation lives in the npm package; the skill never executes a local TypeScript entrypoint.

The repository root `SKILL.md` is the install target for `skills.sh`:

```sh
npx skills add gunta/ingraft
```

## Invocation

Prefer the package-managed CLI:

```sh
bunx @ingraft/cli@latest --help
```

If the command is already installed in the project or globally, use:

```sh
ingraft --help
```

Do not run `scripts/vendor.ts` from the repository. The skill intentionally delegates to the published CLI so agents get the current standalone implementation.

## Intent Routing

| User intent                                  | Command                                                        |
| -------------------------------------------- | -------------------------------------------------------------- |
| "open dashboard", "TUI"                      | `bunx @ingraft/cli@latest` or `bunx @ingraft/cli@latest tui`   |
| "scan dependencies for context"              | `bunx @ingraft/cli@latest deps`                                |
| "set up repository context"                  | `bunx @ingraft/cli@latest init`                                |
| "add durable source context"                 | `bunx @ingraft/cli@latest add <repo>`                          |
| "add these packages/repos as context"        | `bunx @ingraft/cli@latest <package-or-repo> <package-or-repo>` |
| "show context routes"                        | `bunx @ingraft/cli@latest list`                                |
| "refresh agent docs/tool ignores"            | `bunx @ingraft/cli@latest refresh`                             |
| "check context health"                       | `bunx @ingraft/cli@latest doctor`                              |
| "repair context hygiene drift"               | `bunx @ingraft/cli@latest doctor --fix`                        |
| "detect optional context tools"              | `bunx @ingraft/cli@latest context`                             |
| "pack repository or vendor context for chat" | `bunx @ingraft/cli@latest context pack`                        |
| "fetch dependency source path"               | `bunx @ingraft/cli@latest context source <package>`            |
| "remove durable source context"              | `bunx @ingraft/cli@latest remove <name>`                       |
| "purge vendored source from git history"     | See "Destructive history rewrite" below                        |

## Common Commands

```sh
bunx @ingraft/cli@latest
bunx @ingraft/cli@latest tui
bunx @ingraft/cli@latest deps
bunx @ingraft/cli@latest deps --json
bunx @ingraft/cli@latest deps --yes
bunx @ingraft/cli@latest init
bunx @ingraft/cli@latest zod Effect-TS/effect
bunx @ingraft/cli@latest add Effect-TS/effect
bunx @ingraft/cli@latest add zod @types/node Effect-TS/effect
bunx @ingraft/cli@latest add Effect-TS/effect --ref main
bunx @ingraft/cli@latest add Effect-TS/effect --tag v3.21.2
bunx @ingraft/cli@latest add Effect-TS/effect --release latest
bunx @ingraft/cli@latest add Effect-TS/effect --sync-package effect
bunx @ingraft/cli@latest add Effect-TS/effect --exclude-ext png --max-file-size 1MB
bunx @ingraft/cli@latest add Effect-TS/effect --exclude-dir docs --exclude '*.snap'
bunx @ingraft/cli@latest add Effect-TS/effect --strategy subtree
bunx @ingraft/cli@latest add Effect-TS/effect --strategy submodule
bunx @ingraft/cli@latest add Effect-TS/effect --strategy clone-ignore
bunx @ingraft/cli@latest add Effect-TS/effect --strategy cache-link
bunx @ingraft/cli@latest update effect
bunx @ingraft/cli@latest update --all
bunx @ingraft/cli@latest list
bunx @ingraft/cli@latest doctor
bunx @ingraft/cli@latest doctor --fix
bunx @ingraft/cli@latest context
bunx @ingraft/cli@latest context --json
bunx @ingraft/cli@latest context pack vendor/effect --compress
bunx @ingraft/cli@latest context source zod
bunx @ingraft/cli@latest remove effect
bunx @ingraft/cli@latest refresh
```

## Behavior Notes

- The default strategy is `subtree`.
- Use `submodule` when the upstream repository should stay separate from the host commit history.
- Use `clone-ignore` for very large repositories, local-only references, or jj-collocated repositories.
- Use `cache-link` when repeated local projects should share one read-only resolved-commit checkout through an ignored `vendor/` symlink.
- Use filters to omit directories, file extensions, globs, or files over a size limit.
- Use `--sync-package <name>` when durable source should follow the version used by the host package manifest; use `hex:<name>`, `swift:<owner/repo>`, or `android:<group>:<artifact>` for non-npm ecosystems.
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
bunx @ingraft/cli@latest remove <name> --dangerously-rewrite-history
```

If any box is unchecked, stop and clarify with the user before proceeding.
