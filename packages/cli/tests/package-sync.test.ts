import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { NodeServices } from "@effect/platform-node"
import { Effect, Option } from "effect"

import {
  androidGradleDependencies,
  androidVersionCatalogDependencies,
  detectVendoredPackageVersion,
  detectProjectPackageVersion,
  dependencyCandidateFromMetadata,
  dependencyCandidateFromMavenMetadata,
  dependencyCandidateFromSourceMetadata,
  dependencyCandidateFromHexMetadata,
  mixExsDependencies,
  packageJsonDependencies,
  packageSpecFromPackageJson,
  parseBunLockVersion,
  parseHexPackageMetadata,
  parseMavenPomMetadata,
  parseMixLockVersion,
  parseNpmPackageMetadata,
  parsePackageLockVersion,
  parsePnpmLockVersion,
  parseYarnLockVersion,
  swiftPackageDependencies,
  tagCandidatesForPackageVersion
} from "../src/package-sync/service.ts"

const withTempWorkspace = async <A>(run: (cwd: string) => Promise<A>): Promise<A> => {
  const cwd = mkdtempSync(join(tmpdir(), "vendor-package-sync-"))
  try {
    return await run(cwd)
  } finally {
    rmSync(cwd, { force: true, recursive: true })
  }
}

describe("package version sync", () => {
  test("reads package.json dependencies across npm dependency sections", () => {
    expect(
      packageJsonDependencies(
        JSON.stringify({
          dependencies: { effect: "^3.21.2", expo: "~54.0.0" },
          devDependencies: { typescript: "~6.0.3", "react-native": "0.82.0" },
          optionalDependencies: { sharp: "^0.34.0" },
          peerDependencies: { react: "^19.0.0" }
        })
      )
    ).toEqual([
      {
        ecosystem: "npm",
        manifestPath: "package.json",
        name: "effect",
        section: "dependencies",
        spec: "^3.21.2"
      },
      {
        ecosystem: "expo",
        manifestPath: "package.json",
        name: "expo",
        section: "dependencies",
        spec: "~54.0.0"
      },
      {
        ecosystem: "npm",
        manifestPath: "package.json",
        name: "typescript",
        section: "devDependencies",
        spec: "~6.0.3"
      },
      {
        ecosystem: "react-native",
        manifestPath: "package.json",
        name: "react-native",
        section: "devDependencies",
        spec: "0.82.0"
      },
      {
        ecosystem: "npm",
        manifestPath: "package.json",
        name: "sharp",
        section: "optionalDependencies",
        spec: "^0.34.0"
      },
      {
        ecosystem: "react",
        manifestPath: "package.json",
        name: "react",
        section: "peerDependencies",
        spec: "^19.0.0"
      }
    ])
  })

  test("reads Hex dependencies from mix.exs deps tuples", () => {
    expect(
      mixExsDependencies(
        [
          "defp deps do",
          "  [",
          '    {:jason, "~> 1.4"},',
          '    {:plug, "~> 1.15", optional: true},',
          '    {:local_dep, path: "../local_dep"},',
          '    {:git_dep, git: "https://github.com/acme/git_dep.git"}',
          "  ]",
          "end"
        ].join("\n")
      )
    ).toEqual([
      {
        ecosystem: "hex",
        manifestPath: "mix.exs",
        name: "jason",
        section: "deps",
        spec: "~> 1.4"
      },
      {
        ecosystem: "hex",
        manifestPath: "mix.exs",
        name: "plug",
        section: "deps",
        spec: "~> 1.15"
      }
    ])
  })

  test("reads exact Hex package versions from mix.lock", () => {
    const version = parseMixLockVersion(
      [
        "%{",
        '  "castore": {:hex, :castore, "1.0.11", "checksum", [:mix], [], "hexpm", "checksum"},',
        '  "jason": {:hex, :jason, "1.4.5", "checksum", [:mix], [], "hexpm", "checksum"}',
        "}"
      ].join("\n"),
      "jason"
    )

    expect(Option.getOrUndefined(version)).toBe("1.4.5")
  })

  test("reads Swift Package dependencies with direct source repositories", () => {
    expect(
      swiftPackageDependencies(
        [
          "// swift-tools-version: 6.0",
          "import PackageDescription",
          "let package = Package(",
          '  name: "Example",',
          "  dependencies: [",
          '    .package(url: "https://github.com/apple/swift-argument-parser", from: "1.4.0"),',
          '    .package(url: "https://github.com/pointfreeco/swift-composable-architecture.git", exact: "1.20.2"),',
          "  ]",
          ")"
        ].join("\n")
      )
    ).toEqual([
      {
        ecosystem: "swift",
        manifestPath: "Package.swift",
        name: "swift-argument-parser",
        repositoryUrl: "https://github.com/apple/swift-argument-parser",
        section: "package",
        spec: "1.4.0"
      },
      {
        ecosystem: "swift",
        manifestPath: "Package.swift",
        name: "swift-composable-architecture",
        repositoryUrl: "https://github.com/pointfreeco/swift-composable-architecture.git",
        section: "package",
        spec: "1.20.2"
      }
    ])
  })

  test("reads Android Gradle and version catalog dependencies", () => {
    expect(
      androidGradleDependencies(
        [
          "dependencies {",
          '  implementation("com.squareup.okhttp3:okhttp:4.12.0")',
          "  androidTestImplementation 'androidx.test.ext:junit:1.2.1'",
          '  implementation(project(":shared"))',
          "}"
        ].join("\n"),
        "app/build.gradle.kts"
      )
    ).toEqual([
      {
        ecosystem: "android",
        manifestPath: "app/build.gradle.kts",
        name: "com.squareup.okhttp3:okhttp",
        section: "implementation",
        spec: "4.12.0"
      },
      {
        ecosystem: "android",
        manifestPath: "app/build.gradle.kts",
        name: "androidx.test.ext:junit",
        section: "androidTestImplementation",
        spec: "1.2.1"
      }
    ])

    expect(
      androidVersionCatalogDependencies(
        [
          "[libraries]",
          'core-ktx = { module = "androidx.core:core-ktx", version = "1.13.1" }',
          'okhttp = { group = "com.squareup.okhttp3", name = "okhttp", version = "4.12.0" }'
        ].join("\n")
      )
    ).toEqual([
      {
        ecosystem: "android",
        manifestPath: "gradle/libs.versions.toml",
        name: "androidx.core:core-ktx",
        section: "libraries",
        spec: "1.13.1"
      },
      {
        ecosystem: "android",
        manifestPath: "gradle/libs.versions.toml",
        name: "com.squareup.okhttp3:okhttp",
        section: "libraries",
        spec: "4.12.0"
      }
    ])
  })

  test("keeps the source manifest path on scanned dependencies", () => {
    expect(
      packageJsonDependencies(
        JSON.stringify({ dependencies: { "@opentui/core": "^0.2.8" } }),
        "packages/tui/package.json"
      )
    ).toEqual([
      {
        ecosystem: "npm",
        manifestPath: "packages/tui/package.json",
        name: "@opentui/core",
        section: "dependencies",
        spec: "^0.2.8"
      }
    ])
  })

  test("finds the dependency spec in root package.json dependency sections", () => {
    const spec = packageSpecFromPackageJson(
      JSON.stringify({
        dependencies: { effect: "^3.21.2" },
        devDependencies: { typescript: "~5.9.3" }
      }),
      "typescript"
    )

    expect(Option.getOrUndefined(spec)).toBe("~5.9.3")
  })

  test("parses npm metadata needed to resolve source refs", () => {
    const metadata = parseNpmPackageMetadata(
      JSON.stringify({
        version: "3.21.2",
        gitHead: "3f4cf6fb7d204e20d29f936f8f9d9b9ed3f40b23",
        repository: {
          type: "git",
          url: "git+https://github.com/Effect-TS/effect.git"
        }
      })
    )

    expect(metadata).toEqual(
      Option.some({
        version: "3.21.2",
        gitHead: Option.some("3f4cf6fb7d204e20d29f936f8f9d9b9ed3f40b23"),
        repositoryUrl: Option.some("https://github.com/Effect-TS/effect.git")
      })
    )
  })

  test("parses Hex metadata with a stable version and source repository", () => {
    const metadata = parseHexPackageMetadata(
      JSON.stringify({
        latest_stable_version: "1.4.5",
        latest_version: "1.5.0-alpha.2",
        meta: {
          links: {
            GitHub: "https://github.com/michalmuskala/jason"
          }
        },
        name: "jason",
        releases: [{ version: "1.5.0-alpha.2" }, { version: "1.4.5" }]
      })
    )

    expect(metadata).toEqual(
      Option.some({
        latestStableVersion: "1.4.5",
        repositoryUrl: Option.some("https://github.com/michalmuskala/jason")
      })
    )
  })

  test("parses Maven POM metadata with SCM repository", () => {
    const metadata = parseMavenPomMetadata(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        "<project>",
        "  <groupId>com.squareup.okhttp3</groupId>",
        "  <artifactId>okhttp</artifactId>",
        "  <version>4.12.0</version>",
        "  <scm>",
        "    <url>https://github.com/square/okhttp</url>",
        "  </scm>",
        "</project>"
      ].join("\n")
    )

    expect(metadata).toEqual(
      Option.some({
        repositoryUrl: Option.some("https://github.com/square/okhttp"),
        version: "4.12.0"
      })
    )
  })

  test("uses the newest npm metadata entry when a range returns multiple versions", () => {
    const metadata = parseNpmPackageMetadata(
      JSON.stringify([
        {
          version: "24.10.2",
          repository: {
            type: "git",
            url: "https://github.com/DefinitelyTyped/DefinitelyTyped.git"
          }
        },
        {
          version: "24.10.11",
          repository: {
            type: "git",
            url: "https://github.com/DefinitelyTyped/DefinitelyTyped.git"
          }
        }
      ])
    )

    expect(metadata).toEqual(
      Option.some({
        version: "24.10.11",
        gitHead: Option.none(),
        repositoryUrl: Option.some("https://github.com/DefinitelyTyped/DefinitelyTyped.git")
      })
    )
  })

  test("creates a vendoring candidate from npm repository metadata", () => {
    const candidate = dependencyCandidateFromMetadata(
      {
        ecosystem: "npm",
        manifestPath: "packages/cli/package.json",
        name: "@effect/platform",
        section: "dependencies",
        spec: "^0.96.1"
      },
      {
        version: "0.96.1",
        gitHead: Option.some("abc123"),
        repositoryUrl: Option.some("https://github.com/Effect-TS/effect.git")
      }
    )

    expect(candidate).toEqual({
      manifestPath: "packages/cli/package.json",
      packageName: "@effect/platform",
      packageSpec: "^0.96.1",
      repositoryUrl: "https://github.com/Effect-TS/effect.git",
      section: "dependencies",
      source: "npm",
      status: "matched",
      suggestedName: "effect",
      syncPackage: "@effect/platform",
      version: "0.96.1"
    })
  })

  test("creates a vendoring candidate from Hex package metadata", () => {
    const candidate = dependencyCandidateFromHexMetadata(
      {
        ecosystem: "hex",
        manifestPath: "mix.exs",
        name: "jason",
        section: "deps",
        spec: "~> 1.4"
      },
      {
        latestStableVersion: "1.4.5",
        repositoryUrl: Option.some("https://github.com/michalmuskala/jason")
      }
    )

    expect(candidate).toEqual({
      manifestPath: "mix.exs",
      packageName: "jason",
      packageSpec: "~> 1.4",
      repositoryUrl: "https://github.com/michalmuskala/jason",
      section: "deps",
      source: "hex",
      status: "matched",
      suggestedName: "jason",
      syncPackage: "hex:jason",
      version: "1.4.5"
    })
  })

  test("creates vendoring candidates from Swift and Android source metadata", () => {
    expect(
      dependencyCandidateFromSourceMetadata({
        ecosystem: "swift",
        manifestPath: "Package.swift",
        name: "swift-argument-parser",
        repositoryUrl: "https://github.com/apple/swift-argument-parser",
        section: "package",
        spec: "1.4.0"
      })
    ).toEqual({
      manifestPath: "Package.swift",
      packageName: "swift-argument-parser",
      packageSpec: "1.4.0",
      repositoryUrl: "https://github.com/apple/swift-argument-parser",
      section: "package",
      source: "swift",
      status: "matched",
      suggestedName: "swift-argument-parser",
      syncPackage: "swift:swift-argument-parser",
      version: "1.4.0"
    })

    expect(
      dependencyCandidateFromMavenMetadata(
        {
          ecosystem: "android",
          manifestPath: "app/build.gradle.kts",
          name: "com.squareup.okhttp3:okhttp",
          section: "implementation",
          spec: "4.12.0"
        },
        {
          repositoryUrl: Option.some("https://github.com/square/okhttp"),
          version: "4.12.0"
        }
      )
    ).toEqual({
      manifestPath: "app/build.gradle.kts",
      packageName: "com.squareup.okhttp3:okhttp",
      packageSpec: "4.12.0",
      repositoryUrl: "https://github.com/square/okhttp",
      section: "implementation",
      source: "android",
      status: "matched",
      suggestedName: "okhttp",
      syncPackage: "android:com.squareup.okhttp3:okhttp",
      version: "4.12.0"
    })
  })

  test("prefers package-specific tag candidates before generic version tags", () => {
    expect(tagCandidatesForPackageVersion("@scope/pkg", "1.2.3")).toEqual([
      "@scope/pkg@1.2.3",
      "pkg@1.2.3",
      "v1.2.3",
      "1.2.3"
    ])
  })

  test("deduplicates unscoped package tag candidates", () => {
    expect(tagCandidatesForPackageVersion("effect", "3.21.2")).toEqual([
      "effect@3.21.2",
      "v3.21.2",
      "3.21.2"
    ])
  })

  test("reads exact versions from package-lock.json", () => {
    const version = parsePackageLockVersion(
      JSON.stringify({
        packages: {
          "": { dependencies: { effect: "^3.0.0" } },
          "node_modules/effect": { version: "3.21.2" },
          "node_modules/@types/node": { version: "24.10.2" }
        }
      }),
      "effect"
    )

    expect(Option.getOrUndefined(version)).toBe("3.21.2")
  })

  test("reads exact versions from pnpm-lock.yaml importer entries", () => {
    const version = parsePnpmLockVersion(
      [
        "lockfileVersion: '9.0'",
        "importers:",
        "  .:",
        "    dependencies:",
        "      effect:",
        "        specifier: ^3.0.0",
        "        version: 3.21.2",
        "      '@types/node':",
        "        specifier: ^24.0.0",
        "        version: 24.10.2"
      ].join("\n"),
      "effect"
    )

    expect(Option.getOrUndefined(version)).toBe("3.21.2")
  })

  test("reads exact versions from yarn.lock entries", () => {
    const version = parseYarnLockVersion(
      [
        '"effect@^3.0.0":',
        '  version "3.21.2"',
        '  resolved "https://registry.yarnpkg.com/effect/-/effect-3.21.2.tgz"'
      ].join("\n"),
      "effect"
    )

    expect(Option.getOrUndefined(version)).toBe("3.21.2")
  })

  test("reads exact versions from bun.lock package tuples", () => {
    const version = parseBunLockVersion(
      JSON.stringify({
        lockfileVersion: 1,
        packages: {
          effect: ["effect@3.21.2", "", {}],
          "@types/node": ["@types/node@24.10.2", "", {}]
        }
      }),
      "@types/node"
    )

    expect(Option.getOrUndefined(version)).toBe("24.10.2")
  })

  test("detects the project package version from node_modules before lockfiles", async () => {
    await withTempWorkspace(async (cwd) => {
      mkdirSync(join(cwd, "node_modules/effect"), { recursive: true })
      writeFileSync(
        join(cwd, "package.json"),
        JSON.stringify({ dependencies: { effect: "^3.0.0" } })
      )
      writeFileSync(
        join(cwd, "package-lock.json"),
        JSON.stringify({
          packages: {
            "node_modules/effect": { version: "3.20.0" }
          }
        })
      )
      writeFileSync(
        join(cwd, "node_modules/effect/package.json"),
        JSON.stringify({ name: "effect", version: "3.21.2" })
      )

      const detected = await Effect.runPromise(
        detectProjectPackageVersion({
          cwd,
          dependency: {
            ecosystem: "npm",
            manifestPath: "package.json",
            name: "effect",
            section: "dependencies",
            spec: "^3.0.0"
          }
        }).pipe(Effect.provide(NodeServices.layer))
      )

      expect(detected.source).toBe("node_modules")
      expect(Option.getOrUndefined(detected.version)).toBe("3.21.2")
      expect(detected.packageSpec).toBe("^3.0.0")
    })
  })

  test("reads a vendored package version from the matching package manifest", async () => {
    await withTempWorkspace(async (cwd) => {
      mkdirSync(join(cwd, "vendor/effect/packages/effect"), { recursive: true })
      writeFileSync(join(cwd, "vendor/effect/package.json"), JSON.stringify({ private: true }))
      writeFileSync(
        join(cwd, "vendor/effect/packages/effect/package.json"),
        JSON.stringify({ name: "effect", version: "3.21.2" })
      )

      const detected = await Effect.runPromise(
        detectVendoredPackageVersion({
          cwd,
          packageName: "effect",
          prefix: "vendor/effect"
        }).pipe(Effect.provide(NodeServices.layer))
      )

      expect(Option.getOrUndefined(detected)).toEqual({
        manifestPath: "vendor/effect/packages/effect/package.json",
        version: "3.21.2"
      })
    })
  })
})
