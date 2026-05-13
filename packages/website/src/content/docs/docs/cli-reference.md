---
title: CLI Reference
description: Common commands for scanning, adding, updating, listing, and removing vendors.
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
ingraft effect zod Effect-TS/effect
```

Alias targets expand before package-name resolution. For example, `effect`
becomes `Effect-TS/effect`, and `convex` becomes both
`get-convex/convex-js` and `get-convex/convex-helpers`.

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

## Maintain vendors

```sh
ingraft list
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

## Remove vendors

```sh
ingraft remove effect
```

For history rewriting removal, see [Dangerous Removal](/docs/dangerous-removal/).
