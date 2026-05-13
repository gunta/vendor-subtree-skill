import react from "@astrojs/react"
import starlight from "@astrojs/starlight"
import { defineConfig } from "astro/config"

const SITE = "https://ingraft.dev"
const DESCRIPTION =
  "Vendor upstream source into agent-ready repositories without letting vendor code take over the project."
const OG_DOCS = `${SITE}/visuals/og-docs.png`
const DEV_HOST = process.env.HOST || "127.0.0.1"
const DEV_PORT = Number.parseInt(process.env.PORT || "4321", 10)
const PORTLESS_URL = process.env.PORTLESS_URL
const PORTLESS_ORIGIN = (() => {
  if (!PORTLESS_URL) return undefined
  try {
    return new URL(PORTLESS_URL)
  } catch {
    return undefined
  }
})()
const PORTLESS_CLIENT_PORT =
  PORTLESS_ORIGIN?.port !== ""
    ? Number.parseInt(PORTLESS_ORIGIN.port, 10)
    : PORTLESS_ORIGIN?.protocol === "https:"
      ? 443
      : 80

export default defineConfig({
  site: SITE,
  server: {
    host: DEV_HOST,
    port: Number.isFinite(DEV_PORT) ? DEV_PORT : 4321
  },
  integrations: [
    react(),
    starlight({
      title: "ingraft",
      description: DESCRIPTION,
      favicon: "/favicon.svg",
      logo: {
        light: "./src/assets/logo-light.svg",
        dark: "./src/assets/logo-dark.svg",
        replacesTitle: true
      },
      customCss: ["./src/styles/site.css"],
      lastUpdated: true,
      pagefind: false,
      head: [
        // Theme & color scheme
        { tag: "meta", attrs: { name: "color-scheme", content: "dark" } },
        { tag: "meta", attrs: { name: "theme-color", content: "#06060c" } },
        // SEO
        { tag: "meta", attrs: { name: "author", content: "Gunther Brunner" } },
        {
          tag: "meta",
          attrs: {
            name: "keywords",
            content:
              "ingraft, git subtree, git submodule, vendor source, coding agents, claude code, codex, cursor, effect, typescript, monorepo"
          }
        },
        {
          tag: "meta",
          attrs: {
            name: "robots",
            content: "index, follow, max-image-preview:large, max-snippet:-1"
          }
        },
        // Open Graph
        { tag: "meta", attrs: { property: "og:site_name", content: "Ingraft" } },
        { tag: "meta", attrs: { property: "og:type", content: "article" } },
        { tag: "meta", attrs: { property: "og:locale", content: "en_US" } },
        { tag: "meta", attrs: { property: "og:image", content: OG_DOCS } },
        { tag: "meta", attrs: { property: "og:image:secure_url", content: OG_DOCS } },
        { tag: "meta", attrs: { property: "og:image:type", content: "image/png" } },
        { tag: "meta", attrs: { property: "og:image:width", content: "1200" } },
        { tag: "meta", attrs: { property: "og:image:height", content: "630" } },
        {
          tag: "meta",
          attrs: {
            property: "og:image:alt",
            content: "Ingraft — vendor upstream source for coding agents."
          }
        },
        // Twitter
        { tag: "meta", attrs: { name: "twitter:card", content: "summary_large_image" } },
        { tag: "meta", attrs: { name: "twitter:creator", content: "@gunta85" } },
        { tag: "meta", attrs: { name: "twitter:image", content: OG_DOCS } },
        {
          tag: "meta",
          attrs: {
            name: "twitter:image:alt",
            content: "Ingraft — vendor upstream source for coding agents."
          }
        },
        // Icons / PWA
        { tag: "link", attrs: { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" } },
        { tag: "link", attrs: { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" } },
        { tag: "link", attrs: { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16.png" } },
        { tag: "link", attrs: { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" } },
        { tag: "link", attrs: { rel: "mask-icon", href: "/favicon.svg", color: "#06060c" } },
        { tag: "link", attrs: { rel: "manifest", href: "/manifest.webmanifest" } },
        // Sitemap discovery
        { tag: "link", attrs: { rel: "sitemap", type: "application/xml", href: "/sitemap-index.xml" } },
        // Font preconnect
        { tag: "link", attrs: { rel: "preconnect", href: "https://fonts.googleapis.com" } },
        {
          tag: "link",
          attrs: { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "anonymous" }
        }
      ],
      sidebar: [
        {
          label: "Start Here",
          items: [
            { label: "Overview", slug: "docs" },
            { label: "Getting Started", slug: "docs/getting-started" },
            { label: "Strategies", slug: "docs/strategies" }
          ]
        },
        {
          label: "Automation",
          items: [
            { label: "Synced Versions", slug: "docs/version-sync" },
            { label: "Doctor", slug: "docs/doctor" }
          ]
        },
        {
          label: "Tool Integrations",
          items: [
            { label: "Overview", slug: "docs/tooling" },
            {
              label: "Editors",
              items: [
                { label: "VS Code", slug: "docs/tooling/editors/vscode" },
                { label: "Zed", slug: "docs/tooling/editors/zed" },
                { label: "JetBrains IDEs", slug: "docs/tooling/editors/jetbrains" },
                {
                  label: "Vim and Neovim",
                  slug: "docs/tooling/editors/vim-neovim"
                }
              ]
            },
            {
              label: "Linters",
              items: [
                { label: "Biome", slug: "docs/tooling/linters/biome" },
                { label: "CSpell", slug: "docs/tooling/linters/cspell" },
                { label: "ESLint", slug: "docs/tooling/linters/eslint" },
                {
                  label: "golangci-lint",
                  slug: "docs/tooling/linters/golangci-lint"
                },
                { label: "markdownlint", slug: "docs/tooling/linters/markdownlint" },
                { label: "Oxlint", slug: "docs/tooling/linters/oxlint" },
                { label: "Ruff", slug: "docs/tooling/linters/ruff" },
                { label: "Stylelint", slug: "docs/tooling/linters/stylelint" }
              ]
            },
            {
              label: "Formatters",
              items: [{ label: "Prettier", slug: "docs/tooling/formatters/prettier" }]
            },
            {
              label: "Language Analyzers",
              items: [
                { label: "Cargo", slug: "docs/tooling/language-analyzers/cargo" },
                { label: "mypy", slug: "docs/tooling/language-analyzers/mypy" },
                { label: "Pyright", slug: "docs/tooling/language-analyzers/pyright" },
                {
                  label: "TypeScript",
                  slug: "docs/tooling/language-analyzers/typescript"
                },
                { label: "Zig", slug: "docs/tooling/language-analyzers/zig" }
              ]
            },
            {
              label: "Package Managers",
              items: [
                { label: "pnpm workspaces", slug: "docs/tooling/package-managers/pnpm" },
                {
                  label: "package.json workspaces",
                  slug: "docs/tooling/package-managers/package-workspaces"
                },
                { label: "Rush", slug: "docs/tooling/package-managers/rush" }
              ]
            },
            {
              label: "Task Runners",
              items: [
                { label: "Turborepo", slug: "docs/tooling/task-runners/turbo" },
                { label: "Nx", slug: "docs/tooling/task-runners/nx" },
                { label: "Moonrepo", slug: "docs/tooling/task-runners/moon" },
                { label: "Lerna", slug: "docs/tooling/task-runners/lerna" },
                { label: "Lage", slug: "docs/tooling/task-runners/lage" }
              ]
            },
            {
              label: "Build Systems",
              items: [
                { label: "Bazel", slug: "docs/tooling/build-systems/bazel" },
                { label: "Buck2", slug: "docs/tooling/build-systems/buck2" },
                { label: "Gradle", slug: "docs/tooling/build-systems/gradle" },
                { label: "Maven", slug: "docs/tooling/build-systems/maven" },
                { label: "Pants", slug: "docs/tooling/build-systems/pants" },
                { label: "Please", slug: "docs/tooling/build-systems/please" }
              ]
            }
          ]
        },
        {
          label: "Reference",
          items: [
            { label: "CLI Reference", slug: "docs/cli-reference" },
            { label: "Editable Vendors", slug: "docs/editable-vendors" },
            {
              label: "Dangerous Removal",
              slug: "docs/dangerous-removal"
            }
          ]
        }
      ]
    })
  ],
  vite: {
    cacheDir: ".astro/vite",
    server: {
      strictPort: true,
      ...(PORTLESS_ORIGIN
        ? {
            allowedHosts: [PORTLESS_ORIGIN.hostname],
            hmr: {
              clientPort: PORTLESS_CLIENT_PORT,
              host: PORTLESS_ORIGIN.hostname,
              protocol: PORTLESS_ORIGIN.protocol === "https:" ? "wss" : "ws"
            },
            origin: PORTLESS_ORIGIN.origin
          }
        : {})
    }
  }
})
