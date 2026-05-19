# ingraft

[![skills.sh](https://skills.sh/b/gunta/ingraft)](https://skills.sh/gunta/ingraft)

Agent skill wrapper for the `ingraft` repository-context CLI.

The skill intentionally contains no repository-context implementation. It delegates to the published CLI with `bunx @ingraft/cli@latest`, so agents get the current standalone tool without copying TypeScript source into every skill install.

Running `bunx @ingraft/cli@latest` in a project opens the interactive TUI. Agents should use `bunx @ingraft/cli@latest deps` for the non-interactive dependency scanner and `bunx @ingraft/cli@latest context` for optional pack/fetch/search tool routing.

Install from `skills.sh`:

```sh
npx skills add gunta/ingraft
```
