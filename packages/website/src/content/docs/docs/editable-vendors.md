---
title: Editable Vendors
description: Choose the right strategy when vendored source needs local changes.
---

Most vendored source should be treated as read-only reference material. When you
know the project needs to modify the vendor, use a different workflow on purpose.

## Recommendation

Use a fork-backed `submodule` for durable vendor modifications.

```sh
ingraft add your-org/effect --strategy submodule --ref vendor-patches
```

This keeps the parent repository small while making the vendor changes real git
commits in a repository that can be pushed, reviewed, rebased, and opened as an
upstream pull request. The parent project records the submodule pointer; the fork
records the patch history.

## Why Not Subtree First?

`subtree` is still the best default for read-only source because every checkout
gets files immediately and agents do not need to initialize nested repositories.
It is less clean when the vendor itself is under active development:

- vendor patches are mixed into the host repository history
- upstreaming requires `git subtree split` or manual patch extraction
- update conflicts happen in the parent repository
- ownership is less obvious during review

Use `subtree` for editable code only when the patch is intentionally private to
the host project and you want every clone to include the patched files without a
submodule init step.

## Workflow

1. Fork the upstream repository.
2. Create a long-lived branch in the fork, for example `vendor-patches`.
3. Add the fork as a submodule with `--strategy submodule --ref vendor-patches`.
4. Make vendor changes inside `vendor/<name>/`.
5. Commit and push those changes inside the submodule.
6. From the parent repository, commit the updated submodule pointer.
7. Open an upstream pull request from the fork when the patch should be shared.

```sh
cd vendor/effect
git switch -c fix-runtime-edge-case
# edit vendor files
git add .
git commit -m "fix runtime edge case"
git push origin fix-runtime-edge-case

cd ../..
git add vendor/effect
git commit -m "vendor: point effect at fork patch"
```

If the patch becomes unnecessary after an upstream release, update the vendored
target back to the upstream repository or a release tag.

## Strategy Guide

| Need                                                        | Strategy                |
| ----------------------------------------------------------- | ----------------------- |
| Read-only source for agents and LSPs                        | `subtree`               |
| Large read-only source that should not enter parent history | `submodule`             |
| Durable vendor patches, forks, or upstream PRs              | fork-backed `submodule` |
| Local experiment that should not be committed               | `clone-ignore`          |
| Shared read-only local reference across projects            | `cache-link`            |
| Colocated `jj` workspace                                    | `clone-ignore`          |

`clone-ignore` is useful for debugging and local exploration, and `cache-link`
is useful for shared read-only local references. Neither is a team-visible patch
workflow. If a change matters, move it to a fork-backed submodule or commit it
intentionally through `subtree`.

## Agent Instructions

When using editable vendors, update agent docs with the ownership rule:

- read-only vendors: inspect and learn from source, do not modify
- editable fork submodules: changes are allowed, but commits belong inside the
  submodule first
- clone-ignore vendors: local scratch only, do not rely on changes for CI or
  review
- cache-link vendors: shared read-only cache source, recreate links instead of
  editing through `vendor/`

This prevents coding agents from accidentally editing reference-only source while
still giving them a clear path for deliberate vendor patches.
