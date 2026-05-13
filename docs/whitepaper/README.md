# Context Routing for AI Coding Agents — LaTeX source

Authoritative source for the ingraft research paper.

## Files

| File | Purpose |
|---|---|
| `paper.tex` | Canonical LaTeX source for the paper |
| `figures.tex` | TikZ/PGFPlots figures and figure macros |
| `references.bib` | Bibliography metadata for future citation maintenance |
| `_build/` | LaTeX intermediates, ignored |
| `_output/` | Publish-ready `index.pdf` and HTML landing page, ignored |

## Prerequisites

- TeX Live 2026 or equivalent with `latexmk`, `lualatex`, TikZ, PGFPlots, KOMA-Script, and Libertinus fonts.
- Bun for the small HTML wrapper generator.

## Build

From the repo root:

```sh
bun run whitepaper:build
```

This builds the PDF from pure LaTeX and writes:

- `docs/whitepaper/_output/index.pdf`
- `docs/whitepaper/_output/index.html`

Useful commands:

```sh
bun run whitepaper:build:pdf
bun run whitepaper:build:html
bun run whitepaper:watch
bun run whitepaper:clean
bun run whitepaper:publish
```

`whitepaper:publish` copies the output to:

- `packages/website/public/whitepaper/index.html`
- `packages/website/public/whitepaper/index.pdf`
- `packages/website/public/whitepaper.pdf`

## Editing Notes

- Keep the PDF as the canonical paper. The HTML output is intentionally a thin landing page with an embedded PDF preview.
- Prefer TikZ/PGFPlots for explanatory figures so the PDF remains vector sharp.
- Keep charts print-safe: direct labels, marker shapes, line styles, and hatching before color-only encodings.
- Avoid `minted` unless the build explicitly adopts `-shell-escape`; `tcolorbox`/verbatim is enough for this paper.
