---
title: Deploy website to ingraft.dev via Cloudflare Workers using Alchemy
type: feat
date: 2026-05-13
---

# Deploy website to ingraft.dev via Cloudflare Workers using Alchemy

## Overview

Migrate the Astro Starlight docs site (`packages/website/`) from GitHub Pages to Cloudflare Workers using [Alchemy](https://alchemy.run) — a TypeScript infrastructure-as-code tool for Cloudflare. The site stays fully static (no SSR). The domain `ingraft.dev` already has a Cloudflare DNS zone.

## Current State

- Static Astro Starlight site built with `bun run build:website`
- Deployed via GitHub Pages (`deploy-pages.yml`)
- Custom domain via `public/CNAME` file containing `ingraft.dev`
- `astro.config.mjs` has `site: "https://ingraft.dev"`

## Proposed Solution

Use Alchemy's `Website` construct to deploy the static `dist/` output to Cloudflare Workers with a custom domain. This is the simplest approach — no Astro adapter change, no SSR, no output mode change.

## Implementation

### Phase 1: Add Alchemy to the website package

**`packages/website/alchemy.run.ts`**

```ts
import alchemy from "alchemy"
import { Website } from "alchemy/cloudflare"

const app = await alchemy("ingraft-website")

const site = await Website("ingraft-website", {
  command: "bun run build",
  assets: "./dist",
  domain: "ingraft.dev"
})

console.log({ url: site.url })
await app.finalize()
```

- Install: `bun add alchemy` in `packages/website/`
- Add `deploy` script: `"deploy": "bun alchemy.run.ts"` to `packages/website/package.json`
- Add `.alchemy/` to `.gitignore` (local state directory)

### Phase 2: Alchemy state persistence

Alchemy needs persistent state across CI runs. Options:

| Backend             | Pros                     | Cons                           |
| ------------------- | ------------------------ | ------------------------------ |
| File (committed)    | Simple, no external deps | Clutters repo, merge conflicts |
| Cloudflare R2       | Native CF integration    | Requires R2 bucket setup       |
| `ALCHEMY_STATE` env | CI-friendly              | Must store as secret           |

**Recommendation:** Use Alchemy's default file-based state with `ALCHEMY_PASSWORD` env var for encryption. The `.alchemy/` state directory can be committed (it's encrypted) or stored externally. Check Alchemy docs for CI-recommended approach.

### Phase 3: GitHub Actions workflow

Replace `.github/workflows/deploy-pages.yml` with a new workflow:

**`.github/workflows/deploy-website.yml`**

```yaml
name: Deploy website

on:
  push:
    branches: [main]
    paths:
      - packages/website/**
      - package.json
      - bun.lock
      - .github/workflows/deploy-website.yml
  workflow_dispatch: {}

concurrency:
  group: deploy-website
  cancel-in-progress: false

jobs:
  deploy:
    name: Deploy to Cloudflare
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v6

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.13

      - run: bun install --frozen-lockfile

      - name: Deploy website
        working-directory: packages/website
        run: bun run deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          ALCHEMY_PASSWORD: ${{ secrets.ALCHEMY_PASSWORD }}
```

### Phase 4: Cleanup

- Remove `packages/website/public/CNAME` (no longer needed)
- Delete old `.github/workflows/deploy-pages.yml`
- Remove GitHub Pages environment from repo settings (manual)
- Update DNS: if ingraft.dev CNAME still points to GitHub Pages, Alchemy's `domain` config handles creating the CF Workers route — the zone already exists so DNS records update automatically

## Secrets Required

Add to GitHub repo secrets:

| Secret                  | Purpose                                                              |
| ----------------------- | -------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | API token with Workers Scripts:Edit, Zone:Edit, DNS:Edit permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID                                                |
| `ALCHEMY_PASSWORD`      | Encrypts Alchemy state files                                         |

## Acceptance Criteria

- [ ] `bun run deploy` in `packages/website/` deploys site to Cloudflare Workers
- [ ] `ingraft.dev` serves the Starlight docs site via Cloudflare
- [ ] GitHub Actions workflow deploys on push to main (paths-filtered)
- [ ] Old GitHub Pages workflow removed
- [ ] 404 page works correctly on Cloudflare Workers
- [ ] No CNAME file in static output

## Risks & Mitigations

| Risk                               | Mitigation                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| DNS cutover downtime               | Deploy to Workers first, verify via worker URL, then attach domain                    |
| Alchemy state lost between CI runs | Commit encrypted `.alchemy/` dir or use remote state backend                          |
| 404 handling differs from GH Pages | Verify Starlight's 404.html is served; Alchemy Website construct handles SPA fallback |

## Open Questions

1. Does `Website` construct accept a `domain` property directly, or must `CustomDomain` be used separately?
2. What is the recommended Alchemy state backend for CI? (check docs at deploy time)
3. Should we add a `deploy:preview` for PR previews later?

## References

- [Alchemy Website docs](https://alchemy.run/providers/cloudflare/website/)
- [Alchemy Getting Started](https://alchemy.run/getting-started/)
- [Alchemy CustomDomain docs](https://alchemy.run/providers/cloudflare/custom-domain/)
- Current deploy workflow: `.github/workflows/deploy-pages.yml`
- Astro config: `packages/website/astro.config.mjs`
