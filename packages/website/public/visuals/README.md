# Visuals

Brand image assets consumed by the website. Each file referenced below is wired into the site already — drop the rendered PNG in this directory under the exact filename and it goes live.

**Direction: Knockout (Effect-track + Silicon Valley graphic-design production).** Deep void canvas, single magenta accent (`#ff3c79`) as the only chromatic event, liquid-chrome surfaces, volumetric bloom, film grain. See [`docs/internal/branding/image-prompts.md`](../../../../docs/internal/branding/image-prompts.md) for the full prompt cookbook and the style preamble that holds the set together. Regenerate from there; do not edit these PNGs by hand.

Batch-generate the whole set with:

```sh
uhd-text-to-image batch ../../../../docs/internal/branding/image-batch.json -c 4
```

| File                          | Dimensions  | Consumed by                                                         |
| ----------------------------- | ----------- | ------------------------------------------------------------------- |
| `hero-graft.png`              | 2400 × 1350 | `.hero` background in `src/styles/landing.css`                      |
| `hero-graft-dark.png`         | 2400 × 1350 | Deep-theme hero variant (OLED / dark)                               |
| `og-default.png`              | 1200 × 630  | `og:image` / `twitter:image` in marketing layout and Starlight head |
| `og-default@2x.png`           | 2400 × 1260 | Retina OG preview (re-composite at 2×)                              |
| `og-docs.png`                 | 1200 × 630  | Docs-page OG variant — same plate, different tagline                |
| `strategy-subtree.png`        | 1200 × 1200 | "Subtree by default" landing card                                   |
| `strategy-submodule.png`      | 1200 × 1200 | "Submodule when needed" landing card                                |
| `strategy-clone-ignore.png`   | 1200 × 1200 | "Clone and ignore" landing card                                     |
| `section-getting-started.png` | 1000 × 1000 | Banner on `docs/getting-started.md`                                 |
| `section-doctor.png`          | 1000 × 1000 | Banner on `docs/doctor.md`                                          |
| `section-version-sync.png`    | 1000 × 1000 | Banner on `docs/version-sync.md`                                    |
| `section-tooling.png`         | 1000 × 1000 | Banner on `docs/tooling/index.mdx`                                  |
| `section-cli-reference.png`   | 1000 × 1000 | Banner on `docs/cli-reference.md`                                   |
| `texture-blueprint.png`       | 2048 × 2048 | Tiled subtle background on marketing pages (`.landing-shell`)       |
| `logomark.png`                | 1024 × 1024 | Refined raster mark for social avatars / slide intros               |

## Legacy assets (Knockout pending)

These remain from the previous "vintage botanical" direction and will be replaced or removed during the Knockout rollout:

| File             | Status                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `source-map.svg` | Used by old `landing.css` as a secondary hero layer. Knockout hero stands alone — schedule for removal once `landing.css` is rewritten to the new direction. |
