import { Effect, FileSystem, Path } from "effect"

import { packageJsonHasDependency } from "../config/package-json.ts"
import { VENDOR_DIR } from "../domain/constants.ts"

export const PROJECT_LANGUAGES = [
  "typescript",
  "javascript",
  "python",
  "rust",
  "go",
  "zig",
  "java",
  "kotlin",
  "swift",
  "android",
  "php",
  "ruby",
  "elixir",
  "cpp",
  "csharp",
  "css",
  "markdown"
] as const

export type ProjectLanguage = (typeof PROJECT_LANGUAGES)[number]
export type ProjectLanguageUsage = {
  readonly [K in ProjectLanguage]: boolean
}
type MutableProjectLanguageUsage = {
  [K in ProjectLanguage]: boolean
}

export interface DetectProjectLanguagesParams {
  readonly cwd: string
  readonly fs: FileSystem.FileSystem
  readonly listProjectFiles: (cwd: string) => Effect.Effect<ReadonlyArray<string>, unknown>
  readonly path: Path.Path
}

const IGNORED_LANGUAGE_DETECTION_DIRS = new Set([
  ".git",
  ".jj",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  VENDOR_DIR
])

const LANGUAGE_EXTENSIONS = {
  typescript: [".ts", ".tsx", ".mts", ".cts"],
  javascript: [".js", ".jsx", ".mjs", ".cjs"],
  python: [".py", ".pyi"],
  rust: [".rs"],
  go: [".go"],
  zig: [".zig", ".zon"],
  java: [".java"],
  kotlin: [".kt", ".kts"],
  swift: [".swift"],
  android: [".aidl"],
  php: [".php"],
  ruby: [".rb"],
  elixir: [".ex", ".exs"],
  cpp: [".c", ".cc", ".cpp", ".cxx", ".h", ".hh", ".hpp", ".hxx"],
  csharp: [".cs", ".csx"],
  css: [".css", ".scss", ".sass", ".less", ".pcss"],
  markdown: [".md", ".mdx", ".markdown"]
} as const satisfies Record<ProjectLanguage, ReadonlyArray<string>>

const ROOT_MARKERS = {
  typescript: ["tsconfig.json"],
  javascript: ["jsconfig.json"],
  python: ["pyproject.toml", "setup.py", "requirements.txt", "uv.lock"],
  rust: ["Cargo.toml"],
  go: ["go.mod", "go.work"],
  zig: ["build.zig", "build.zig.zon"],
  java: ["pom.xml", "build.gradle", "settings.gradle"],
  kotlin: ["build.gradle.kts", "settings.gradle.kts"],
  swift: ["Package.swift"],
  android: ["AndroidManifest.xml", "settings.gradle", "settings.gradle.kts"],
  php: ["composer.json"],
  ruby: ["Gemfile", ".ruby-version"],
  elixir: ["mix.exs", "mix.lock"],
  cpp: ["CMakeLists.txt", "compile_commands.json", "Makefile"],
  csharp: ["global.json"],
  css: ["postcss.config.js", "postcss.config.cjs", "postcss.config.mjs"],
  markdown: [".markdownlint.json", ".markdownlint.yaml", ".markdownlint.yml"]
} as const satisfies Record<ProjectLanguage, ReadonlyArray<string>>

export const emptyProjectLanguageUsage = (): ProjectLanguageUsage =>
  Object.fromEntries(PROJECT_LANGUAGES.map((language) => [language, false])) as ProjectLanguageUsage

const mutableProjectLanguageUsage = (): MutableProjectLanguageUsage =>
  Object.fromEntries(
    PROJECT_LANGUAGES.map((language) => [language, false])
  ) as MutableProjectLanguageUsage

const normalizeProjectPath = (filePath: string): string => filePath.replaceAll("\\", "/")

const isRelevantProjectPath = (filePath: string): boolean => {
  const parts = normalizeProjectPath(filePath).split("/")
  return !parts.some((part) => IGNORED_LANGUAGE_DETECTION_DIRS.has(part))
}

const pathExtension = (filePath: string): string => {
  const normalized = normalizeProjectPath(filePath)
  const basename = normalized.split("/").pop() ?? normalized
  const dot = basename.lastIndexOf(".")
  return dot === -1 ? "" : basename.slice(dot)
}

const basename = (filePath: string): string =>
  normalizeProjectPath(filePath).split("/").pop() ?? filePath

export const projectLanguageUsageFromFiles = (
  files: ReadonlyArray<string>
): ProjectLanguageUsage => {
  const usage = mutableProjectLanguageUsage()
  for (const filePath of files.filter(isRelevantProjectPath)) {
    const extension = pathExtension(filePath)
    const name = basename(filePath)
    for (const language of PROJECT_LANGUAGES) {
      if (
        (LANGUAGE_EXTENSIONS[language] as ReadonlyArray<string>).includes(extension) ||
        (ROOT_MARKERS[language] as ReadonlyArray<string>).includes(name)
      ) {
        usage[language] = true
      }
    }
    if (name.endsWith(".csproj") || name.endsWith(".sln")) {
      usage.csharp = true
    }
  }
  return usage
}

export const detectedProjectLanguageNames = (
  usage: ProjectLanguageUsage
): ReadonlyArray<ProjectLanguage> => PROJECT_LANGUAGES.filter((language) => usage[language])

const packageJsonUsesTypeScript = ({
  cwd,
  fs,
  path
}: Pick<DetectProjectLanguagesParams, "cwd" | "fs" | "path">) =>
  Effect.gen(function* () {
    const target = path.resolve(cwd, "package.json")
    if (!(yield* fs.exists(target))) return false
    return packageJsonHasDependency(yield* fs.readFileString(target), ["typescript"])
  }).pipe(Effect.catch(() => Effect.succeed(false)))

const rootMarkerUsage = ({
  cwd,
  fs,
  path
}: Pick<DetectProjectLanguagesParams, "cwd" | "fs" | "path">) =>
  Effect.gen(function* () {
    const usage = mutableProjectLanguageUsage()
    for (const language of PROJECT_LANGUAGES) {
      for (const marker of ROOT_MARKERS[language]) {
        if (yield* fs.exists(path.resolve(cwd, marker))) {
          usage[language] = true
        }
      }
    }
    if (yield* packageJsonUsesTypeScript({ cwd, fs, path })) {
      usage.typescript = true
    }
    return usage
  })

const listFilesystemProjectFiles = ({
  cwd,
  fs
}: Pick<DetectProjectLanguagesParams, "cwd" | "fs">) =>
  fs
    .readDirectory(cwd, { recursive: true })
    .pipe(Effect.catch(() => Effect.succeed([] as ReadonlyArray<string>)))

export const detectProjectLanguages = ({
  cwd,
  fs,
  listProjectFiles,
  path
}: DetectProjectLanguagesParams) =>
  Effect.gen(function* () {
    const markers = yield* rootMarkerUsage({ cwd, fs, path })
    const gitFiles = yield* listProjectFiles(cwd).pipe(
      Effect.catch(() => Effect.succeed([] as ReadonlyArray<string>))
    )
    const projectFiles =
      gitFiles.length > 0 ? gitFiles : yield* listFilesystemProjectFiles({ cwd, fs })
    const files = projectLanguageUsageFromFiles(projectFiles)
    return Object.fromEntries(
      PROJECT_LANGUAGES.map((language) => [language, markers[language] || files[language]])
    ) as ProjectLanguageUsage
  })
