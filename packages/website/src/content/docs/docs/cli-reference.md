---
title: CLI Reference
description: Common commands for scanning, adding, updating, listing, and removing context routes.
---

![Engraving of a herbarium specimen tag tied to a twig, the tag reading "ingraft --help".](/visuals/section-cli-reference.png)

## Open the dashboard

```sh
ingraft
ingraft tui
```

The zero-argument command opens the interactive OpenTUI dashboard. Use `deps`
when you want the non-interactive dependency scanner.

## Scan dependencies

```sh
ingraft deps
ingraft deps --json
ingraft deps --yes
```

## Add targets

```sh
ingraft add effect
ingraft add effect-smol
ingraft add convex
ingraft add Effect-TS/effect
ingraft add https://github.com/Effect-TS/effect.git
ingraft add https://github.com/gunta/confect/tree/effect4
ingraft add gunta/confect@effect4
ingraft effect zod Effect-TS/effect
```

Alias targets expand before package-name resolution. For example, `effect`
becomes `Effect-TS/effect`, and `convex` becomes both
`get-convex/convex-js` and `get-convex/convex-helpers`.

Pasted hosted branch URLs and `owner/repo@branch` shorthand select that branch
when no explicit `--ref`, `--tag`, `--release`, or `--sync-package` flag is
passed.

Useful options:

```sh
--strategy subtree|submodule|clone-ignore|cache-link
--ref <branch-or-commit>
--tag <tag>
--release <name-or-latest>
--sync-package <package>
--ignore <glob>
--exclude-dir <directory>
--exclude-ext <extension>
--max-file-size <size>
```

## Add organizations

```sh
ingraft add-org get-convex
ingraft add-org get-convex --language rust --since 90d
ingraft add-org get-convex --sort name
ingraft add-org get-convex --dry-run
```

Organization repositories are sorted by GitHub stars descending before the TUI
or non-interactive add flow runs, so the largest projects appear first. Use
`--sort name` for alphabetical order or `--sort pushed` for recently updated
repositories first.

## Fork editable upstreams

```sh
ingraft fork Effect-TS/effect
ingraft fork Effect-TS/effect --owner your-org
ingraft fork Effect-TS/effect --checkout-root ../forked
ingraft fork status
```

`fork` is for upstream work you may edit. It creates or reuses your GitHub fork,
clones an editable checkout beside the host repo, and keeps `vendor/` as a
read-only `cache-link --local-only` projection for agents. Edit, commit, and
push from the sibling fork checkout; refresh the vendor projection with
`ingraft update <name>` after the fork branch is pushed.

## Maintain durable source routes

```sh
ingraft list
ingraft update
ingraft update effect
ingraft refresh
ingraft doctor
ingraft doctor --fix
```

## Use optional context tools

```sh
ingraft context
ingraft context tools --json
ingraft context pack
ingraft context pack vendor/effect --compress
ingraft context source zod
```

## Remove durable source routes

```sh
ingraft remove effect
```

For history rewriting removal, see [Dangerous Removal](/docs/dangerous-removal/).
