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
  { href: "/docs/getting-started/", label: "Install" },
  { href: "/docs/strategies/", label: "Strategies" },
  { href: "/docs/doctor/", label: "Doctor" },
  { href: "/docs/", label: "Docs", variant: "secondary" }
] as const satisfies ReadonlyArray<LandingLink>

export const heroActions = [
  { href: "/docs/getting-started/", label: "Start vendoring", variant: "primary" },
  { href: "/docs/strategies/", label: "Compare strategies", variant: "secondary" }
] as const satisfies ReadonlyArray<LandingLink>

export const capabilitySignals = [
  {
    title: "Subtree",
    body: "Commit source when permanence matters.",
    icon: "git-fork"
  },
  {
    title: "Submodule",
    body: "Pin big repos without copying their history.",
    icon: "git-branch"
  },
  {
    title: "Clone-ignore",
    body: "Make source local for agents while Git stays lean.",
    icon: "eye-off"
  },
  {
    title: "Doctor",
    body: "See detected stack, tools, editors, and vendor status.",
    icon: "stethoscope"
  }
] as const satisfies ReadonlyArray<LandingCard>

export const problemSection = {
  kicker: "Why this exists",
  title: "Agents work better when the real source is close.",
  intro:
    "Package docs are useful. The actual repository is better. `ingraft` makes source available to coding agents and language tooling without turning every repo into an unreviewable mirror of the internet.",
  cards: [
    {
      title: "Version drift is expensive",
      body: "The tool can resolve versions from package manifests and lockfiles, then map those versions to source tags, branches, releases, or commits.",
      icon: "git-compare-arrows"
    },
    {
      title: "Vendor code should be visible",
      body: "Agents and LSPs need to read upstream code, but review diffs, formatter runs, and lint passes should stay focused on your project.",
      icon: "eye"
    },
    {
      title: "One strategy is not enough",
      body: "Small libraries can be subtrees, large repositories can be submodules, and temporary source mirrors can be clone-ignore entries.",
      icon: "layers"
    }
  ]
} as const satisfies LandingSection

export const strategySection = {
  kicker: "The model",
  title: "Choose the relationship you want with upstream source.",
  cards: [
    {
      title: "Subtree by default",
      body: "Commit a copy under `vendor/` when the source is small enough and you want code review, history, and branch portability.",
      image: {
        src: "/visuals/strategy-subtree.png",
        alt: "A liquid-chrome ribbon flowing in an S-curve, illuminated along its full length by an unbroken magenta seam — the fully fused graft."
      }
    },
    {
      title: "Submodule when needed",
      body: "Pin a repository without importing every file into your own history. Useful for large projects and upstreams you do not want to modify.",
      image: {
        src: "/visuals/strategy-submodule.png",
        alt: "Two chrome ribbons running parallel along the diagonal, held together at three luminous magenta pins — the pinned graft."
      }
    },
    {
      title: "Clone and ignore",
      body: "Keep source on disk for agents and LSPs while `.gitignore` keeps it out of commits. This is also the fallback for colocated `jj` repos.",
      image: {
        src: "/visuals/strategy-clone-ignore.png",
        alt: "Two chrome ribbons floating side by side with a void gap between them, traced by a single dashed magenta line — the adjacent graft."
      }
    }
  ]
} as const satisfies LandingSection

export const workflowItems = [
  "Detect package managers, monorepo tools, editors, and agent files.",
  "Apply ignores only for tools the project already uses.",
  "Support GitHub and other git hosts through provider layers.",
  "Keep dangerous history removal explicit and hard to run by accident.",
  "Expose a TUI for scanning, matching, and updating vendored dependencies."
] as const

export const finalActions = [
  { href: "/docs/getting-started/", label: "Read the docs", variant: "primary" },
  { href: "/docs/cli-reference/", label: "CLI reference", variant: "secondary" }
] as const satisfies ReadonlyArray<LandingLink>
