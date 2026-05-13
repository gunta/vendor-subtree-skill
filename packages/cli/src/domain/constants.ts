export const VENDOR_DIR = "vendor"
export const SECTION_BEGIN = "<!-- ingraft:begin -->"
export const SECTION_END = "<!-- ingraft:end -->"
export const TRAILER_URL = "vendor-source-url"
export const TRAILER_REF = "vendor-source-ref"
export const TRAILER_RESOLVED_REF = "vendor-resolved-ref"
export const TRAILER_STRATEGY = "vendor-strategy"
export const TRAILER_FILTER = "vendor-filter"
export const TRAILER_SYNC_PACKAGE = "vendor-sync-package"
export const TRAILER_ACTION = "vendor-action"
export const TRAILER_DIR = "git-subtree-dir"
export const DEFAULT_AGENT_DOC = "AGENTS.md"
export const AGENT_DOC_FILES = [
  { name: "AGENTS.md", path: "AGENTS.md" },
  { name: "CLAUDE.md", path: "CLAUDE.md" },
  { name: "GEMINI.md", path: "GEMINI.md" },
  { name: "QWEN.md", path: "QWEN.md" },
  { name: ".cursorrules", path: ".cursorrules" },
  { name: ".clinerules", path: ".clinerules" },
  { name: "Copilot instructions", path: ".github/copilot-instructions.md" },
  { name: "Windsurf rules", path: ".windsurfrules" },
  { name: "Junie guidelines", path: ".junie/guidelines.md" }
] as const
export const AGENT_DOC_RULE_DIRECTORIES = [
  { name: "Cursor rules", path: ".cursor/rules", suffixes: [".mdc"] },
  {
    name: "Copilot instruction files",
    path: ".github/instructions",
    suffixes: [".instructions.md"]
  },
  { name: "Windsurf rules directory", path: ".windsurf/rules", suffixes: [".md"] },
  { name: "Cline rules directory", path: ".clinerules", suffixes: [".md"] },
  { name: "Roo Code rules", path: ".roo/rules", suffixes: [".md"] },
  { name: "Kilo Code rules", path: ".kilocode/rules", suffixes: [".md"] }
] as const
export const AGENT_DOCS = AGENT_DOC_FILES.map((spec) => spec.path)
export const VERSION = "0.3.0"
export const FALLBACK_SCRIPT_REL = "packages/cli/scripts/vendor.ts"
