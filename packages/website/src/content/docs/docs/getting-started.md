---
title: Getting Started
description: Install the CLI, scan a project, and add your first vendored source.
---

![Engraving of a grafting knife laid diagonally beside a fresh scion-cutting.](/visuals/section-getting-started.png)

Run the CLI from the root of the project that should receive source:

```sh
bunx ingraft
```

The zero-argument command opens the interactive dashboard. For a plain
non-interactive dependency scan, run:

```sh
ingraft deps
```

You can also pass targets directly:

```sh
ingraft effect zod Effect-TS/effect
```

With targets, each argument can be an alias, a package name, an owner/repo
shortcut, or a git URL.

Popular aliases are built in:

```sh
ingraft add effect
ingraft add effect-smol
ingraft add convex
```

`effect` expands to `Effect-TS/effect`. `effect-smol` expands to
`Effect-TS/effect-smol`. `convex` expands to both `get-convex/convex-js` and
`get-convex/convex-helpers`.

## First commands

```sh
ingraft deps
ingraft deps --json
ingraft add effect --strategy subtree --sync-package effect
ingraft list
ingraft doctor
```

If you expect to edit the vendored source, choose the strategy up front. A
fork-backed submodule is the recommended workflow for durable vendor patches:

```sh
ingraft add your-org/effect --strategy submodule --ref vendor-patches
```

Use `subtree` for normal read-only reference source, `clone-ignore` for local
experiments that should not be committed, and `cache-link` when multiple local
projects should share the same large read-only checkout.

## Where source goes

By default, vendored repositories live under `vendor/`. The tool also updates the
project surfaces that matter for the detected stack: editor settings, lint ignores,
agent notes, `.gitignore`, and `.gitattributes`.

The CLI only writes tool-specific files when the tool is already present in the
project.
