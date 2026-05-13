# Ingraft / Knockout — Brand Revamp Design

|            |                                                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Date**   | 2026-05-13                                                                                                                                                                      |
| **Status** | Approved direction, partial implementation landed                                                                                                                               |
| **Driver** | Brand is currently a "vintage botanical illustration" aesthetic. Goal: acquisition-ready production quality. Targets: Vercel, Effect, Cloudflare — primarily Vercel and Effect. |

## TL;DR

Replace the cream-paper / ink / terracotta vintage botanical brand with **Knockout** — a deep-void canvas, liquid-chrome surfaces, single magenta accent, film grain, volumetric bloom. Effect-track sophistication elevated with Silicon Valley graphic-design production (Pentagram × Resend × Linear × Sky.work × Vercel-mesh era).

## Anti-goals (what we explicitly reject)

- Vintage / letterpress / Victorian / Penguin Classics / O'Reilly-animal aesthetics
- Cream / beige / sepia / watercolor palettes
- Botanical or illustrative metaphors rendered literally
- Generic AI-art tropes: hooded figures, glowing laptops, code-on-glass, isometric developer cubes, rainbow gradients, Matrix scrolls
- "B2B SaaS" voice or visual cliché
- More than one accent color in any single composition

## The system

### Palette

The whole brand is one canvas, one ink-of-light, and several chrome neutrals — nothing else.

| Role              | Token                   | Hex                      | Use                                                     |
| ----------------- | ----------------------- | ------------------------ | ------------------------------------------------------- |
| Canvas            | `--kn-void`             | `#06060c`                | Primary background everywhere                           |
| Canvas (deep)     | `--kn-void-deep`        | `#03030a`                | Vignette corners, gradient stops                        |
| Surface           | `--kn-void-rise`        | `#0c0c14`                | Tile / card surface                                     |
| Tile (raised)     | `--kn-void-tile`        | `#10101a`                | Inset elements                                          |
| Foreground        | `--kn-chrome`           | `#ece8d8`                | Body text, secondary chrome                             |
| Foreground (high) | `--kn-chrome-hi`        | `#f4f4f7`                | Headings, brand bar highlights                          |
| Foreground (mid)  | `--kn-chrome-mid`       | `#9da0a8`                | Secondary text                                          |
| Foreground (dim)  | `--kn-chrome-dim`       | `#5b6273`                | Tertiary text, footer                                   |
| Line              | `--kn-line`             | `rgba(236,232,216,0.08)` | Hairline borders                                        |
| Line (strong)     | `--kn-line-strong`      | `rgba(236,232,216,0.16)` | Card borders                                            |
| **Accent**        | `--kn-magenta`          | `#ff3c79`                | The graft moment. Used like punctuation, never as fill. |
| Accent (soft)     | `--kn-magenta-soft`     | `#ff79a6`                | Gradient stops                                          |
| Accent (deep)     | `--kn-magenta-deep`     | `#4a1230`                | Hover backgrounds                                       |
| Accent (bloom)    | `rgba(255,60,121,0.35)` | —                        | Volumetric glow                                         |

**Discipline.** No green, blue, amber, orange, yellow, or second accent in any composition. If a designer is reaching for a second color, the answer is white-on-chrome or magenta — nothing else.

### Typography

- **Display & body:** Geist (with Inter fallback). All headings in 600–700. Display tracking `-0.035em` for h1/h2; `-0.015em` for h3.
- **Mono:** Geist Mono (with JetBrains Mono fallback). Used for kickers, eyebrows, code, terminal, badges.
- **Tone:** Sentence case in display; UPPERCASE only in mono kickers (`+0.16em` tracking, 11.5 px).
- **Numerals:** tabular figures where alignment matters (data tables, terminal output).

### Visual system — surfaces

- **Liquid chrome / soft mercury** — primary surface vocabulary for hero artwork and section plates.
- **Volumetric bloom** — every magenta event emits soft light into surrounding void.
- **Film grain** — 18–24 % monochrome grain baked into the page itself via SVG turbulence overlay; visible at all sizes.
- **Dichroic micro-fringes** — where magenta meets chrome, faint cyan-to-orange refraction is allowed at the rim (≤ 2 px); never elsewhere.

### Logomark — the turnstile

A vertical chrome bar (the rootstock/host) + a magenta wedge of light pointing right at its mid-height (the scion, the graft moment). The wedge has a soft bloom behind it. Reads simultaneously as a stylized "I" and as a diagrammatic cross-section of a cleft graft.

- SVG primary: `packages/website/src/assets/logo-{light,dark}.svg`
- Inline in header: `packages/website/src/components/landing/LandingHeader.astro` (with proper gradient + bloom filter)
- Raster for social: `packages/website/public/visuals/logomark.png` (generated from `image-prompts.md` §7)

### Imagery system

Fifteen brand images generated from a single style preamble + per-image prompt. All live on the deep void canvas; all use the magenta accent only at the graft moment. See [`docs/internal/branding/image-prompts.md`](../../internal/branding/image-prompts.md) and [`docs/internal/branding/image-batch.json`](../../internal/branding/image-batch.json) for the cookbook.

**The set:** hero (16:9 + dark variant), OG card (1.91:1 + 2× + docs variant), strategy triptych (fused / pinned / adjacent), five section plates, tiling texture, logomark.

**OG card typography** is composited in code (SVG → PNG) for pixel-perfect legibility. The image model produces only the background plate.

## File-level changes

| File                                                          | Change                                                                                                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/website/src/styles/tokens.css`                      | Knockout palette, Geist + Geist Mono via Google Fonts, dark color-scheme, legacy `--vst-*` aliases preserved for safety                           |
| `packages/website/src/styles/landing.css`                     | Full rewrite: void canvas + grain overlay, magenta bloom hero, chrome cards with hover bloom, mono kickers, dark terminal with magenta cursor dot |
| `packages/website/src/styles/site.css`                        | Unchanged (imports tokens / landing / tooling)                                                                                                    |
| `packages/website/src/styles/tooling.css`                     | Unchanged — uses Starlight CSS vars, which cascade via tokens.css                                                                                 |
| `packages/website/src/assets/logo-light.svg`                  | Replaced "E + bar" mark with turnstile (chrome bar + magenta wedge + bloom + Geist wordmark)                                                      |
| `packages/website/src/assets/logo-dark.svg`                   | Replaced with turnstile, chrome → white gradient for dark backgrounds                                                                             |
| `packages/website/src/layouts/MarketingLayout.astro`          | Added `data-theme="dark"`, theme-color meta, Google Fonts preconnect                                                                              |
| `packages/website/src/components/landing/LandingHeader.astro` | Replaced `<span>v</span>` placeholder with inline SVG turnstile (with gradient + bloom filter)                                                    |
| `packages/website/src/data/landing.ts`                        | Updated strategy card `alt` text to describe new chrome-ribbon artwork                                                                            |
| `docs/internal/branding/image-prompts.md`                     | Full rewrite — Knockout style preamble + 15 image prompts                                                                                         |
| `docs/internal/branding/image-batch.json`                     | Matching batch manifest for `uhd-text-to-image batch`                                                                                             |
| `packages/website/public/visuals/README.md`                   | Updated wiring + Knockout direction note + flagged `source-map.svg` as legacy                                                                     |

## Voice & content — unchanged

The brand docs in `docs/internal/branding/` (voice.md, name.md, copy.md, dos-and-donts.md, README.md) are voice/content focused with no visual references. They remain valid as-is. The Knockout revamp is purely a visual layer.

## Known follow-ups

1. **Regenerate imagery.** Run `uhd-text-to-image batch docs/internal/branding/image-batch.json -c 4` to produce the fifteen PNGs. Until then the hero falls back gracefully to the gradient + bloom layer; tiles render without imagery.
2. **`packages/website/public/visuals/source-map.svg`** — still referenced in `landing.css` historical media-query block (mobile `<= 820px` legacy hero). Currently superseded by the magenta-bloom hero. Schedule for deletion in a follow-up commit.
3. **Favicon.** `public/favicon.svg` should be regenerated to a Knockout-style turnstile mark.
4. **Starlight docs surface.** Tokens cascade to Starlight, but a polish pass on docs-page layout (sidebar, content type sizes) would be worth doing once the marketing pages are signed off.
5. **Motion.** Knockout is a static system today. Future direction: WebGL shader hero (animated bloom + grain + slow chrome ribbon morph), inline canvas mark with subtle scion-wedge oscillation. Out of scope for this spec.

## Verification

- `bun run typecheck` (= `astro check`): **0 errors, 0 warnings, 0 hints**.
- `bun run build`: **43 pages built, complete in 2.23 s**.
- Dev server at `http://localhost:4321` — see live before approving the spec.
