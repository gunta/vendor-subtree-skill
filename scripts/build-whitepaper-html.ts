import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"

const outDir = join(process.cwd(), "docs/whitepaper/_output")

const html = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Context Routing for AI Coding Agents</title>
    <meta name="description" content="A research agenda for context allocation under attention, authority, freshness, privacy, and cost constraints.">
    <style>
      :root {
        color-scheme: light dark;
        --ink: #171717;
        --muted: #5f5f5f;
        --paper: #faf9f6;
        --line: #d8d3c8;
        --accent: #1f4e79;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --ink: #f5f3ee;
          --muted: #b8b2a8;
          --paper: #11110f;
          --line: #34302a;
          --accent: #8db7df;
        }
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--paper);
        color: var(--ink);
        font-family: ui-serif, Georgia, Cambria, "Times New Roman", serif;
        line-height: 1.55;
      }
      main {
        width: min(920px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 72px 0;
      }
      .eyebrow {
        color: var(--accent);
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      h1 {
        font-size: clamp(2.4rem, 6vw, 5.4rem);
        line-height: 0.96;
        letter-spacing: 0;
        margin: 14px 0 18px;
        max-width: 850px;
      }
      .subtitle {
        color: var(--muted);
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: clamp(1.05rem, 2vw, 1.35rem);
        max-width: 760px;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin: 32px 0 48px;
      }
      a.button {
        border: 1px solid var(--ink);
        color: var(--ink);
        display: inline-flex;
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-weight: 700;
        padding: 10px 14px;
        text-decoration: none;
      }
      a.button.primary {
        background: var(--ink);
        color: var(--paper);
      }
      section {
        border-top: 1px solid var(--line);
        padding-top: 28px;
        margin-top: 28px;
      }
      h2 {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.95rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      p, li { max-width: 780px; }
      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 0.92em;
      }
      .citation {
        border-left: 4px solid var(--accent);
        color: var(--muted);
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 0.9rem;
        padding-left: 16px;
        white-space: normal;
      }
      iframe {
        width: 100%;
        height: min(82vh, 960px);
        border: 1px solid var(--line);
        background: white;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="eyebrow">ingraft whitepaper · May 2026</div>
      <h1>Context Routing for AI Coding Agents</h1>
      <p class="subtitle">A research agenda for context allocation under attention, authority, freshness, privacy, trust, and cost constraints.</p>
      <div class="actions">
        <a class="button primary" href="./index.pdf">Read the PDF</a>
        <a class="button" href="https://github.com/gunta/ingraft">Repository</a>
      </div>
      <section>
        <h2>Abstract</h2>
        <p>AI coding agents increasingly fail not because relevant knowledge is unavailable, but because it is poorly allocated: too much, too stale, retrieved from the wrong authority, positioned where the model attends weakly, or exposed through the wrong trust boundary.</p>
        <p>This paper proposes the context router: an explicit policy layer that selects, per task and knowledge object, among vendored source, lazy source fetch, documentation retrieval, semantic or structural search, packaged snapshots, skills, and agent-mediated inspection.</p>
      </section>
      <section>
        <h2>Citation</h2>
        <p class="citation">Brunner, G. <em>Context Routing for AI Coding Agents: A Research Agenda for Context Allocation Under Attention, Authority, Freshness, Privacy, and Cost Constraints.</em> ingraft project, May 2026. https://ingraft.dev/whitepaper</p>
      </section>
      <section>
        <h2>Preview</h2>
        <iframe src="./index.pdf" title="Context Routing for AI Coding Agents PDF preview"></iframe>
      </section>
    </main>
  </body>
</html>
`

await mkdir(outDir, { recursive: true })
await writeFile(join(outDir, "index.html"), html)
