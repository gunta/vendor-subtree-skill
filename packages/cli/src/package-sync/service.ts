import { DOMParser, type Element as XmlElement } from "@xmldom/xmldom"
import { Context, Effect, FileSystem, Layer, Option, Path, Result, Schema, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { parse as parseJsonc, type ParseError } from "jsonc-parser"

import { packageJsonDependencySpec, parsePackageJsonShape } from "../config/package-json.ts"
import { parseTomlText } from "../config/toml.ts"
import { parseYamlText } from "../config/yaml.ts"
import { VENDOR_DIR } from "../domain/constants.ts"
import { PackageVersionSyncFailed } from "../domain/errors.ts"
import { Git, type GitResult, type GitShape } from "../services/git.ts"

export type PackageEcosystem =
  | "android"
  | "expo"
  | "hex"
  | "npm"
  | "react"
  | "react-native"
  | "swift"

export type PackageDependencySection =
  | "dependencies"
  | "devDependencies"
  | "optionalDependencies"
  | "peerDependencies"
  | "deps"
  | "package"
  | "libraries"
  | "implementation"
  | "api"
  | "compileOnly"
  | "runtimeOnly"
  | "testImplementation"
  | "androidTestImplementation"
  | "debugImplementation"
  | "releaseImplementation"
  | "kapt"
  | "ksp"

export interface PackageDependency {
  readonly ecosystem: PackageEcosystem
  readonly manifestPath: string
  readonly name: string
  readonly repositoryUrl?: string
  readonly section: PackageDependencySection
  readonly spec: string
}

export type PackageVersionSource =
  | "node_modules"
  | "package-lock"
  | "pnpm-lock"
  | "yarn-lock"
  | "bun-lock"
  | "package-json"
  | "mix-lock"
  | "mix-exs"
  | "package-swift"
  | "gradle"

export interface ProjectPackageVersion {
  readonly packageSpec: string
  readonly source: PackageVersionSource
  readonly version: Option.Option<string>
}

export interface VendoredPackageVersion {
  readonly manifestPath: string
  readonly version: string
}

export interface DependencyVendorCandidate {
  readonly manifestPath: string
  readonly packageName: string
  readonly packageSpec: string
  readonly reason?: string
  readonly repositoryUrl?: string
  readonly remoteVersion?: string
  readonly section: PackageDependencySection
  readonly source: PackageEcosystem
  readonly status: "matched" | "metadata-unavailable" | "missing-repository"
  readonly suggestedName?: string
  readonly syncPackage: string
  readonly version?: string
  readonly versionSource?: PackageVersionSource
}

export interface PackageVersionSyncParams {
  readonly cwd: string
  readonly packageName: string
  readonly repoUrl: string
}

export interface PackageSourceResolutionParams {
  readonly cwd: string
  readonly packageName: string
}

export interface PackageVersionResolution {
  readonly packageName: string
  readonly packageSpec: string
  readonly ref: string
  readonly repositoryUrl: Option.Option<string>
  readonly source: "hex-tag" | "npm-gitHead" | "git-tag" | "git-default-branch" | "maven-scm-tag"
  readonly version: string
  readonly versionSource: PackageVersionSource
}

export interface NpmPackageMetadata {
  readonly gitHead: Option.Option<string>
  readonly repositoryUrl: Option.Option<string>
  readonly version: string
}

export interface HexPackageMetadata {
  readonly latestStableVersion: string
  readonly repositoryUrl: Option.Option<string>
}

export interface MavenPackageMetadata {
  readonly repositoryUrl: Option.Option<string>
  readonly tag?: string
  readonly version: string
}

interface CommandResult {
  readonly exitCode: number
  readonly stderr: string
  readonly stdout: string
}

const dependencySections = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies"
] as const satisfies ReadonlyArray<PackageDependencySection>

export interface PackageIdentity {
  readonly ecosystem: PackageEcosystem
  readonly name: string
}

const explicitPackageEcosystems = new Set<PackageEcosystem>([
  "android",
  "expo",
  "hex",
  "react",
  "react-native",
  "swift"
])

export const packageIdentityFromInput = (input: string): PackageIdentity => {
  const trimmed = input.trim()
  const separator = trimmed.indexOf(":")
  const ecosystem = separator === -1 ? "" : trimmed.slice(0, separator)
  if (explicitPackageEcosystems.has(ecosystem as PackageEcosystem)) {
    return {
      ecosystem: ecosystem as PackageEcosystem,
      name: trimmed.slice(separator + 1).trim()
    }
  }
  return {
    ecosystem: "npm",
    name: trimmed
  }
}

export const syncPackageName = ({ ecosystem, name }: PackageIdentity): string =>
  ecosystem === "npm" ? name : `${ecosystem}:${name}`

const ignoredPackageManifestDirs = new Set([
  ".git",
  ".jj",
  ".moon",
  ".next",
  ".nx",
  ".pants.d",
  ".rush",
  ".turbo",
  ".gradle",
  "_build",
  "bazel-bin",
  "bazel-out",
  "bazel-testlogs",
  "build",
  "coverage",
  "deps",
  "dist",
  "node_modules",
  VENDOR_DIR
])

const NpmRepositorySchema = Schema.Union([
  Schema.String,
  Schema.Struct({
    url: Schema.String.pipe(Schema.check(Schema.isMinLength(1)))
  })
])

const NpmPackageMetadataSchema = Schema.Struct({
  version: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  gitHead: Schema.optionalKey(Schema.String.pipe(Schema.check(Schema.isMinLength(1)))),
  repository: Schema.optionalKey(NpmRepositorySchema)
})

type NpmPackageMetadataRaw = typeof NpmPackageMetadataSchema.Type

const decodeNpmPackageMetadata = Schema.decodeUnknownResult(NpmPackageMetadataSchema)

const collect = <E, R>(stream: Stream.Stream<Uint8Array, E, R>) =>
  stream.pipe(
    Stream.decodeText,
    Stream.runFold(
      () => "",
      (a, b) => a + b
    )
  )

export const packageSpecFromPackageJson = (
  json: string,
  packageName: string
): Option.Option<string> => packageJsonDependencySpec(json, packageName)

const packageJsonDependencyEcosystem = (name: string): PackageEcosystem => {
  if (name === "react") return "react"
  if (name === "react-native" || name.startsWith("@react-native/")) return "react-native"
  if (name === "expo" || name.startsWith("expo-") || name.startsWith("@expo/")) return "expo"
  return "npm"
}

const isDependencyRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const parseJsonObject = (text: string): Option.Option<Record<string, unknown>> => {
  const errors: ParseError[] = []
  const value = parseJsonc(text, errors, {
    allowTrailingComma: true,
    disallowComments: false
  })
  return errors.length === 0 && isRecord(value) ? Option.some(value) : Option.none()
}

const stringProperty = (value: unknown, key: string): Option.Option<string> =>
  isRecord(value) && typeof value[key] === "string" ? Option.some(value[key]) : Option.none()

const cleanLockedVersion = (value: string): string =>
  value
    .trim()
    .replace(/^\D*(?=\d)/, "")
    .replace(/\(.+$/, "")

const nonEmptyVersion = (value: string): Option.Option<string> => {
  const version = cleanLockedVersion(value)
  return /^\d/.test(version) ? Option.some(version) : Option.none()
}

export const packageJsonDependencies = (
  json: string,
  manifestPath = "package.json"
): ReadonlyArray<PackageDependency> => {
  const pkg = parsePackageJsonShape(json)
  return dependencySections.flatMap((section) => {
    const dependencies = pkg[section]
    if (!isDependencyRecord(dependencies)) return []
    return Object.entries(dependencies).flatMap(([name, spec]) =>
      typeof spec === "string" && spec.trim().length > 0
        ? [
            {
              ecosystem: packageJsonDependencyEcosystem(name),
              manifestPath,
              name,
              section,
              spec: spec.trim()
            }
          ]
        : []
    )
  })
}

const HEX_DEPENDENCY_TUPLE =
  /\{\s*:([a-z][a-z0-9_]*(?:[!?=])?)\s*,\s*"([^"]+)"(?<options>[^}]*)\}/gi

export const mixExsDependencies = (
  text: string,
  manifestPath = "mix.exs"
): ReadonlyArray<PackageDependency> => {
  const dependencies: Array<PackageDependency> = []
  for (const match of text.matchAll(HEX_DEPENDENCY_TUPLE)) {
    const name = match[1]
    const spec = match[2]
    const options = match.groups?.options ?? ""
    if (!name || !spec || /\b(?:git|github|path):/.test(options)) continue
    dependencies.push({
      ecosystem: "hex",
      manifestPath,
      name,
      section: "deps",
      spec: spec.trim()
    })
  }
  return dependencies
}

const dependencyNameFromRepositoryUrl = (url: string): string =>
  (url.replace(/#.*$/, "").replace(/\/+$/, "").split(/[/:]/).pop() ?? url)
    .replace(/\.git$/, "")
    .replace(/^@/, "")

const SWIFT_PACKAGE_DEPENDENCY =
  /\.package\s*\(\s*url:\s*"([^"]+)"[\s\S]*?\b(?:from|exact|branch|revision):\s*"([^"]+)"/g

export const swiftPackageDependencies = (
  text: string,
  manifestPath = "Package.swift"
): ReadonlyArray<PackageDependency> => {
  const dependencies: Array<PackageDependency> = []
  for (const match of text.matchAll(SWIFT_PACKAGE_DEPENDENCY)) {
    const repositoryUrl = match[1]?.trim()
    const spec = match[2]?.trim()
    if (!repositoryUrl || !spec) continue
    dependencies.push({
      ecosystem: "swift",
      manifestPath,
      name: dependencyNameFromRepositoryUrl(repositoryUrl),
      repositoryUrl,
      section: "package",
      spec
    })
  }
  return dependencies
}

const gradleDependencyConfigurations = [
  "implementation",
  "api",
  "compileOnly",
  "runtimeOnly",
  "testImplementation",
  "androidTestImplementation",
  "debugImplementation",
  "releaseImplementation",
  "kapt",
  "ksp"
] as const

const GRADLE_COORDINATE_DEPENDENCY = new RegExp(
  `\\b(${gradleDependencyConfigurations.join("|")})\\s*(?:\\(\\s*)?["']([^:"'\\s]+:[^:"'\\s]+):([^:"'\\s]+)["']`,
  "g"
)

export const androidGradleDependencies = (
  text: string,
  manifestPath = "build.gradle"
): ReadonlyArray<PackageDependency> => {
  const dependencies: Array<PackageDependency> = []
  for (const match of text.matchAll(GRADLE_COORDINATE_DEPENDENCY)) {
    const section = match[1] as PackageDependencySection | undefined
    const name = match[2]?.trim()
    const spec = match[3]?.trim()
    if (!section || !name || !spec) continue
    dependencies.push({
      ecosystem: "android",
      manifestPath,
      name,
      section,
      spec
    })
  }
  return dependencies
}

const catalogStringValue = (value: unknown): Option.Option<string> =>
  typeof value === "string" && value.trim().length > 0 ? Option.some(value.trim()) : Option.none()

const versionCatalogVersion = (
  catalog: Record<string, unknown>,
  entry: Record<string, unknown>
): Option.Option<string> => {
  const inlineVersion = catalogStringValue(entry.version)
  if (Option.isSome(inlineVersion)) return inlineVersion

  if (!isRecord(entry.version)) return Option.none()
  const ref = catalogStringValue(entry.version.ref)
  if (Option.isNone(ref) || !isRecord(catalog.versions)) return Option.none()
  return catalogStringValue(catalog.versions[ref.value])
}

export const androidVersionCatalogDependencies = (
  text: string,
  manifestPath = "gradle/libs.versions.toml"
): ReadonlyArray<PackageDependency> =>
  Effect.runSync(
    parseTomlText(text).pipe(
      Effect.map((catalog): ReadonlyArray<PackageDependency> => {
        if (!isRecord(catalog) || !isRecord(catalog.libraries)) return []
        return Object.values(catalog.libraries).flatMap((entry) => {
          if (!isRecord(entry)) return []
          const module = catalogStringValue(entry.module)
          const name =
            Option.isSome(module) && module.value.includes(":")
              ? module.value
              : Option.match(catalogStringValue(entry.group), {
                  onNone: () => "",
                  onSome: (group) =>
                    Option.match(catalogStringValue(entry.name), {
                      onNone: () => "",
                      onSome: (artifact) => `${group}:${artifact}`
                    })
                })
          const spec = versionCatalogVersion(catalog, entry)
          return name.length > 0 && Option.isSome(spec)
            ? [
                {
                  ecosystem: "android" as const,
                  manifestPath,
                  name,
                  section: "libraries" as const,
                  spec: spec.value
                }
              ]
            : []
        })
      }),
      Effect.orElseSucceed((): ReadonlyArray<PackageDependency> => [])
    )
  )

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export const parseMixLockVersion = (text: string, packageName: string): Option.Option<string> => {
  const escaped = escapeRegex(packageName)
  const entry = new RegExp(
    `(?:"${escaped}"|:${escaped})\\s*(?::|=>)\\s*\\{\\s*:hex\\s*,\\s*:[^,]+\\s*,\\s*"([^"]+)"`,
    "m"
  )
  return Option.fromNullishOr(text.match(entry)?.[1]).pipe(Option.flatMap(nonEmptyVersion))
}

export const mixProjectVersion = (text: string): Option.Option<string> =>
  Option.fromNullishOr(text.match(/\bversion:\s*"([^"]+)"/)?.[1]).pipe(
    Option.flatMap(nonEmptyVersion)
  )

export const mixProjectAppName = (text: string): Option.Option<string> =>
  Option.fromNullishOr(text.match(/\bapp:\s*:([a-z][a-z0-9_]*)/i)?.[1])

const packageJsonVersion = (json: string): Option.Option<string> =>
  parseJsonObject(json).pipe(
    Option.flatMap((value) => stringProperty(value, "version")),
    Option.flatMap(nonEmptyVersion)
  )

const packageJsonName = (json: string): Option.Option<string> =>
  parseJsonObject(json).pipe(Option.flatMap((value) => stringProperty(value, "name")))

const nodeModulesPackagePath = (packageName: string): string =>
  `node_modules/${packageName}/package.json`

const packageLockPackagePath = (packageName: string): string => `node_modules/${packageName}`

export const parsePackageLockVersion = (text: string, packageName: string): Option.Option<string> =>
  parseJsonObject(text).pipe(
    Option.flatMap((lock) => {
      const packages = lock.packages
      if (isRecord(packages)) {
        const entry = packages[packageLockPackagePath(packageName)]
        const version = stringProperty(entry, "version").pipe(Option.flatMap(nonEmptyVersion))
        if (Option.isSome(version)) return version
        for (const [key, value] of Object.entries(packages)) {
          if (key.endsWith(`/${packageLockPackagePath(packageName)}`)) {
            const nestedVersion = stringProperty(value, "version").pipe(
              Option.flatMap(nonEmptyVersion)
            )
            if (Option.isSome(nestedVersion)) return nestedVersion
          }
        }
      }

      const dependencies = lock.dependencies
      if (isRecord(dependencies)) {
        return stringProperty(dependencies[packageName], "version").pipe(
          Option.flatMap(nonEmptyVersion)
        )
      }

      return Option.none()
    })
  )

const lockDependencySections = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies"
] as const

const pnpmEntryVersion = (entry: unknown): Option.Option<string> => {
  if (typeof entry === "string") return nonEmptyVersion(entry)
  return stringProperty(entry, "version").pipe(Option.flatMap(nonEmptyVersion))
}

const pnpmVersionFromPackageKey = (key: string, packageName: string): Option.Option<string> => {
  const normalized = key.replace(/^\/+/, "")
  const prefix = `${packageName}@`
  return normalized.startsWith(prefix)
    ? nonEmptyVersion(normalized.slice(prefix.length))
    : Option.none()
}

export const parsePnpmLockVersion = (text: string, packageName: string): Option.Option<string> =>
  // sync by design: see lock-file parsing callers in this module
  Effect.runSync(
    parseYamlText(text).pipe(
      Effect.map((value): Option.Option<string> => {
        if (!isRecord(value)) return Option.none()
        const lock = value
        const importers = lock.importers
        if (isRecord(importers)) {
          for (const importer of Object.values(importers)) {
            if (!isRecord(importer)) continue
            for (const section of lockDependencySections) {
              const dependencies = importer[section]
              if (!isRecord(dependencies)) continue
              const version = pnpmEntryVersion(dependencies[packageName])
              if (Option.isSome(version)) return version
            }
          }
        }

        const packages = lock.packages
        if (isRecord(packages)) {
          for (const key of Object.keys(packages)) {
            const version = pnpmVersionFromPackageKey(key, packageName)
            if (Option.isSome(version)) return version
          }
        }

        return Option.none()
      }),
      Effect.orElseSucceed(() => Option.none<string>())
    )
  )

const yarnSelectorMatchesPackage = (selector: string, packageName: string): boolean => {
  const normalized = selector.trim().replace(/^"|"$/g, "")
  return normalized === packageName || normalized.startsWith(`${packageName}@`)
}

const yarnHeaderMatchesPackage = (header: string, packageName: string): boolean =>
  header.split(/,\s*/).some((selector) => yarnSelectorMatchesPackage(selector, packageName))

export const parseYarnLockVersion = (text: string, packageName: string): Option.Option<string> => {
  let matchingBlock = false
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed.endsWith(":") && !line.startsWith(" ") && !line.startsWith("\t")) {
      matchingBlock = yarnHeaderMatchesPackage(trimmed.slice(0, -1), packageName)
      continue
    }
    if (!matchingBlock) continue
    const match = trimmed.match(/^version\s+"([^"]+)"/)
    if (match?.[1]) return nonEmptyVersion(match[1])
  }
  return Option.none()
}

const bunVersionFromSpecifier = (specifier: string, packageName: string): Option.Option<string> => {
  const prefix = `${packageName}@`
  return specifier.startsWith(prefix)
    ? nonEmptyVersion(specifier.slice(prefix.length))
    : Option.none()
}

export const parseBunLockVersion = (text: string, packageName: string): Option.Option<string> =>
  parseJsonObject(text).pipe(
    Option.flatMap((lock) => {
      const packages = lock.packages
      if (!isRecord(packages)) return Option.none()
      const entry = packages[packageName]
      if (Array.isArray(entry) && typeof entry[0] === "string") {
        return bunVersionFromSpecifier(entry[0], packageName)
      }
      for (const value of Object.values(packages)) {
        if (Array.isArray(value) && typeof value[0] === "string") {
          const version = bunVersionFromSpecifier(value[0], packageName)
          if (Option.isSome(version)) return version
        }
      }
      return Option.none()
    })
  )

const normalizeManifestPath = (filePath: string): string => filePath.replaceAll("\\", "/")

const isIgnoredManifestPath = (filePath: string): boolean => {
  const normalized = normalizeManifestPath(filePath)
  return (
    normalized.split("/").some((part) => ignoredPackageManifestDirs.has(part)) ||
    normalized.startsWith("common/temp/")
  )
}

const sortManifestPaths = (paths: ReadonlyArray<string>, rootManifest = "package.json") =>
  [...paths].sort((a, b) => {
    if (a === rootManifest) return -1
    if (b === rootManifest) return 1
    return a.localeCompare(b)
  })

const listManifestPaths = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  cwd: string,
  manifestName: string
): Effect.Effect<ReadonlyArray<string>> => {
  const walk = (relativeDir: string): Effect.Effect<ReadonlyArray<string>> =>
    Effect.gen(function* () {
      const absoluteDir = relativeDir === "" ? cwd : path.resolve(cwd, relativeDir)
      const entries = yield* fs
        .readDirectory(absoluteDir)
        .pipe(Effect.catch(() => Effect.succeed([] as Array<string>)))
      const nested = yield* Effect.forEach(
        entries,
        (entry) =>
          Effect.gen(function* () {
            const relativePath = relativeDir === "" ? entry : `${relativeDir}/${entry}`
            if (isIgnoredManifestPath(relativePath)) return []
            if (entry === manifestName) return [relativePath]
            const info = yield* fs.stat(path.resolve(cwd, relativePath)).pipe(Effect.option)
            if (Option.isNone(info) || info.value.type !== "Directory") return []
            return yield* walk(relativePath)
          }),
        { concurrency: 8 }
      )
      return sortManifestPaths(nested.flat(), manifestName)
    })

  return walk("")
}

export const listPackageManifestPaths = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  cwd: string
): Effect.Effect<ReadonlyArray<string>> => listManifestPaths(fs, path, cwd, "package.json")

export const listMixManifestPaths = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  cwd: string
): Effect.Effect<ReadonlyArray<string>> => listManifestPaths(fs, path, cwd, "mix.exs")

export const listSwiftManifestPaths = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  cwd: string
): Effect.Effect<ReadonlyArray<string>> => listManifestPaths(fs, path, cwd, "Package.swift")

const listAndroidGradleManifestPaths = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  cwd: string
): Effect.Effect<ReadonlyArray<string>> =>
  Effect.all(
    [
      listManifestPaths(fs, path, cwd, "build.gradle"),
      listManifestPaths(fs, path, cwd, "build.gradle.kts")
    ],
    { concurrency: 2 }
  ).pipe(Effect.map((paths) => sortManifestPaths(paths.flat(), "build.gradle")))

const listAndroidVersionCatalogPaths = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  cwd: string
): Effect.Effect<ReadonlyArray<string>> => listManifestPaths(fs, path, cwd, "libs.versions.toml")

const repositoryUrlValue = (
  repository: NpmPackageMetadataRaw["repository"]
): Option.Option<string> => {
  if (typeof repository === "string") return Option.some(repository)
  if (repository === undefined) return Option.none()
  return Option.some(repository.url)
}

const normalizeNpmRepositoryUrl = (url: string): Option.Option<string> => {
  const normalized = url
    .trim()
    .replace(/^git\+/, "")
    .replace(/^ssh:\/\/git@github\.com\//, "git@github.com:")
    .replace(/#.*$/, "")
  return normalized.length === 0 ? Option.none() : Option.some(normalized)
}

const toNpmPackageMetadata = (raw: NpmPackageMetadataRaw): NpmPackageMetadata => ({
  version: raw.version,
  gitHead: raw.gitHead === undefined ? Option.none() : Option.some(raw.gitHead),
  repositoryUrl: repositoryUrlValue(raw.repository).pipe(Option.flatMap(normalizeNpmRepositoryUrl))
})

export const parseNpmPackageMetadata = (stdout: string): Option.Option<NpmPackageMetadata> =>
  Option.liftThrowable((value: string) => JSON.parse(value))(stdout).pipe(
    Option.flatMap((value) => {
      const rawValue = Array.isArray(value) ? value.at(-1) : value
      return Result.match(decodeNpmPackageMetadata(rawValue), {
        onFailure: () => Option.none<NpmPackageMetadata>(),
        onSuccess: (raw) => Option.some(toNpmPackageMetadata(raw))
      })
    })
  )

const normalizeRepositoryUrl = (url: string): Option.Option<string> => {
  const normalized = url
    .trim()
    .replace(/^git\+/, "")
    .replace(/#.*$/, "")
  return normalized.length === 0 ? Option.none() : Option.some(normalized)
}

const hexRepositoryUrl = (value: unknown): Option.Option<string> => {
  if (!isRecord(value)) return Option.none()
  const meta = value.meta
  if (!isRecord(meta) || !isRecord(meta.links)) return Option.none()
  const preferred = ["GitHub", "GitLab", "Repository", "Source", "repo", "source"]
  for (const key of preferred) {
    const link = meta.links[key]
    if (typeof link === "string") {
      const normalized = normalizeRepositoryUrl(link)
      if (Option.isSome(normalized)) return normalized
    }
  }
  for (const link of Object.values(meta.links)) {
    if (typeof link !== "string") continue
    const normalized = normalizeRepositoryUrl(link)
    if (Option.isSome(normalized) && /github|gitlab|bitbucket|codeberg|git\.sr\.ht/.test(link)) {
      return normalized
    }
  }
  return Option.none()
}

const hexStableVersion = (value: unknown): Option.Option<string> => {
  if (!isRecord(value)) return Option.none()
  const stable = stringProperty(value, "latest_stable_version").pipe(
    Option.flatMap(nonEmptyVersion)
  )
  if (Option.isSome(stable)) return stable
  const latest = stringProperty(value, "latest_version").pipe(Option.flatMap(nonEmptyVersion))
  if (Option.isSome(latest)) return latest
  if (!Array.isArray(value.releases)) return Option.none()
  for (const release of value.releases) {
    const version = stringProperty(release, "version").pipe(Option.flatMap(nonEmptyVersion))
    if (Option.isSome(version)) return version
  }
  return Option.none()
}

export const parseHexPackageMetadata = (stdout: string): Option.Option<HexPackageMetadata> =>
  Option.liftThrowable((value: string) => JSON.parse(value))(stdout).pipe(
    Option.flatMap((value) =>
      hexStableVersion(value).pipe(
        Option.map((latestStableVersion) => ({
          latestStableVersion,
          repositoryUrl: hexRepositoryUrl(value)
        }))
      )
    )
  )

const directXmlChild = (element: XmlElement, name: string): Option.Option<XmlElement> => {
  for (let index = 0; index < element.childNodes.length; index += 1) {
    const node = element.childNodes.item(index)
    if (node?.nodeType === 1 && (node as XmlElement).tagName === name) {
      return Option.some(node as XmlElement)
    }
  }
  return Option.none()
}

const directXmlText = (element: XmlElement, name: string): Option.Option<string> =>
  directXmlChild(element, name).pipe(
    Option.flatMap((child) => catalogStringValue(child.textContent ?? ""))
  )

const normalizeMavenScmUrl = (value: string): Option.Option<string> => {
  const normalized = value
    .trim()
    .replace(/^scm:[a-z]+:/i, "")
    .replace(/^git\+/, "")
    .replace(/#.*$/, "")
  return normalized.length === 0 ? Option.none() : Option.some(normalized)
}

export const parseMavenPomMetadata = (text: string): Option.Option<MavenPackageMetadata> =>
  Option.liftThrowable((value: string) =>
    new DOMParser({
      onError: (level, message) => {
        if (level !== "warning") throw new Error(message)
      }
    }).parseFromString(value, "application/xml")
  )(text).pipe(
    Option.flatMap((document) => {
      const root = document.documentElement
      if (!root || root.tagName !== "project") return Option.none<MavenPackageMetadata>()
      const version = directXmlText(root, "version")
      if (Option.isNone(version)) return Option.none<MavenPackageMetadata>()
      const scm = directXmlChild(root, "scm")
      const repositoryUrl = Option.isSome(scm)
        ? directXmlText(scm.value, "url").pipe(
            Option.orElse(() => directXmlText(scm.value, "connection")),
            Option.orElse(() => directXmlText(scm.value, "developerConnection")),
            Option.flatMap(normalizeMavenScmUrl)
          )
        : Option.none<string>()
      const tag = Option.isSome(scm)
        ? Option.getOrUndefined(directXmlText(scm.value, "tag"))
        : undefined
      return Option.some({
        ...(tag === undefined ? {} : { tag }),
        repositoryUrl,
        version: version.value
      })
    })
  )

const suggestedNameFromRepositoryUrl = (url: string): string =>
  (url.replace(/#.*$/, "").replace(/\/+$/, "").split(/[/:]/).pop() ?? url)
    .replace(/\.git$/, "")
    .replace(/^@/, "")

export const dependencyCandidateFromMetadata = (
  dependency: PackageDependency,
  metadata: NpmPackageMetadata
): DependencyVendorCandidate => {
  const repositoryUrl = Option.getOrUndefined(metadata.repositoryUrl)
  if (repositoryUrl === undefined) {
    return {
      manifestPath: dependency.manifestPath,
      packageName: dependency.name,
      packageSpec: dependency.spec,
      reason: "npm metadata does not include a repository URL",
      section: dependency.section,
      source: dependency.ecosystem,
      status: "missing-repository",
      syncPackage: syncPackageName(dependency),
      version: metadata.version
    }
  }
  return {
    manifestPath: dependency.manifestPath,
    packageName: dependency.name,
    packageSpec: dependency.spec,
    repositoryUrl,
    section: dependency.section,
    source: dependency.ecosystem,
    status: "matched",
    suggestedName: suggestedNameFromRepositoryUrl(repositoryUrl),
    syncPackage: syncPackageName(dependency),
    version: metadata.version
  }
}

export const dependencyCandidateFromHexMetadata = (
  dependency: PackageDependency,
  metadata: HexPackageMetadata
): DependencyVendorCandidate => {
  const repositoryUrl = Option.getOrUndefined(metadata.repositoryUrl)
  if (repositoryUrl === undefined) {
    return {
      manifestPath: dependency.manifestPath,
      packageName: dependency.name,
      packageSpec: dependency.spec,
      reason: "Hex metadata does not include a repository URL",
      section: dependency.section,
      source: "hex",
      status: "missing-repository",
      syncPackage: syncPackageName(dependency),
      version: metadata.latestStableVersion
    }
  }
  return {
    manifestPath: dependency.manifestPath,
    packageName: dependency.name,
    packageSpec: dependency.spec,
    repositoryUrl,
    section: dependency.section,
    source: "hex",
    status: "matched",
    suggestedName: suggestedNameFromRepositoryUrl(repositoryUrl),
    syncPackage: syncPackageName(dependency),
    version: metadata.latestStableVersion
  }
}

export const dependencyCandidateFromSourceMetadata = (
  dependency: PackageDependency
): DependencyVendorCandidate => {
  if (dependency.repositoryUrl === undefined) {
    return {
      manifestPath: dependency.manifestPath,
      packageName: dependency.name,
      packageSpec: dependency.spec,
      reason: `${dependency.ecosystem} dependency does not include a repository URL`,
      section: dependency.section,
      source: dependency.ecosystem,
      status: "missing-repository",
      syncPackage: syncPackageName(dependency),
      version: dependency.spec
    }
  }
  return {
    manifestPath: dependency.manifestPath,
    packageName: dependency.name,
    packageSpec: dependency.spec,
    repositoryUrl: dependency.repositoryUrl,
    section: dependency.section,
    source: dependency.ecosystem,
    status: "matched",
    suggestedName: suggestedNameFromRepositoryUrl(dependency.repositoryUrl),
    syncPackage: syncPackageName(dependency),
    version: dependency.spec
  }
}

export const dependencyCandidateFromMavenMetadata = (
  dependency: PackageDependency,
  metadata: MavenPackageMetadata
): DependencyVendorCandidate => {
  const repositoryUrl = Option.getOrUndefined(metadata.repositoryUrl)
  if (repositoryUrl === undefined) {
    return {
      manifestPath: dependency.manifestPath,
      packageName: dependency.name,
      packageSpec: dependency.spec,
      reason: "Maven metadata does not include an SCM repository URL",
      section: dependency.section,
      source: "android",
      status: "missing-repository",
      syncPackage: syncPackageName(dependency),
      version: metadata.version
    }
  }
  return {
    manifestPath: dependency.manifestPath,
    packageName: dependency.name,
    packageSpec: dependency.spec,
    repositoryUrl,
    section: dependency.section,
    source: "android",
    status: "matched",
    suggestedName: suggestedNameFromRepositoryUrl(repositoryUrl),
    syncPackage: syncPackageName(dependency),
    version: metadata.version
  }
}

const unscopedPackageName = (packageName: string): string =>
  packageName.startsWith("@") ? (packageName.split("/")[1] ?? packageName) : packageName

export const tagCandidatesForPackageVersion = (
  packageName: string,
  version: string
): ReadonlyArray<string> =>
  Array.from(
    new Set([
      `${packageName}@${version}`,
      `${unscopedPackageName(packageName)}@${version}`,
      `v${version}`,
      version
    ])
  )

const npmDescriptor = (packageName: string, spec: string): string =>
  spec === "" || spec === "*" ? packageName : `${packageName}@${spec}`

const readDependenciesFromManifests = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  cwd: string,
  manifestPaths: ReadonlyArray<string>,
  parse: (content: string, manifestPath: string) => ReadonlyArray<PackageDependency>
) =>
  Effect.forEach(
    manifestPaths,
    (manifestPath) =>
      fs.readFileString(path.resolve(cwd, manifestPath)).pipe(
        Effect.map((content) => parse(content, manifestPath)),
        Effect.catch(() => Effect.succeed([] as ReadonlyArray<PackageDependency>))
      ),
    { concurrency: 8 }
  ).pipe(Effect.map((entries) => entries.flat()))

const projectDependenciesForIdentity = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  cwd: string,
  identity: PackageIdentity
) =>
  Effect.gen(function* () {
    if (identity.ecosystem === "hex") {
      return yield* readDependenciesFromManifests(
        fs,
        path,
        cwd,
        yield* listMixManifestPaths(fs, path, cwd),
        mixExsDependencies
      )
    }
    if (identity.ecosystem === "swift") {
      return yield* readDependenciesFromManifests(
        fs,
        path,
        cwd,
        yield* listSwiftManifestPaths(fs, path, cwd),
        swiftPackageDependencies
      )
    }
    if (identity.ecosystem === "android") {
      const [gradleManifests, versionCatalogs] = yield* Effect.all(
        [
          listAndroidGradleManifestPaths(fs, path, cwd),
          listAndroidVersionCatalogPaths(fs, path, cwd)
        ],
        { concurrency: 2 }
      )
      const [gradleDependencies, catalogDependencies] = yield* Effect.all(
        [
          readDependenciesFromManifests(fs, path, cwd, gradleManifests, androidGradleDependencies),
          readDependenciesFromManifests(
            fs,
            path,
            cwd,
            versionCatalogs,
            androidVersionCatalogDependencies
          )
        ],
        { concurrency: 2 }
      )
      return [...gradleDependencies, ...catalogDependencies]
    }
    return yield* readDependenciesFromManifests(
      fs,
      path,
      cwd,
      yield* listPackageManifestPaths(fs, path, cwd),
      packageJsonDependencies
    )
  })

const packageDependencyFromProject = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  cwd: string,
  identity: PackageIdentity
) =>
  Effect.gen(function* () {
    const dependencies = yield* projectDependenciesForIdentity(fs, path, cwd, identity)
    for (const dependency of dependencies) {
      if (dependency.name === identity.name) {
        return Option.some(dependency)
      }
    }
    return Option.none<PackageDependency>()
  })

const readOptionalFile = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  cwd: string,
  relativePath: string
) => {
  const target = path.resolve(cwd, relativePath)
  return fs
    .exists(target)
    .pipe(
      Effect.flatMap((exists) =>
        exists
          ? fs.readFileString(target).pipe(Effect.option)
          : Effect.succeed(Option.none<string>())
      )
    )
}

const detectNodeModulesPackageVersion = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  cwd: string,
  packageName: string
) =>
  readOptionalFile(fs, path, cwd, nodeModulesPackagePath(packageName)).pipe(
    Effect.map(Option.flatMap(packageJsonVersion))
  )

const detectLockfileVersion = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  cwd: string,
  packageName: string
) =>
  Effect.gen(function* () {
    const packageLock = yield* readOptionalFile(fs, path, cwd, "package-lock.json")
    if (Option.isSome(packageLock)) {
      const version = parsePackageLockVersion(packageLock.value, packageName)
      if (Option.isSome(version)) return { source: "package-lock" as const, version }
    }

    const pnpmLock = yield* readOptionalFile(fs, path, cwd, "pnpm-lock.yaml")
    if (Option.isSome(pnpmLock)) {
      const version = parsePnpmLockVersion(pnpmLock.value, packageName)
      if (Option.isSome(version)) return { source: "pnpm-lock" as const, version }
    }

    const yarnLock = yield* readOptionalFile(fs, path, cwd, "yarn.lock")
    if (Option.isSome(yarnLock)) {
      const version = parseYarnLockVersion(yarnLock.value, packageName)
      if (Option.isSome(version)) return { source: "yarn-lock" as const, version }
    }

    const bunLock = yield* readOptionalFile(fs, path, cwd, "bun.lock")
    if (Option.isSome(bunLock)) {
      const version = parseBunLockVersion(bunLock.value, packageName)
      if (Option.isSome(version)) return { source: "bun-lock" as const, version }
    }

    return {
      source: "package-json" as const,
      version: Option.none<string>()
    }
  })

const detectMixPackageVersion = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  cwd: string,
  packageName: string
) =>
  Effect.gen(function* () {
    const mixLock = yield* readOptionalFile(fs, path, cwd, "mix.lock")
    if (Option.isSome(mixLock)) {
      const version = parseMixLockVersion(mixLock.value, packageName)
      if (Option.isSome(version)) return { source: "mix-lock" as const, version }
    }
    return {
      source: "mix-exs" as const,
      version: Option.none<string>()
    }
  })

export const detectProjectPackageVersion = ({
  cwd,
  dependency
}: {
  readonly cwd: string
  readonly dependency: PackageDependency
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    if (dependency.ecosystem === "hex") {
      const mixVersion = yield* detectMixPackageVersion(fs, path, cwd, dependency.name)
      return {
        packageSpec: dependency.spec,
        source: mixVersion.source,
        version: mixVersion.version
      } satisfies ProjectPackageVersion
    }
    if (dependency.ecosystem === "swift") {
      return {
        packageSpec: dependency.spec,
        source: "package-swift",
        version: nonEmptyVersion(dependency.spec)
      } satisfies ProjectPackageVersion
    }
    if (dependency.ecosystem === "android") {
      return {
        packageSpec: dependency.spec,
        source: "gradle",
        version: nonEmptyVersion(dependency.spec)
      } satisfies ProjectPackageVersion
    }

    const nodeModulesVersion = yield* detectNodeModulesPackageVersion(
      fs,
      path,
      cwd,
      dependency.name
    )
    if (Option.isSome(nodeModulesVersion)) {
      return {
        packageSpec: dependency.spec,
        source: "node_modules",
        version: nodeModulesVersion
      } satisfies ProjectPackageVersion
    }

    const lockfile = yield* detectLockfileVersion(fs, path, cwd, dependency.name)
    return {
      packageSpec: dependency.spec,
      source: lockfile.source,
      version: lockfile.version
    } satisfies ProjectPackageVersion
  })

const fallbackVersionSource = (ecosystem: PackageEcosystem): PackageVersionSource => {
  if (ecosystem === "android") return "gradle"
  if (ecosystem === "hex") return "mix-exs"
  if (ecosystem === "swift") return "package-swift"
  return "package-json"
}

const detectProjectPackageVersionWith = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  cwd: string,
  dependency: PackageDependency
) =>
  detectProjectPackageVersion({ cwd, dependency }).pipe(
    Effect.provideService(FileSystem.FileSystem, fs),
    Effect.provideService(Path.Path, path),
    Effect.catch(() =>
      Effect.succeed({
        packageSpec: dependency.spec,
        source: fallbackVersionSource(dependency.ecosystem),
        version: Option.none<string>()
      } satisfies ProjectPackageVersion)
    )
  )

const prefixedManifestPath = (prefix: string, manifestPath: string): string =>
  `${prefix.replace(/\/+$/, "")}/${manifestPath}`.replaceAll("\\", "/")

export const detectVendoredPackageVersion = ({
  cwd,
  ecosystem = "npm",
  packageName,
  prefix
}: {
  readonly cwd: string
  readonly ecosystem?: PackageEcosystem
  readonly packageName: string
  readonly prefix: string
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const vendorRoot = path.resolve(cwd, prefix)
    if (ecosystem === "hex") {
      const manifests = yield* listMixManifestPaths(fs, path, vendorRoot)
      for (const manifestPath of manifests) {
        const text = yield* fs
          .readFileString(path.resolve(vendorRoot, manifestPath))
          .pipe(Effect.catch(() => Effect.succeed("")))
        const appName = mixProjectAppName(text)
        if (Option.isSome(appName) && appName.value !== packageName) continue
        const version = mixProjectVersion(text)
        if (Option.isSome(version)) {
          return Option.some({
            manifestPath: prefixedManifestPath(prefix, manifestPath),
            version: version.value
          } satisfies VendoredPackageVersion)
        }
      }
      return Option.none<VendoredPackageVersion>()
    }
    if (ecosystem === "swift" || ecosystem === "android") {
      return Option.none<VendoredPackageVersion>()
    }

    const manifests = yield* listPackageManifestPaths(fs, path, vendorRoot)
    for (const manifestPath of manifests) {
      const json = yield* fs
        .readFileString(path.resolve(vendorRoot, manifestPath))
        .pipe(Effect.catch(() => Effect.succeed("")))
      const name = packageJsonName(json)
      if (Option.isNone(name) || name.value !== packageName) continue
      const version = packageJsonVersion(json)
      if (Option.isSome(version)) {
        return Option.some({
          manifestPath: prefixedManifestPath(prefix, manifestPath),
          version: version.value
        } satisfies VendoredPackageVersion)
      }
    }
    return Option.none<VendoredPackageVersion>()
  })

const npmDescriptorForProjectVersion = (
  packageName: string,
  detected: ProjectPackageVersion
): string =>
  Option.match(detected.version, {
    onNone: () => npmDescriptor(packageName, detected.packageSpec),
    onSome: (version) => npmDescriptor(packageName, version)
  })

const npmViewPackageMetadata = (
  executor: ChildProcessSpawner.ChildProcessSpawner["Service"],
  cwd: string,
  descriptor: string
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const command = ChildProcess.setCwd(
        ChildProcess.make("npm", [
          "view",
          descriptor,
          "version",
          "repository",
          "gitHead",
          "--json"
        ]),
        cwd
      )
      const proc = yield* executor.spawn(command)
      const [exitCode, stdout, stderr] = yield* Effect.all(
        [proc.exitCode, collect(proc.stdout), collect(proc.stderr)],
        { concurrency: 3 }
      )
      return {
        exitCode: Number(exitCode),
        stdout,
        stderr
      } satisfies CommandResult
    })
  )

const npmLatestMetadata = (
  executor: ChildProcessSpawner.ChildProcessSpawner["Service"],
  cwd: string,
  packageName: string
): Effect.Effect<Option.Option<NpmPackageMetadata>> =>
  npmViewPackageMetadata(executor, cwd, npmDescriptor(packageName, "latest")).pipe(
    Effect.map((result) =>
      result.exitCode === 0 ? parseNpmPackageMetadata(result.stdout) : Option.none()
    ),
    Effect.catch(() => Effect.succeed(Option.none<NpmPackageMetadata>()))
  )

const hexPackageMetadata = (
  _cwd: string,
  packageName: string
): Effect.Effect<Option.Option<HexPackageMetadata>> =>
  Effect.promise(async () => {
    const response = await fetch(`https://hex.pm/api/packages/${encodeURIComponent(packageName)}`, {
      headers: {
        accept: "application/json"
      }
    })
    if (!response.ok) return Option.none<HexPackageMetadata>()
    return parseHexPackageMetadata(await response.text())
  }).pipe(Effect.catch(() => Effect.succeed(Option.none<HexPackageMetadata>())))

const MAVEN_CENTRAL_BASE_URL = "https://repo1.maven.org/maven2"
const MAVEN_CENTRAL_SEARCH_URL = "https://search.maven.org/solrsearch/select"

const mavenPackageParts = (
  packageName: string
): Option.Option<{ readonly artifact: string; readonly group: string }> => {
  const [group, artifact, ...rest] = packageName.split(":")
  return group && artifact && rest.length === 0 ? Option.some({ artifact, group }) : Option.none()
}

const mavenPomUrl = ({
  artifact,
  group,
  version
}: {
  readonly artifact: string
  readonly group: string
  readonly version: string
}): string =>
  `${MAVEN_CENTRAL_BASE_URL}/${group.replaceAll(".", "/")}/${artifact}/${version}/${artifact}-${version}.pom`

const parseMavenLatestVersion = (text: string): Option.Option<string> =>
  parseJsonObject(text).pipe(
    Option.flatMap((payload) => {
      const response = payload.response
      if (!isRecord(response) || !Array.isArray(response.docs)) return Option.none<string>()
      for (const doc of response.docs) {
        const version = stringProperty(doc, "latestVersion").pipe(Option.flatMap(nonEmptyVersion))
        if (Option.isSome(version)) return version
      }
      return Option.none<string>()
    })
  )

const mavenLatestVersion = (packageName: string): Effect.Effect<Option.Option<string>> =>
  Option.match(mavenPackageParts(packageName), {
    onNone: () => Effect.succeed(Option.none<string>()),
    onSome: ({ artifact, group }) =>
      Effect.promise(async () => {
        const params = new URLSearchParams({
          q: `g:"${group}" AND a:"${artifact}"`,
          rows: "1",
          wt: "json"
        })
        const response = await fetch(`${MAVEN_CENTRAL_SEARCH_URL}?${params.toString()}`, {
          headers: { accept: "application/json" }
        })
        if (!response.ok) return Option.none<string>()
        return parseMavenLatestVersion(await response.text())
      }).pipe(Effect.catch(() => Effect.succeed(Option.none<string>())))
  })

const mavenMetadataVersion = (
  packageName: string,
  version: string
): Effect.Effect<Option.Option<string>> => {
  const exactVersion = nonEmptyVersion(version)
  return Option.isSome(exactVersion)
    ? Effect.succeed(exactVersion)
    : mavenLatestVersion(packageName)
}

const mavenPackageMetadata = (
  packageName: string,
  version: string
): Effect.Effect<Option.Option<MavenPackageMetadata>> =>
  Option.match(mavenPackageParts(packageName), {
    onNone: () => Effect.succeed(Option.none<MavenPackageMetadata>()),
    onSome: (parts) =>
      mavenMetadataVersion(packageName, version).pipe(
        Effect.flatMap((exactVersion) =>
          Option.match(exactVersion, {
            onNone: () => Effect.succeed(Option.none<MavenPackageMetadata>()),
            onSome: (resolvedVersion) =>
              Effect.promise(async () => {
                const response = await fetch(mavenPomUrl({ ...parts, version: resolvedVersion }), {
                  headers: { accept: "application/xml,text/xml" }
                })
                if (!response.ok) return Option.none<MavenPackageMetadata>()
                return parseMavenPomMetadata(await response.text()).pipe(
                  Option.orElse(() =>
                    Option.some({
                      repositoryUrl: Option.none<string>(),
                      version: resolvedVersion
                    })
                  )
                )
              }).pipe(Effect.catch(() => Effect.succeed(Option.none<MavenPackageMetadata>())))
          })
        )
      )
  })

const isNpmBackedPackageEcosystem = (ecosystem: PackageEcosystem): boolean =>
  ecosystem === "npm" ||
  ecosystem === "react" ||
  ecosystem === "expo" ||
  ecosystem === "react-native"

const withRemoteVersion = <A extends DependencyVendorCandidate>(
  candidate: A,
  metadata: Option.Option<NpmPackageMetadata>
): A =>
  Option.match(metadata, {
    onNone: () => candidate,
    onSome: (value) => ({ ...candidate, remoteVersion: value.version })
  })

const failedSync = ({ packageName, repoUrl }: PackageVersionSyncParams, reason: string) =>
  new PackageVersionSyncFailed({
    packageName,
    reason,
    url: repoUrl
  })

const failedPackageSource = ({ packageName }: PackageSourceResolutionParams, reason: string) =>
  new PackageVersionSyncFailed({
    packageName,
    reason,
    url: packageName.includes(":") ? packageName : `npm:${packageName}`
  })

const safeGitResult: GitResult = {
  exitCode: 1,
  stdout: "",
  stderr: ""
}

const tagExists = (git: GitShape, cwd: string, repoUrl: string, tag: string) =>
  git.exec(["ls-remote", "--tags", repoUrl, `refs/tags/${tag}`], { cwd }).pipe(
    Effect.catch(() => Effect.succeed(safeGitResult)),
    Effect.map((result) => result.exitCode === 0 && result.stdout.trim() !== "")
  )

const firstExistingTag = (
  git: GitShape,
  cwd: string,
  repoUrl: string,
  candidates: ReadonlyArray<string>
): Effect.Effect<Option.Option<string>> =>
  Effect.gen(function* () {
    for (const candidate of candidates) {
      const exists = yield* tagExists(git, cwd, repoUrl, candidate)
      if (exists) return Option.some(candidate)
    }
    return Option.none()
  })

const remoteDefaultBranch = (git: GitShape, cwd: string, repoUrl: string) =>
  git.exec(["ls-remote", "--symref", repoUrl, "HEAD"], { cwd }).pipe(
    Effect.catch(() => Effect.succeed(safeGitResult)),
    Effect.map((result) => {
      if (result.exitCode !== 0) return "HEAD"
      const match = result.stdout.match(/ref:\s+refs\/heads\/([^\s]+)\s+HEAD/)
      return match?.[1] ?? "HEAD"
    })
  )

const swiftRepositoryUrlFromInput = (input: string): Option.Option<string> => {
  const trimmed = input.trim()
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(trimmed)) {
    return Option.some(`https://github.com/${trimmed}.git`)
  }
  if (trimmed.startsWith("git@") || trimmed.includes("://")) {
    return normalizeRepositoryUrl(trimmed)
  }
  return Option.none()
}

const mavenTagCandidatesForPackageVersion = (
  packageName: string,
  version: string
): ReadonlyArray<string> => {
  const artifact = packageName.split(":").at(-1) ?? packageName
  return Array.from(
    new Set([
      `${artifact}-${version}`,
      `${artifact}_${version}`,
      `${artifact}@${version}`,
      `parent-${version}`,
      ...tagCandidatesForPackageVersion(packageName, version)
    ])
  )
}

const hexVersionFromMetadata = (
  detected: ProjectPackageVersion,
  metadata: HexPackageMetadata
): string => Option.getOrElse(detected.version, () => metadata.latestStableVersion)

const resolveHexPackageVersion = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  git: GitShape,
  params: PackageVersionSyncParams,
  identity: PackageIdentity
): Effect.Effect<PackageVersionResolution, PackageVersionSyncFailed> =>
  Effect.gen(function* () {
    const projectDependency = yield* packageDependencyFromProject(fs, path, params.cwd, identity)
    const dependency = yield* Option.match(projectDependency, {
      onNone: () =>
        Effect.fail(
          failedSync(params, `${identity.name} is not present in project mix.exs dependencies.`)
        ),
      onSome: Effect.succeed
    })
    const detected = yield* detectProjectPackageVersionWith(fs, path, params.cwd, dependency)
    const metadata = yield* Option.match(yield* hexPackageMetadata(params.cwd, identity.name), {
      onNone: () =>
        Effect.fail(failedSync(params, "Hex metadata did not include a usable version.")),
      onSome: Effect.succeed
    })
    const version = hexVersionFromMetadata(detected, metadata)
    const tag = yield* firstExistingTag(
      git,
      params.cwd,
      params.repoUrl,
      tagCandidatesForPackageVersion(identity.name, version)
    )
    return yield* Option.match(tag, {
      onNone: () =>
        Effect.fail(
          failedSync(params, `No matching source tag found for ${identity.name}@${version}.`)
        ),
      onSome: (ref) =>
        Effect.succeed({
          packageName: identity.name,
          packageSpec: detected.packageSpec,
          ref,
          repositoryUrl: metadata.repositoryUrl,
          source: "hex-tag",
          version,
          versionSource: detected.source
        } satisfies PackageVersionResolution)
    })
  })

const resolveHexPackageSource = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  git: GitShape,
  params: PackageSourceResolutionParams,
  identity: PackageIdentity
): Effect.Effect<PackageVersionResolution, PackageVersionSyncFailed> =>
  Effect.gen(function* () {
    const projectDependency = yield* packageDependencyFromProject(fs, path, params.cwd, identity)
    const dependency = Option.getOrElse(projectDependency, () => ({
      ecosystem: "hex" as const,
      manifestPath: "mix.exs",
      name: identity.name,
      section: "deps" as const,
      spec: "latest"
    }))
    const detected = yield* detectProjectPackageVersionWith(fs, path, params.cwd, dependency)
    const metadata = yield* Option.match(yield* hexPackageMetadata(params.cwd, identity.name), {
      onNone: () =>
        Effect.fail(failedPackageSource(params, "Hex metadata did not include a usable version.")),
      onSome: Effect.succeed
    })
    const repoUrl = yield* Option.match(metadata.repositoryUrl, {
      onNone: () =>
        Effect.fail(failedPackageSource(params, "Hex metadata did not include a repository URL.")),
      onSome: Effect.succeed
    })
    const version = hexVersionFromMetadata(detected, metadata)
    const tag = yield* firstExistingTag(
      git,
      params.cwd,
      repoUrl,
      tagCandidatesForPackageVersion(identity.name, version)
    )
    return yield* Option.match(tag, {
      onNone: () =>
        Effect.fail(
          failedPackageSource(
            params,
            `No matching source tag found for ${identity.name}@${version}.`
          )
        ),
      onSome: (ref) =>
        Effect.succeed({
          packageName: identity.name,
          packageSpec: detected.packageSpec,
          ref,
          repositoryUrl: metadata.repositoryUrl,
          source: "hex-tag",
          version,
          versionSource: detected.source
        } satisfies PackageVersionResolution)
    })
  })

const resolveSwiftPackageVersion = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  git: GitShape,
  params: PackageVersionSyncParams,
  identity: PackageIdentity
): Effect.Effect<PackageVersionResolution, PackageVersionSyncFailed> =>
  Effect.gen(function* () {
    const projectDependency = yield* packageDependencyFromProject(fs, path, params.cwd, identity)
    const dependency = yield* Option.match(projectDependency, {
      onNone: () =>
        Effect.fail(
          failedSync(
            params,
            `${identity.name} is not present in project Package.swift dependencies.`
          )
        ),
      onSome: Effect.succeed
    })
    const repoUrl = dependency.repositoryUrl ?? params.repoUrl
    const detected = yield* detectProjectPackageVersionWith(fs, path, params.cwd, dependency)
    const version = Option.getOrElse(detected.version, () => dependency.spec)
    const tag = yield* firstExistingTag(
      git,
      params.cwd,
      repoUrl,
      tagCandidatesForPackageVersion(identity.name, version)
    )
    return yield* Option.match(tag, {
      onNone: () =>
        Effect.fail(
          failedSync(params, `No matching source tag found for ${identity.name}@${version}.`)
        ),
      onSome: (ref) =>
        Effect.succeed({
          packageName: identity.name,
          packageSpec: detected.packageSpec,
          ref,
          repositoryUrl: Option.some(repoUrl),
          source: "git-tag",
          version,
          versionSource: detected.source
        } satisfies PackageVersionResolution)
    })
  })

const resolveSwiftPackageSource = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  git: GitShape,
  params: PackageSourceResolutionParams,
  identity: PackageIdentity
): Effect.Effect<PackageVersionResolution, PackageVersionSyncFailed> =>
  Effect.gen(function* () {
    const projectDependency = yield* packageDependencyFromProject(fs, path, params.cwd, identity)
    if (Option.isSome(projectDependency)) {
      const dependency = projectDependency.value
      const repoUrl = yield* Option.match(Option.fromNullishOr(dependency.repositoryUrl), {
        onNone: () =>
          Effect.fail(
            failedPackageSource(
              params,
              `${identity.name} does not include a source repository URL.`
            )
          ),
        onSome: Effect.succeed
      })
      const detected = yield* detectProjectPackageVersionWith(fs, path, params.cwd, dependency)
      const version = Option.getOrElse(detected.version, () => dependency.spec)
      const tag = yield* firstExistingTag(
        git,
        params.cwd,
        repoUrl,
        tagCandidatesForPackageVersion(identity.name, version)
      )
      return yield* Option.match(tag, {
        onNone: () =>
          Effect.fail(
            failedPackageSource(
              params,
              `No matching source tag found for ${identity.name}@${version}.`
            )
          ),
        onSome: (ref) =>
          Effect.succeed({
            packageName: identity.name,
            packageSpec: detected.packageSpec,
            ref,
            repositoryUrl: Option.some(repoUrl),
            source: "git-tag",
            version,
            versionSource: detected.source
          } satisfies PackageVersionResolution)
      })
    }

    const repoUrl = yield* Option.match(swiftRepositoryUrlFromInput(identity.name), {
      onNone: () =>
        Effect.fail(
          failedPackageSource(
            params,
            "Swift package targets must be present in Package.swift or use owner/repo or a repository URL."
          )
        ),
      onSome: Effect.succeed
    })
    const ref = yield* remoteDefaultBranch(git, params.cwd, repoUrl)
    return {
      packageName: identity.name,
      packageSpec: "latest",
      ref,
      repositoryUrl: Option.some(repoUrl),
      source: "git-default-branch",
      version: ref,
      versionSource: "package-swift"
    } satisfies PackageVersionResolution
  })

const resolveMavenRef = (
  git: GitShape,
  cwd: string,
  repoUrl: string,
  packageName: string,
  version: string,
  metadata: MavenPackageMetadata
): Effect.Effect<
  { readonly ref: string; readonly source: PackageVersionResolution["source"] },
  never
> =>
  Effect.gen(function* () {
    if (metadata.tag !== undefined && metadata.tag !== "" && metadata.tag !== "HEAD") {
      return { ref: metadata.tag, source: "maven-scm-tag" as const }
    }
    const tag = yield* firstExistingTag(
      git,
      cwd,
      repoUrl,
      mavenTagCandidatesForPackageVersion(packageName, version)
    )
    return Option.match(tag, {
      onNone: () => ({ ref: "", source: "git-tag" as const }),
      onSome: (ref) => ({ ref, source: "git-tag" as const })
    })
  })

const resolveAndroidPackageVersion = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  git: GitShape,
  params: PackageVersionSyncParams,
  identity: PackageIdentity
): Effect.Effect<PackageVersionResolution, PackageVersionSyncFailed> =>
  Effect.gen(function* () {
    const projectDependency = yield* packageDependencyFromProject(fs, path, params.cwd, identity)
    const dependency = yield* Option.match(projectDependency, {
      onNone: () =>
        Effect.fail(
          failedSync(params, `${identity.name} is not present in project Gradle dependencies.`)
        ),
      onSome: Effect.succeed
    })
    const detected = yield* detectProjectPackageVersionWith(fs, path, params.cwd, dependency)
    const metadata = yield* Option.match(
      yield* mavenPackageMetadata(
        identity.name,
        Option.getOrElse(detected.version, () => dependency.spec)
      ),
      {
        onNone: () =>
          Effect.fail(failedSync(params, "Maven metadata did not include a usable version.")),
        onSome: Effect.succeed
      }
    )
    const repoUrl = Option.getOrElse(metadata.repositoryUrl, () => params.repoUrl)
    const version = Option.getOrElse(detected.version, () => metadata.version)
    const resolved = yield* resolveMavenRef(
      git,
      params.cwd,
      repoUrl,
      identity.name,
      version,
      metadata
    )
    if (resolved.ref === "") {
      return yield* Effect.fail(
        failedSync(params, `No matching source tag found for ${identity.name}@${version}.`)
      )
    }
    return {
      packageName: identity.name,
      packageSpec: detected.packageSpec,
      ref: resolved.ref,
      repositoryUrl: Option.some(repoUrl),
      source: resolved.source,
      version,
      versionSource: detected.source
    } satisfies PackageVersionResolution
  })

const resolveAndroidPackageSource = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  git: GitShape,
  params: PackageSourceResolutionParams,
  identity: PackageIdentity
): Effect.Effect<PackageVersionResolution, PackageVersionSyncFailed> =>
  Effect.gen(function* () {
    const projectDependency = yield* packageDependencyFromProject(fs, path, params.cwd, identity)
    const dependency = Option.getOrElse(projectDependency, () => ({
      ecosystem: "android" as const,
      manifestPath: "build.gradle",
      name: identity.name,
      section: "implementation" as const,
      spec: "latest"
    }))
    const detected = yield* detectProjectPackageVersionWith(fs, path, params.cwd, dependency)
    const metadata = yield* Option.match(
      yield* mavenPackageMetadata(
        identity.name,
        Option.getOrElse(detected.version, () => dependency.spec)
      ),
      {
        onNone: () =>
          Effect.fail(
            failedPackageSource(params, "Maven metadata did not include a usable version.")
          ),
        onSome: Effect.succeed
      }
    )
    const repoUrl = yield* Option.match(metadata.repositoryUrl, {
      onNone: () =>
        Effect.fail(
          failedPackageSource(params, "Maven metadata did not include an SCM repository URL.")
        ),
      onSome: Effect.succeed
    })
    const version = Option.getOrElse(detected.version, () => metadata.version)
    const resolved = yield* resolveMavenRef(
      git,
      params.cwd,
      repoUrl,
      identity.name,
      version,
      metadata
    )
    if (resolved.ref === "") {
      return yield* Effect.fail(
        failedPackageSource(params, `No matching source tag found for ${identity.name}@${version}.`)
      )
    }
    return {
      packageName: identity.name,
      packageSpec: detected.packageSpec,
      ref: resolved.ref,
      repositoryUrl: metadata.repositoryUrl,
      source: resolved.source,
      version,
      versionSource: detected.source
    } satisfies PackageVersionResolution
  })

const resolvePackageVersion = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  executor: ChildProcessSpawner.ChildProcessSpawner["Service"],
  git: GitShape,
  params: PackageVersionSyncParams
): Effect.Effect<PackageVersionResolution, PackageVersionSyncFailed> =>
  Effect.gen(function* () {
    const identity = packageIdentityFromInput(params.packageName)
    if (identity.ecosystem === "hex") {
      return yield* resolveHexPackageVersion(fs, path, git, params, identity)
    }
    if (identity.ecosystem === "swift") {
      return yield* resolveSwiftPackageVersion(fs, path, git, params, identity)
    }
    if (identity.ecosystem === "android") {
      return yield* resolveAndroidPackageVersion(fs, path, git, params, identity)
    }
    if (!isNpmBackedPackageEcosystem(identity.ecosystem)) {
      return yield* Effect.fail(
        failedSync(params, `Unsupported package ecosystem ${identity.ecosystem}.`)
      )
    }
    const projectDependency = yield* packageDependencyFromProject(fs, path, params.cwd, identity)
    const dependency = yield* Option.match(projectDependency, {
      onNone: () =>
        Effect.fail(
          failedSync(
            params,
            `${identity.name} is not present in project package.json dependencies.`
          )
        ),
      onSome: Effect.succeed
    })
    const detected = yield* detectProjectPackageVersionWith(fs, path, params.cwd, dependency)
    const npm = yield* npmViewPackageMetadata(
      executor,
      params.cwd,
      npmDescriptorForProjectVersion(identity.name, detected)
    ).pipe(Effect.catch(() => Effect.fail(failedSync(params, "npm view could not be executed."))))
    if (npm.exitCode !== 0) {
      return yield* Effect.fail(
        failedSync(
          params,
          npm.stderr.trim() || npm.stdout.trim() || "npm view returned no metadata."
        )
      )
    }

    const metadata = yield* Option.match(parseNpmPackageMetadata(npm.stdout), {
      onNone: () =>
        Effect.fail(failedSync(params, "npm metadata did not include a usable version.")),
      onSome: Effect.succeed
    })

    if (Option.isSome(metadata.gitHead)) {
      return {
        packageName: identity.name,
        packageSpec: detected.packageSpec,
        ref: metadata.gitHead.value,
        repositoryUrl: metadata.repositoryUrl,
        source: "npm-gitHead",
        version: metadata.version,
        versionSource: detected.source
      }
    }

    const tag = yield* firstExistingTag(
      git,
      params.cwd,
      params.repoUrl,
      tagCandidatesForPackageVersion(identity.name, metadata.version)
    )
    return yield* Option.match(tag, {
      onNone: () =>
        Effect.fail(
          failedSync(
            params,
            `No matching source tag found for ${identity.name}@${metadata.version}.`
          )
        ),
      onSome: (ref) =>
        Effect.succeed({
          packageName: identity.name,
          packageSpec: detected.packageSpec,
          ref,
          repositoryUrl: metadata.repositoryUrl,
          source: "git-tag",
          version: metadata.version,
          versionSource: detected.source
        } satisfies PackageVersionResolution)
    })
  })

const resolvePackageSource = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  executor: ChildProcessSpawner.ChildProcessSpawner["Service"],
  git: GitShape,
  params: PackageSourceResolutionParams
): Effect.Effect<PackageVersionResolution, PackageVersionSyncFailed> =>
  Effect.gen(function* () {
    const identity = packageIdentityFromInput(params.packageName)
    if (identity.ecosystem === "hex") {
      return yield* resolveHexPackageSource(fs, path, git, params, identity)
    }
    if (identity.ecosystem === "swift") {
      return yield* resolveSwiftPackageSource(fs, path, git, params, identity)
    }
    if (identity.ecosystem === "android") {
      return yield* resolveAndroidPackageSource(fs, path, git, params, identity)
    }
    if (!isNpmBackedPackageEcosystem(identity.ecosystem)) {
      return yield* Effect.fail(
        failedPackageSource(params, `Unsupported package ecosystem ${identity.ecosystem}.`)
      )
    }
    const projectDependency = yield* packageDependencyFromProject(fs, path, params.cwd, identity)
    const dependency = Option.getOrElse(projectDependency, () => ({
      ecosystem: identity.ecosystem,
      manifestPath: "package.json",
      name: identity.name,
      section: "dependencies" as const,
      spec: "latest"
    }))
    const detected = yield* detectProjectPackageVersionWith(fs, path, params.cwd, dependency)
    const npm = yield* npmViewPackageMetadata(
      executor,
      params.cwd,
      npmDescriptorForProjectVersion(identity.name, detected)
    ).pipe(
      Effect.catch(() =>
        Effect.fail(failedPackageSource(params, "npm view could not be executed."))
      )
    )
    if (npm.exitCode !== 0) {
      return yield* Effect.fail(
        failedPackageSource(
          params,
          npm.stderr.trim() || npm.stdout.trim() || "npm view returned no metadata."
        )
      )
    }

    const metadata = yield* Option.match(parseNpmPackageMetadata(npm.stdout), {
      onNone: () =>
        Effect.fail(failedPackageSource(params, "npm metadata did not include a usable version.")),
      onSome: Effect.succeed
    })
    const repoUrl = yield* Option.match(metadata.repositoryUrl, {
      onNone: () =>
        Effect.fail(failedPackageSource(params, "npm metadata did not include a repository URL.")),
      onSome: Effect.succeed
    })

    if (Option.isSome(metadata.gitHead)) {
      return {
        packageName: identity.name,
        packageSpec: detected.packageSpec,
        ref: metadata.gitHead.value,
        repositoryUrl: metadata.repositoryUrl,
        source: "npm-gitHead",
        version: metadata.version,
        versionSource: detected.source
      }
    }

    const tag = yield* firstExistingTag(
      git,
      params.cwd,
      repoUrl,
      tagCandidatesForPackageVersion(identity.name, metadata.version)
    )
    return yield* Option.match(tag, {
      onNone: () =>
        Effect.fail(
          failedPackageSource(
            params,
            `No matching source tag found for ${identity.name}@${metadata.version}.`
          )
        ),
      onSome: (ref) =>
        Effect.succeed({
          packageName: identity.name,
          packageSpec: detected.packageSpec,
          ref,
          repositoryUrl: metadata.repositoryUrl,
          source: "git-tag",
          version: metadata.version,
          versionSource: detected.source
        } satisfies PackageVersionResolution)
    })
  })

const unavailableCandidate = (
  dependency: PackageDependency,
  reason: string
): DependencyVendorCandidate => ({
  manifestPath: dependency.manifestPath,
  packageName: dependency.name,
  packageSpec: dependency.spec,
  reason,
  section: dependency.section,
  source: dependency.ecosystem,
  status: "metadata-unavailable",
  syncPackage: syncPackageName(dependency)
})

const scanPackageDependency = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  executor: ChildProcessSpawner.ChildProcessSpawner["Service"],
  cwd: string,
  dependency: PackageDependency
): Effect.Effect<DependencyVendorCandidate> =>
  Effect.gen(function* () {
    const detected = yield* detectProjectPackageVersionWith(fs, path, cwd, dependency)

    if (dependency.ecosystem === "hex") {
      return yield* hexPackageMetadata(cwd, dependency.name).pipe(
        Effect.map((metadata) =>
          Option.match(metadata, {
            onNone: () => ({
              ...unavailableCandidate(dependency, "Hex metadata did not include a usable version"),
              versionSource: detected.source
            }),
            onSome: (value) => ({
              ...dependencyCandidateFromHexMetadata(dependency, value),
              remoteVersion: value.latestStableVersion,
              version: Option.getOrElse(detected.version, () => value.latestStableVersion),
              versionSource: detected.source
            })
          })
        ),
        Effect.catch(() =>
          Effect.succeed({
            ...unavailableCandidate(dependency, "Hex metadata fetch failed"),
            versionSource: detected.source
          })
        )
      )
    }

    if (dependency.ecosystem === "swift") {
      return {
        ...dependencyCandidateFromSourceMetadata(dependency),
        version: Option.getOrElse(detected.version, () => dependency.spec),
        versionSource: detected.source
      }
    }

    if (dependency.ecosystem === "android") {
      return yield* mavenPackageMetadata(
        dependency.name,
        Option.getOrElse(detected.version, () => dependency.spec)
      ).pipe(
        Effect.map((metadata) =>
          Option.match(metadata, {
            onNone: () => ({
              ...unavailableCandidate(
                dependency,
                "Maven metadata did not include a usable version"
              ),
              versionSource: detected.source
            }),
            onSome: (value) => ({
              ...dependencyCandidateFromMavenMetadata(dependency, value),
              remoteVersion: value.version,
              version: Option.getOrElse(detected.version, () => value.version),
              versionSource: detected.source
            })
          })
        ),
        Effect.catch(() =>
          Effect.succeed({
            ...unavailableCandidate(dependency, "Maven metadata fetch failed"),
            versionSource: detected.source
          })
        )
      )
    }

    const remoteMetadata = yield* npmLatestMetadata(executor, cwd, dependency.name)
    const result = yield* npmViewPackageMetadata(
      executor,
      cwd,
      npmDescriptorForProjectVersion(dependency.name, detected)
    ).pipe(Effect.catch(() => Effect.succeed({ exitCode: 1, stderr: "", stdout: "" })))
    if (result.exitCode !== 0) {
      return withRemoteVersion(
        {
          ...unavailableCandidate(
            dependency,
            result.stderr.trim() || result.stdout.trim() || "npm view returned no metadata"
          ),
          versionSource: detected.source
        },
        remoteMetadata
      )
    }
    const metadata = parseNpmPackageMetadata(result.stdout)
    const candidate = Option.match(metadata, {
      onNone: () => ({
        ...unavailableCandidate(dependency, "npm metadata did not include a usable version"),
        versionSource: detected.source
      }),
      onSome: (value) => ({
        ...dependencyCandidateFromMetadata(dependency, value),
        versionSource: detected.source
      })
    })
    return withRemoteVersion(candidate, remoteMetadata)
  }).pipe(
    Effect.catch(() =>
      Effect.succeed({
        ...unavailableCandidate(dependency, "package metadata scan failed"),
        versionSource: fallbackVersionSource(dependency.ecosystem)
      })
    )
  )

const scanPackageDependencies = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  executor: ChildProcessSpawner.ChildProcessSpawner["Service"],
  cwd: string
) =>
  Effect.all(
    [
      listPackageManifestPaths(fs, path, cwd),
      listMixManifestPaths(fs, path, cwd),
      listSwiftManifestPaths(fs, path, cwd),
      listAndroidGradleManifestPaths(fs, path, cwd),
      listAndroidVersionCatalogPaths(fs, path, cwd)
    ],
    { concurrency: 5 }
  ).pipe(
    Effect.flatMap(([packageManifests, mixManifests, swiftManifests, gradleManifests, catalogs]) =>
      Effect.all(
        [
          readDependenciesFromManifests(fs, path, cwd, packageManifests, packageJsonDependencies),
          readDependenciesFromManifests(fs, path, cwd, mixManifests, mixExsDependencies),
          readDependenciesFromManifests(fs, path, cwd, swiftManifests, swiftPackageDependencies),
          readDependenciesFromManifests(fs, path, cwd, gradleManifests, androidGradleDependencies),
          readDependenciesFromManifests(fs, path, cwd, catalogs, androidVersionCatalogDependencies)
        ],
        { concurrency: 5 }
      )
    ),
    Effect.map((manifests) => {
      const dependencies = manifests.flat()
      const seen = new Set<string>()
      return dependencies.filter((dependency) => {
        const key = `${dependency.ecosystem}\u0000${dependency.name}\u0000${dependency.spec}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    }),
    Effect.flatMap((dependencies) =>
      Effect.forEach(
        dependencies,
        (dependency) => scanPackageDependency(fs, path, executor, cwd, dependency),
        { concurrency: 6 }
      )
    )
  )

export interface PackageVersionSyncShape {
  readonly resolve: (
    params: PackageVersionSyncParams
  ) => Effect.Effect<PackageVersionResolution, PackageVersionSyncFailed>
  readonly resolvePackageSource: (
    params: PackageSourceResolutionParams
  ) => Effect.Effect<PackageVersionResolution, PackageVersionSyncFailed>
  readonly scan: (cwd: string) => Effect.Effect<ReadonlyArray<DependencyVendorCandidate>, unknown>
}

export class PackageVersionSync extends Context.Service<
  PackageVersionSync,
  PackageVersionSyncShape
>()("ingraft/PackageVersionSync") {}

export const PackageVersionSyncLive = Layer.effect(
  PackageVersionSync,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const executor = yield* ChildProcessSpawner.ChildProcessSpawner
    const git = yield* Git
    return {
      resolve: (params: PackageVersionSyncParams) =>
        resolvePackageVersion(fs, path, executor, git, params),
      resolvePackageSource: (params: PackageSourceResolutionParams) =>
        resolvePackageSource(fs, path, executor, git, params),
      scan: (cwd: string) => scanPackageDependencies(fs, path, executor, cwd)
    }
  })
)
