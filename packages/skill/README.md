# ingraft

[![skills.sh](https://skills.sh/b/gunta/ingraft)](https://skills.sh/gunta/ingraft)

Agent skill wrapper for the `ingraft` CLI.

The skill intentionally contains no vendoring implementation. It delegates to the published CLI with `bunx ingraft`, so agents get the current standalone tool without copying TypeScript source into every skill install.

Running `bunx ingraft@latest` in a project opens the interactive TUI. Agents should use `bunx ingraft@latest deps` for the non-interactive dependency scanner.

Install from `skills.sh`:

```sh
npx skills add gunta/ingraft
```
