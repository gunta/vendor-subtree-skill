# ingraft website

Astro and Starlight package for the public `ingraft` landing page and docs.

```sh
bun run --cwd packages/website dev
bun run --cwd packages/website dev:local
bun run --cwd packages/website build
```

`dev` runs through Portless as `https://ingraft.localhost`. `dev:local` runs the raw Astro
server.

The landing page lives in `src/pages/index.astro`. Documentation lives in `src/content/docs`.
