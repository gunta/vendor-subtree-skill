export interface LandingLink {
  readonly href: string
  readonly label: string
  readonly variant?: "primary" | "secondary"
}

export interface LandingCard {
  readonly title: string
  readonly body: string
  readonly image?: {
    readonly src: string
    readonly alt: string
  }
  readonly icon?: string
}

export interface LandingSection {
  readonly kicker: string
  readonly title: string
  readonly intro?: string
  readonly cards: ReadonlyArray<LandingCard>
}

export const landingNav = [
  { href: "/docs/installation/", label: "Install" },
  { href: "/docs/strategies/", label: "Strategies" },
  { href: "/docs/doctor/", label: "Doctor" },
  { href: "/docs/", label: "Docs", variant: "secondary" }
] as const satisfies ReadonlyArray<LandingLink>

export const heroActions = [
  { href: "/docs/installation/", label: "Install ingraft", variant: "primary" },
  { href: "/docs/getting-started/", label: "Get started", variant: "secondary" }
] as const satisfies ReadonlyArray<LandingLink>

export const capabilitySignals = [
  {
    title: "Vendor",
    body: "Commit source when durable context matters.",
    icon: "package"
  },
  {
    title: "Link",
    body: "Use submodules, local clones, or shared cache links.",
    icon: "git-branch"
  },
  {
    title: "Route",
    body: "Pack, fetch, or search context when source should stay out of Git.",
    icon: "layers"
  },
  {
    title: "Doctor",
    body: "Keep editors, agents, linters, and monorepos quiet.",
    icon: "stethoscope"
  }
] as const satisfies ReadonlyArray<LandingCard>

export const problemSection = {
  kicker: "Why this exists",
  title: "Background agents need context that survives the handoff.",
  intro:
    "Agents now move between local terminals, cloud worktrees, PR queues, and mobile approvals. `ingraft` makes the repository itself the context contract: source, docs, rules, snapshots, and tool routes are explicit instead of trapped in one chat session.",
  cards: [
    {
      title: "Context should have authority",
      body: "The right route depends on whether the agent needs locked source, fresh docs, a one-shot pack, a searchable index, or a live tool.",
      icon: "git-compare-arrows"
    },
    {
      title: "The repo is the durable layer",
      body: "When a task jumps from Claude to Codex to Copilot or a cloud worker, project files and agent instructions carry more reliably than conversational memory.",
      icon: "eye"
    },
    {
      title: "One strategy is not enough",
      body: "Vendoring is the main path for deep dependency work, but large repos, private code, quick research, and fresh web evidence need different routes.",
      icon: "layers"
    }
  ]
} as const satisfies LandingSection

export const strategySection = {
  kicker: "Context routes",
  title: "Choose the route that matches the job.",
  cards: [
    {
      title: "Commit durable source",
      body: "Use `subtree` when upstream code is small enough to become a portable, reviewable part of the repo's context contract.",
      image: {
        src: "/visuals/strategy-subtree.png",
        alt: "A liquid-chrome ribbon flowing in an S-curve, illuminated along its full length by an unbroken magenta seam — the fully fused graft."
      }
    },
    {
      title: "Pin or patch source",
      body: "Use `submodule` when source needs its own Git identity, especially for large upstreams or fork-backed vendor patches.",
      image: {
        src: "/visuals/strategy-submodule.png",
        alt: "Two chrome ribbons running parallel along the diagonal, held together at three luminous magenta pins — the pinned graft."
      }
    },
    {
      title: "Keep context local",
      body: "Use `clone-ignore` or `cache-link` when agents need files on disk but Git history should stay lean. Use packs, lazy fetch, and search for lighter routes.",
      image: {
        src: "/visuals/strategy-clone-ignore.png",
        alt: "Two chrome ribbons floating side by side with a void gap between them, traced by a single dashed magenta line — the adjacent graft."
      }
    }
  ]
} as const satisfies LandingSection

export const workflowItems = [
  "Detect package managers, monorepo tools, editors, agent files, and optional context tools.",
  "Apply ignores and routing hints only for tools the project already uses.",
  "Support GitHub and other git hosts through provider layers.",
  "Wrap Repomix, OpenSrc, and local search tools when a lighter context route fits.",
  "Keep dangerous history removal explicit and hard to run by accident.",
  "Expose a TUI for scanning, matching, routing, and updating context."
] as const

export const finalActions = [
  { href: "/docs/getting-started/", label: "Read the docs", variant: "primary" },
  { href: "/docs/cli-reference/", label: "CLI reference", variant: "secondary" }
] as const satisfies ReadonlyArray<LandingLink>
