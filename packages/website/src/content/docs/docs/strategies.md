---
title: Strategies
description: Choose subtree, submodule, clone-ignore, or cache-link for each vendored source.
---

Each vendored target has a strategy. The default is `subtree` because it gives the
project a portable, reviewable copy of upstream source.

## Subtree

Use `subtree` when the source is small enough to commit and you want every clone
of your project to include it.

```sh
ingraft add effect --strategy subtree
```

## Submodule

Use `submodule` when the upstream repository is large or you want a pinned git
relationship without copying its contents into your own history.

```sh
ingraft add rust-lang/rust --strategy submodule
```

Submodules are also the preferred strategy when the vendor is meant to be edited.
Use a fork URL and a branch in that fork so vendor patches live as normal commits
that can be pushed and upstreamed:

```sh
ingraft add your-org/effect --strategy submodule --ref vendor-patches
```

See [Editable Vendors](./editable-vendors/) for the full workflow.

## Clone-ignore

Use `clone-ignore` when source should exist locally for agents and LSPs but should
not be committed.

```sh
ingraft add Effect-TS/effect --strategy clone-ignore
```

If the project has a colocated `jj` repository, the CLI falls back to clone-ignore
because jj does not yet support git subtree and submodule workflows directly.

## Cache-link

Use `cache-link` when several projects need the same large read-only source and
you want to avoid duplicating full checkouts on disk.

```sh
ingraft add Effect-TS/effect --strategy cache-link
```

The CLI stores a resolved commit checkout under the shared ingraft cache and
places an ignored symlink at `vendor/<name>`. The vendor path stays visible to
agents and language tooling, while fresh clones can recreate the link with
`ingraft update <name>` or `ingraft doctor --fix`.

## Filters

Large or irrelevant files can be filtered during vendoring when the strategy
supports it:

```sh
ingraft add Effect-TS/effect \
  --exclude "**/*.png" \
  --exclude-dir docs/generated \
  --max-file-size 1MB
```

This keeps non-source artifacts out of the vendor tree when they do not help the
coding workflow.

## Choosing for Ownership

| Ownership model                                 | Recommended strategy |
| ----------------------------------------------- | -------------------- |
| Read-only reference source                      | `subtree`            |
| Editable vendor with a fork or upstream PR path | `submodule`          |
| Local scratch checkout                          | `clone-ignore`       |
| Shared local read-only checkout                 | `cache-link`         |

The default `subtree` path optimizes for agent visibility. The fork-backed
`submodule` path optimizes for patch ownership. The `cache-link` path optimizes
for repeated large references across multiple local projects.
