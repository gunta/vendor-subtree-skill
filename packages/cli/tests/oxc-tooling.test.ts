import { describe, expect, test } from "bun:test"
import { join } from "node:path"

const workspaceRoot = process.cwd()
const packagePaths = [
  "package.json",
  "packages/cli/package.json",
  "packages/skill/package.json",
  "packages/tui/package.json",
  "packages/website/package.json"
] as const

const expectedLintScripts = (path: (typeof packagePaths)[number]) => {
  if (path === "package.json") {
    return {
      lint: "oxlint . --disable-nested-config",
      "lint:fix": "oxlint . --fix --disable-nested-config"
    }
  }
  if (path === "packages/skill/package.json") {
    return {
      lint: "oxlint . --no-error-on-unmatched-pattern",
      "lint:fix": "oxlint . --fix --no-error-on-unmatched-pattern"
    }
  }
  return {
    lint: "oxlint .",
    "lint:fix": "oxlint . --fix"
  }
}

const readJson = async <T>(path: string): Promise<T> =>
  JSON.parse(await Bun.file(join(workspaceRoot, path)).text()) as T

type PackageJson = {
  readonly devDependencies?: Record<string, string>
  readonly scripts?: Record<string, string>
}

describe("Oxc workspace tooling", () => {
  test("keeps root lint and format scripts wired to Oxc", async () => {
    const rootPackage = await readJson<PackageJson>("package.json")

    expect(rootPackage.devDependencies).toMatchObject({
      oxlint: expect.any(String),
      oxfmt: expect.any(String)
    })
    expect(rootPackage.scripts).toMatchObject({
      ...expectedLintScripts("package.json"),
      format: "oxfmt . --write",
      "format:check": "oxfmt . --check"
    })
    expect(rootPackage.scripts?.check).toContain("check:root")
    expect(rootPackage.scripts?.["check:root"]).toContain("bun run lint")
    expect(rootPackage.scripts?.["check:root"]).toContain("bun run format:check")
  })

  test("exposes Oxc lint and format scripts from every package", async () => {
    const packageScripts = await Promise.all(
      packagePaths.map(
        async (path) => [path, (await readJson<PackageJson>(path)).scripts ?? {}] as const
      )
    )

    for (const [path, scripts] of packageScripts) {
      expect(scripts, path).toMatchObject({
        ...expectedLintScripts(path),
        format: "oxfmt . --write",
        "format:check": "oxfmt . --check"
      })
    }
  })

  test("commits shared Oxc configs that ignore generated, vendored, and local state code", async () => {
    const [oxlintConfig, oxfmtConfig] = await Promise.all([
      readJson<Record<string, unknown>>(".oxlintrc.json"),
      readJson<Record<string, unknown>>(".oxfmtrc.json")
    ])

    expect(oxlintConfig.$schema).toBe("./node_modules/oxlint/configuration_schema.json")
    expect(oxfmtConfig.$schema).toBe("./node_modules/oxfmt/configuration_schema.json")

    for (const config of [oxlintConfig, oxfmtConfig]) {
      expect(config.ignorePatterns).toEqual(
        expect.arrayContaining([
          "vendor/**",
          "node_modules/**",
          "dist/**",
          "packages/*/dist/**",
          ".ingraft/**"
        ])
      )
    }
  })
})
