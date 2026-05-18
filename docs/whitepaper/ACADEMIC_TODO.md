# Academic Upgrade TODO

This is the current "grill the paper" checklist for turning `paper.tex` from a strong research agenda into something closer to an academic position/systems paper. Priorities are ordered by trust risk first, then research value, then presentation quality.

## P0 — Fix Trust-Breaking Issues

- [ ] **Correct the LongCodeBench / LongSWE-Bench GPT-4.1 values.**
  - Current source area: `paper.tex` around the long-context section and `figures.tex` `\figureLongContextDegradation`.
  - Problem: the paper says GPT-4.1 sat near 1% at every LongSWE-Bench bracket, and the figure plots 1-2%. The published LongCodeBench COLM text says GPT-4.1 failed to solve any LongSWE-Bench issue across tested brackets.
  - Fix: re-extract Table 3 values from the LongCodeBench PDF, update the text and figure, and cite the exact task/table. Keep LongCodeQA and LongSWE-Bench separate.

- [ ] **Stop maintaining two divergent bibliography systems.**
  - Current state: `paper.tex` contains a hand-maintained `CSLReferences` block, while `references.bib` is separate metadata.
  - Academic target: make `references.bib` the source of truth and compile with `biblatex`/`biber` or `natbib`/BibTeX.
  - Add a CI check that fails on missing DOI/URL where available, duplicate references, uncited references, and cited-but-missing references.

- [ ] **Update evidence-strength labels for accepted papers.**
  - LongCodeBench should no longer be treated as only "preprint/benchmark" if citing the COLM 2025 version.
  - NoLiMa has PMLR/ICML 2025 proceedings metadata; use the PMLR citation, pages, and URL.
  - AbsenceBench appears as a NeurIPS 2025 Datasets and Benchmarks Track spotlight; verify the exact title spelling and use the OpenReview/proceedings citation.

- [ ] **Support or weaken the mgrep token-efficiency claim.**
  - Current claim: mgrep can reduce token usage relative to repeated grep loops while preserving exact-match fallback.
  - Problem: the cited `mgrep.dev` page and GitHub README support "semantic search for agents", cloud-backed stores, reranking, contextual hints, and grep-style CLI behavior, but the token-efficiency claim needs a primary benchmark citation or softer wording.
  - Fix options:
    - cite a primary Mixedbread benchmark if it is specifically about mgrep;
    - cite Mixedbread Search v3 separately as vendor evidence for reduced tool calls in agentic retrieval;
    - add Semble as a separate software/benchmark example for explicit token-efficiency claims;
    - or change the mgrep sentence to a product-design claim, not an empirical result.

- [ ] **Create a claim ledger.**
  - Add `docs/whitepaper/data/claims.yml` or `claims.csv`.
  - Fields: claim, source URL/DOI, exact source location, evidence class, task/dataset, model, metric, date checked, paper section, confidence, caveat.
  - Use it for every headline number, benchmark result, and vendor claim.

- [ ] **Harmonize title, subtitle, citation, PDF metadata, and HTML landing page.**
  - Current paper title is `Context Routing for AI Coding Agents`, while the suggested citation uses the longer subtitle.
  - Decide the canonical title/subtitle and apply it consistently in `\title`, `\hypersetup`, the citation box, README, HTML wrapper, and output filename.

## P1 — Make the Argument Scholarly

- [ ] **Decide the paper type explicitly.**
  - Current best fit: position paper / research agenda / systems design paper.
  - If it remains a research agenda, say so in the abstract and conclusion.
  - If it is meant to be an empirical paper, the router eval has to exist.

- [ ] **Add formal academic front matter.**
  - Use an `abstract` environment instead of unlabelled opening paragraphs.
  - Add keywords.
  - Add affiliation/contact/ORCID if desired.
  - Add a compact "Contributions" paragraph with numbered contributions matched to later sections.

- [ ] **Refactor around explicit research questions.**
  - RQ1: What makes coding-agent context hard?
  - RQ2: What context strategies exist, and what tradeoffs do they encode?
  - RQ3: When should a system choose one strategy over another?
  - RQ4: How should a router be evaluated?

- [ ] **Strengthen the methods section into a reproducible review protocol.**
  - Add actual search strings.
  - Add databases searched and exact dates.
  - Add screening counts: found, screened, included, excluded.
  - Add inclusion/exclusion decisions for borderline practitioner/vendor sources.
  - Add a data-extraction schema for papers/tools.
  - Add a limitation that this is a single-author synthesis unless there was independent review.

- [ ] **Split "Related Work" from "Evidence".**
  - The current paper uses evidence well, but academic readers expect a related-work map.
  - Suggested subsections:
    - long-context evaluation and context rot;
    - retrieval-augmented code generation;
    - code search and hybrid retrieval;
    - agent scaffolds and context engineering;
    - standards and interoperability.

- [ ] **Make the formal model less decorative.**
  - Define every utility term operationally.
  - Say whether the additive cost model is illustrative or intended as an estimable model.
  - Define observable proxies for success, distractor risk, freshness, trust risk, and privacy risk.
  - Add policy pseudocode for `pi(t, m, r, k) -> route`.

- [ ] **Add a status table for ingraft.**
  - Separate implemented, partially implemented, proposed, and future work.
  - This prevents readers from interpreting the case study as empirical proof.

- [ ] **Add a stronger "what would change our mind" subsection.**
  - Current falsification bullets are good.
  - Add measurable thresholds: e.g. router must beat the best fixed strategy by X absolute points or Y cost-adjusted utility on Z of N task families.

## P1 — Build the Actual Router Eval

- [ ] **Turn the evaluation agenda into an executable benchmark plan.**
  - Create a fixture format inspired by Vercel:
    - `TASK.md`
    - hidden or separated grader/test
    - package/repo setup manifest
    - context route condition
    - expected provenance record
  - Include paired conditions: no extra context, docs-only, AGENTS.md docs index, source vendoring, lazy source fetch, semantic index, structural index, agentic search, router.

- [ ] **Run a pilot eval before publication.**
  - Minimum useful pilot: 20-40 tasks across 3-5 packages/repos, one model, fixed scaffold.
  - Better pilot: Effect-heavy tasks plus one contrasting docs-first framework and one utility package.
  - Report confidence intervals, not only pass rates.

- [ ] **Define control variables.**
  - Same model snapshot.
  - Same agent scaffold.
  - Same wall-clock and token budget.
  - Same tool permissions.
  - Same retry policy.
  - Same grader.

- [ ] **Add task stratification to the eval design.**
  - Package centrality.
  - Source size.
  - Docs quality.
  - Public API versus internals.
  - Version freshness.
  - Typed versus untyped ecosystem.
  - Local-only versus remote-allowed privacy setting.

- [ ] **Add negative controls.**
  - Stale docs.
  - Wrong package major version.
  - Distractor source tree.
  - Compiled/minified `node_modules` surface.
  - Overlarge repo pack.

## P2 — Improve Evidence and Citations

- [ ] **Add stronger hybrid-search citations.**
  - The figure mentions hybrid / RRF, but the paper should cite Reciprocal Rank Fusion or another canonical hybrid retrieval source.
  - Add software-agent search sources only with their evidence class clearly labeled.

- [ ] **Add AgentSearchBench or explain why it is out of scope.**
  - It is directly relevant to routing because it shows semantic similarity can diverge from execution-grounded agent performance.
  - It supports the paper's "retrieval is not enough; selector quality matters" thesis.

- [ ] **Add Semble as a software/benchmark counterpoint if discussing token efficiency.**
  - Semble explicitly claims code-agent search with hybrid BM25 + semantic retrieval and much lower token usage than grep+read.
  - Treat it as software/vendor evidence unless the benchmark has a peer-reviewed venue.

- [ ] **Separate Mixedbread product claims by product.**
  - `mxbai-embed-large`, `mxbai-colbert`, `mgrep`, and Mixedbread Search v3 are distinct.
  - Do not let a benchmark for Mixedbread Search v3 imply an mgrep result unless Mixedbread says that explicitly.

- [ ] **Update the paper matrix to include all newly cited retrieval work.**
  - Add BGE-M3, ColBERTv2, PLAID, RRF/hybrid retrieval, Mixedbread Search, mgrep, Semble, AgentSearchBench if used.
  - Ensure each row has evidence strength and router implication.

- [ ] **Add DOI/proceedings metadata wherever available.**
  - ColBERT has DOI/proceedings pages.
  - NoLiMa has PMLR volume/pages.
  - AbsenceBench has OpenReview/proceedings metadata.
  - LongCodeBench has OpenReview/COLM metadata and arXiv DOI.

- [ ] **Audit all "May 2026 snapshot" tools.**
  - Move the tool inventory into `docs/whitepaper/data/tools.yml`.
  - Fields: name, category, URL, date checked, local/remote, open-source/proprietary, privacy implication, evidence class, status.
  - Generate the table and count chart from data.

## P2 — Make Figures Defensible

- [ ] **Mark schematic figures as schematic.**
  - Utility tradeoff, retrieval landscape, phase heatmap, eval lattice, and router architecture are conceptual.
  - Captions should say "schematic" or "hypothesized" where not data-derived.

- [ ] **Attach source notes to empirical figures.**
  - LongCodeBench chart: cite exact table/version.
  - Vercel chart: cite Vercel blog date and say it is vendor-reported.
  - Tool count chart: generate from `tools.yml`.

- [ ] **Rework the eval lattice so it does not assume the thesis.**
  - Current router row is all `+`, which visually assumes the router is best everywhere.
  - Better: mark the router as "adaptive condition" rather than "core condition for all tasks", or split expected relevance from hypothesis.

- [ ] **Add one figure that academics can inspect as an algorithm.**
  - Flowchart or pseudocode for `route(context_object, task, policy)`.
  - Include authority resolution, trust gating, strategy scoring, provenance emission, and fallback after failure.

## P2 — Tighten Language and Claims

- [ ] **Replace loose "current frontier models" claims with date/model-scoped claims.**
  - The paper already avoids many overclaims; keep tightening any phrase that sounds universal.
  - Prefer "in the cited eval" / "for this task family" / "in this vendor report".

- [ ] **Avoid turning practitioner slogans into paper claims.**
  - Effect's source-vendoring argument is strong as operating experience.
  - Keep "source beats docs" as a conditional route, not a global law.

- [ ] **Add an "authority conflict examples" box.**
  - Latest docs versus old lockfile.
  - Source internals versus public API docs.
  - Remote issue thread versus local fork.
  - Generated summary versus source.

- [ ] **Make "context rot" precise.**
  - Define it as a term from Chroma's technical report.
  - Distinguish context rot from lost-in-the-middle, distractor interference, retrieval miss, and context poisoning.

## P3 — LaTeX and Publication Quality

- [ ] **Split the monolithic LaTeX file.**
  - Suggested layout:
    - `paper.tex`
    - `sections/01-introduction.tex`
    - `sections/02-method.tex`
    - `sections/03-formalism.tex`
    - `sections/04-evidence.tex`
    - `sections/05-design-space.tex`
    - `sections/06-router.tex`
    - `sections/07-evaluation.tex`
    - `sections/08-ingraft.tex`
    - `sections/09-threats.tex`
    - `sections/appendices.tex`
  - Keep `figures.tex` separate.

- [ ] **Remove remaining Pandoc-style source scaffolding.**
  - Current LaTeX still has `Shaded`, `Highlighting`, and converted syntax macros.
  - Replace with deliberate `tcolorbox` or `listings` styles.

- [ ] **Use academic cross-reference tooling.**
  - Add `cleveref` or equivalent for consistent "Section", "Table", "Figure" references.
  - Use labels consistently and avoid hand-written reference text where possible.

- [ ] **Rename outputs for citation quality.**
  - Keep website route as `/whitepaper/`.
  - Also publish a stable filename such as `context-routing-for-ai-coding-agents.pdf` instead of only `index.pdf`.

- [ ] **Add PDF metadata and archival metadata.**
  - PDF title/subtitle.
  - Author.
  - Keywords.
  - License.
  - Git commit hash or version string.
  - Date checked / source freeze date.

- [ ] **Run a final typesetting QA.**
  - `bun run whitepaper:publish`.
  - grep log for `Overfull`, `Warning:`, `undefined`, `Citation`, and `Rerun`.
  - render first, middle, and appendix pages as thumbnails.
  - verify no stale generated artifacts.

## Suggested Next Execution Order

1. Fix LongCodeBench numbers and regenerate the figure.
2. Convert citations to a real BibTeX/Biber workflow.
3. Update accepted-paper venue metadata and evidence-strength labels.
4. Create `claims.yml` and `tools.yml`.
5. Add AgentSearchBench, Semble, RRF, and Mixedbread Search v3 if the claims need them.
6. Add a status table for ingraft.
7. Add a pilot eval plan with fixture schema.
8. Split the LaTeX into sections and clean out generated scaffolding.
9. Rebuild, publish, and run PDF QA.
