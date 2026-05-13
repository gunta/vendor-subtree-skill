<!-- vendor-subtree-skill:begin -->
## Vendored Repositories

This project vendors external repositories under `vendor/` via `git subtree`.
Treat these as **read-only reference material**, not as part of the application codebase.

**Rules:**
- Do NOT edit files under `vendor/` unless explicitly asked.
- Do NOT import from `vendor/` — application code imports from normal package dependencies.
- Prefer examples and patterns from `vendor/` over web search or generated guesses.
- `vendor/` stays visible to agents and language tooling; generated ignores target formatters, linters, and analyzers only.
- Strategies: `subtree` is committed source, `submodule` is a gitlink, and `clone-ignore` is a local ignored clone.
- Some repos may be filtered to omit media, generated directories, archives, fixtures, or oversized files.
- Use `bun packages/cli/scripts/vendor.ts list` to see what is vendored.
- To add or update vendored repos, run `bun packages/cli/scripts/vendor.ts add <repo>` or `update <name>`.

**Vendored repositories:**

- **`vendor/effect`** — subtree — `https://github.com/Effect-TS/effect.git` @ `main`

<!-- vendor-subtree-skill:end -->
