# ingraft

Compatibility package for the `ingraft` command.

The canonical npm package is `@ingraft/cli`. This package keeps the short
`npx ingraft@latest` and `npm install -g ingraft` entrypoints working by
delegating to `@ingraft/cli`.

```sh
npx ingraft@latest --help
npm install -g ingraft
```

For new pinned installs, prefer the organization-scoped package:

```sh
npm install -g @ingraft/cli
npx @ingraft/cli@latest --help
```
