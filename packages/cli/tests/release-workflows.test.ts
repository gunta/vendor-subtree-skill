import { describe, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { parse } from "yaml"

const workspaceRoot = process.cwd()

type WorkflowStep = {
  readonly if?: string
  readonly id?: string
  readonly name?: string
  readonly run?: string
  readonly uses?: string
  readonly with?: Record<string, unknown>
  readonly "working-directory"?: string
}

type WorkflowJob = {
  readonly environment?: string | { readonly name?: string; readonly url?: string }
  readonly needs?: string | readonly string[]
  readonly permissions?: Record<string, string>
  readonly steps?: readonly WorkflowStep[]
}

type Workflow = {
  readonly name?: string
  readonly on?: Record<string, unknown>
  readonly permissions?: Record<string, string>
  readonly jobs?: Record<string, WorkflowJob>
}

type PackageJson = {
  readonly bugs?: {
    readonly url?: string
  }
  readonly dependencies?: Record<string, string>
  readonly devDependencies?: Record<string, string>
  readonly homepage?: string
  readonly private?: boolean
  readonly publishConfig?: {
    readonly access?: string
  }
  readonly repository?: {
    readonly directory?: string
    readonly type?: string
    readonly url?: string
  }
  readonly scripts?: Record<string, string>
  readonly version?: string
}

type PackageLockJson = {
  readonly name: string
  readonly packages: Record<string, unknown>
  readonly version: string
}

const readWorkflow = async (path: string): Promise<Workflow> =>
  parse(await Bun.file(join(workspaceRoot, path)).text()) as Workflow

const readJson = async <T>(path: string): Promise<T> =>
  JSON.parse(await Bun.file(join(workspaceRoot, path)).text()) as T

const expectStep = (
  steps: readonly WorkflowStep[] | undefined,
  matcher: Partial<WorkflowStep>
): void => {
  expect(steps).toEqual(expect.arrayContaining([expect.objectContaining(matcher)]))
}

const workflowText = async (path: string): Promise<string> =>
  await Bun.file(join(workspaceRoot, path)).text()

const spawn = (
  cmd: readonly string[],
  cwd: string
): {
  readonly exitCode: number
  readonly stderr: string
  readonly stdout: string
} => {
  const result = Bun.spawnSync({
    cmd: [...cmd],
    cwd,
    stderr: "pipe",
    stdout: "pipe"
  })
  return {
    exitCode: result.exitCode,
    stderr: result.stderr.toString(),
    stdout: result.stdout.toString()
  }
}

const writeJson = async (path: string, value: unknown): Promise<void> => {
  await Bun.write(path, `${JSON.stringify(value, null, 2)}\n`)
}

const createReleaseFixture = async (version: string): Promise<string> => {
  const fixture = await mkdtemp(join(tmpdir(), "ingraft-release-fixture-"))
  await Promise.all([
    mkdir(join(fixture, ".github/workflows"), { recursive: true }),
    mkdir(join(fixture, "Formula"), { recursive: true }),
    mkdir(join(fixture, "packages/cli"), { recursive: true }),
    mkdir(join(fixture, "packages/cli/src/domain"), { recursive: true }),
    mkdir(join(fixture, "packages/ingraft"), { recursive: true }),
    mkdir(join(fixture, "packages/skill"), { recursive: true }),
    mkdir(join(fixture, "scripts"), { recursive: true })
  ])

  await Bun.write(join(fixture, "scripts/release.ts"), await workflowText("scripts/release.ts"))
  await writeJson(join(fixture, "package.json"), {
    name: "ingraft-workspace",
    scripts: {
      "release:check": "bun scripts/release.ts check",
      "release:next": "bun scripts/release.ts next",
      "release:notes": "bun scripts/release.ts notes",
      "release:prepare": "bun scripts/release.ts prepare"
    },
    version
  })
  await writeJson(join(fixture, "packages/cli/package.json"), {
    name: "@ingraft/cli",
    version
  })
  await Bun.write(
    join(fixture, "packages/cli/src/domain/constants.ts"),
    `export const VERSION = "${version}"\n`
  )
  await writeJson(join(fixture, "packages/ingraft/package.json"), {
    dependencies: {
      "@ingraft/cli": version
    },
    name: "ingraft",
    version
  })
  await writeJson(join(fixture, "packages/skill/package.json"), {
    name: "@ingraft/skill",
    version
  })
  await writeJson(join(fixture, "packages/cli/package-lock.json"), {
    name: "@ingraft/cli",
    packages: {
      "": {
        name: "@ingraft/cli",
        version
      }
    },
    version
  })
  await Bun.write(
    join(fixture, "Formula/ingraft.rb"),
    `class Ingraft < Formula\n  url "https://registry.npmjs.org/@ingraft/cli/-/cli-${version}.tgz"\n  sha256 "${"a".repeat(64)}"\nend\n`
  )
  await Bun.write(
    join(fixture, ".github/workflows/release-packages.yml"),
    [
      "run: bun run release:check",
      'run: npm view "@ingraft/cli@$version" version',
      'run: npm view "ingraft@$version" version',
      'run: npm view "@ingraft/skill@$version" version',
      "run: npm publish --access public --provenance",
      ""
    ].join("\n")
  )
  await Bun.write(
    join(fixture, ".github/workflows/prepare-release.yml"),
    "run: bun run release:prepare\n"
  )
  await Bun.write(
    join(fixture, "CHANGELOG.md"),
    `# Changelog\n\nAll notable changes to ingraft are recorded here.\n\n## Unreleased\n\n## ${version} - 2026-05-19\n\n### Changed\n\n- Existing release.\n`
  )

  expect(spawn(["git", "init"], fixture).exitCode).toBe(0)
  expect(spawn(["git", "config", "user.email", "release@example.com"], fixture).exitCode).toBe(0)
  expect(spawn(["git", "config", "user.name", "Release Fixture"], fixture).exitCode).toBe(0)
  expect(spawn(["git", "add", "."], fixture).exitCode).toBe(0)
  expect(spawn(["git", "commit", "-m", "feat: fixture release automation"], fixture).exitCode).toBe(
    0
  )

  return fixture
}

describe("release automation workflows", () => {
  test("marks published packages for public npm release", async () => {
    const packages = await Promise.all(
      [
        "packages/cli/package.json",
        "packages/ingraft/package.json",
        "packages/skill/package.json"
      ].map(async (path) => [path, await readJson<PackageJson>(path)] as const)
    )

    for (const [path, packageJson] of packages) {
      expect(packageJson.private, path).not.toBe(true)
      expect(packageJson.publishConfig, path).toMatchObject({ access: "public" })
    }

    const tuiPackage = await readJson<PackageJson>("packages/tui/package.json")
    expect(tuiPackage.private).toBe(true)
    expect(tuiPackage.publishConfig).toBeUndefined()
  })

  test("runs CI checks on pushes and pull requests", async () => {
    const workflow = await readWorkflow(".github/workflows/ci.yml")
    const check = workflow.jobs?.check

    expect(workflow.name).toBe("CI")
    expect(workflow.on).toMatchObject({
      pull_request: {},
      push: { branches: ["main"] }
    })
    expect(workflow.permissions).toEqual({ contents: "read" })
    expect(check).toMatchObject({
      permissions: { contents: "read" }
    })
    expectStep(check?.steps, { uses: "actions/checkout@v6" })
    expectStep(check?.steps, {
      uses: "oven-sh/setup-bun@v2",
      with: { "bun-version": "1.3.14" }
    })
    expectStep(check?.steps, { run: "bun install --frozen-lockfile" })
    expectStep(check?.steps, { run: "bun run check" })
    expectStep(check?.steps, { run: "bun run build" })
  })

  test("publishes npm install packages through GitHub OIDC", async () => {
    const path = ".github/workflows/release-packages.yml"
    const workflow = await readWorkflow(path)
    const publish = workflow.jobs?.publish
    const text = await workflowText(path)

    expect(workflow.name).toBe("Release packages")
    expect(workflow.on).toMatchObject({
      release: { types: ["published"] },
      workflow_dispatch: {}
    })
    expect(workflow.permissions).toEqual({
      contents: "read",
      "id-token": "write"
    })
    expect(publish?.environment).toBe("npm")
    expectStep(publish?.steps, { uses: "actions/setup-node@v6" })
    expectStep(publish?.steps, { run: "bun install --frozen-lockfile" })
    expectStep(publish?.steps, { run: "bun run release:check" })
    expectStep(publish?.steps, { run: "bun run check" })
    expectStep(publish?.steps, { run: "bun run build" })
    expectStep(publish?.steps, { run: "bun run release:notes -- --output release-notes.md" })
    expectStep(publish?.steps, { id: "release", name: "Resolve release version" })
    expectStep(publish?.steps, { id: "npm_status", name: "Check published npm packages" })

    expectStep(publish?.steps, {
      if: "steps.npm_status.outputs.cli != 'published'",
      "working-directory": "packages/cli",
      run: "npm publish --access public --provenance"
    })
    expectStep(publish?.steps, {
      if: "steps.npm_status.outputs.ingraft != 'published'",
      "working-directory": "packages/ingraft",
      run: "npm publish --access public --provenance"
    })
    expectStep(publish?.steps, {
      if: "steps.npm_status.outputs.skill != 'published'",
      "working-directory": "packages/skill",
      run: "npm publish --access public --provenance"
    })

    expect(text).not.toContain("packages/tui")
    expect(text).not.toContain("ingraft-tui")
    expect(text).toContain('npm view "@ingraft/cli@$version"')
    expect(text).toContain('npm view "ingraft@$version"')
    expect(text).toContain('npm view "@ingraft/skill@$version"')

    expect(text).not.toContain("NPM_TOKEN")
    expect(text).not.toContain("NODE_AUTH_TOKEN")
  })

  test("prepares release branches with one audited automation script", async () => {
    const workflow = await readWorkflow(".github/workflows/prepare-release.yml")
    const prepare = workflow.jobs?.prepare
    const rootPackage = await readJson<PackageJson>("package.json")
    const releaseScript = await workflowText("scripts/release.ts")

    expect(workflow.name).toBe("Prepare release")
    expect(workflow.on).toMatchObject({
      workflow_dispatch: {
        inputs: {
          bump: expect.objectContaining({ default: "patch", type: "choice" }),
          version: expect.objectContaining({ required: false }),
          prerelease: expect.objectContaining({ type: "boolean" })
        }
      }
    })
    expect(workflow.permissions).toEqual({
      contents: "write",
      "pull-requests": "write"
    })
    expect(prepare?.permissions).toEqual({
      contents: "write",
      "pull-requests": "write"
    })
    expectStep(prepare?.steps, { uses: "actions/checkout@v6" })
    expectStep(prepare?.steps, { name: "Resolve release version" })
    expectStep(prepare?.steps, { name: "Prepare release files" })
    expectStep(prepare?.steps, { run: "bun run release:check" })
    expectStep(prepare?.steps, { run: "bun run release:notes -- --output release-notes.md" })
    expectStep(prepare?.steps, {
      run: "gh pr create --fill --base main --head release/v${{ steps.release.outputs.version }}"
    })

    expect(rootPackage.scripts).toMatchObject({
      "release:check": "bun scripts/release.ts check",
      "release:next": "bun scripts/release.ts next",
      "release:notes": "bun scripts/release.ts notes",
      "release:prepare": "bun scripts/release.ts prepare"
    })
    expect(releaseScript).toContain("prepare")
    expect(releaseScript).toContain("check")
    expect(releaseScript).toContain("next")
    expect(releaseScript).toContain("notes")
    expect(releaseScript).toContain("--bump")
    expect(releaseScript).toContain("CHANGELOG.md")
    expect(releaseScript).toContain("Formula/ingraft.rb")
    expect(releaseScript).toContain("packages/cli/package-lock.json")
    expect(releaseScript).toContain("packages/ingraft/package.json")
  })

  test("keeps changelog and release metadata anchored to the current version", async () => {
    const rootPackage = await readJson<PackageJson>("package.json")
    const aliasPackage = await readJson<PackageJson>("packages/ingraft/package.json")
    const cliPackage = await readJson<PackageJson>("packages/cli/package.json")
    const skillPackage = await readJson<PackageJson>("packages/skill/package.json")
    const changelog = await workflowText("CHANGELOG.md")
    const releaseDocs = await workflowText("RELEASE.md")

    expect(cliPackage.version).toBe(rootPackage.version)
    expect(aliasPackage.version).toBe(rootPackage.version)
    expect(skillPackage.version).toBe(rootPackage.version)
    expect(changelog).toContain("# Changelog")
    expect(changelog).toContain("## Unreleased")
    expect(changelog).toContain(`## ${rootPackage.version}`)
    expect(changelog).toContain("### Added")
    expect(changelog).toContain("### Changed")
    expect(releaseDocs).toContain("bun run release:prepare")
    expect(releaseDocs).toContain("bun run release:prepare -- --version")
    expect(releaseDocs).toContain("bun run release:prepare -- --bump minor")
    expect(releaseDocs).toContain("bun run release:check")
    expect(releaseDocs).toContain("GitHub release")
  })

  test("prepares the next patch version by default", async () => {
    const fixture = await createReleaseFixture("1.2.3")

    try {
      const result = spawn(
        ["bun", "scripts/release.ts", "prepare", "--skip-pack", "--date", "2026-05-20"],
        fixture
      )
      expect(result.exitCode, result.stderr).toBe(0)

      const rootPackage = JSON.parse(await Bun.file(join(fixture, "package.json")).text())
      const cliPackage = JSON.parse(
        await Bun.file(join(fixture, "packages/cli/package.json")).text()
      )
      const aliasPackage = JSON.parse(
        await Bun.file(join(fixture, "packages/ingraft/package.json")).text()
      )
      const lock = JSON.parse(
        await Bun.file(join(fixture, "packages/cli/package-lock.json")).text()
      )
      const formula = await Bun.file(join(fixture, "Formula/ingraft.rb")).text()
      const changelog = await Bun.file(join(fixture, "CHANGELOG.md")).text()
      const constants = await Bun.file(join(fixture, "packages/cli/src/domain/constants.ts")).text()

      expect(rootPackage.version).toBe("1.2.4")
      expect(cliPackage.version).toBe("1.2.4")
      expect(constants).toContain('export const VERSION = "1.2.4"')
      expect(aliasPackage.version).toBe("1.2.4")
      expect(aliasPackage.dependencies["@ingraft/cli"]).toBe("1.2.4")
      expect(lock.version).toBe("1.2.4")
      expect(lock.packages[""].version).toBe("1.2.4")
      expect(formula).toContain("cli-1.2.4.tgz")
      expect(changelog).toContain("## 1.2.4 - 2026-05-20")
      expect(result.stdout).toContain("Prepared ingraft 1.2.4")
    } finally {
      await rm(fixture, { force: true, recursive: true })
    }
  })

  test("allows explicit versions to override automatic bumping", async () => {
    const fixture = await createReleaseFixture("1.2.3")

    try {
      const result = spawn(
        [
          "bun",
          "scripts/release.ts",
          "prepare",
          "--version",
          "2.0.0",
          "--bump",
          "minor",
          "--skip-pack",
          "--date",
          "2026-05-20"
        ],
        fixture
      )
      expect(result.exitCode, result.stderr).toBe(0)

      const rootPackage = JSON.parse(await Bun.file(join(fixture, "package.json")).text())
      const formula = await Bun.file(join(fixture, "Formula/ingraft.rb")).text()
      const constants = await Bun.file(join(fixture, "packages/cli/src/domain/constants.ts")).text()
      expect(rootPackage.version).toBe("2.0.0")
      expect(constants).toContain('export const VERSION = "2.0.0"')
      expect(formula).toContain("cli-2.0.0.tgz")
    } finally {
      await rm(fixture, { force: true, recursive: true })
    }
  })

  test("writes release notes to absolute output paths", async () => {
    const outputPath = join(tmpdir(), `ingraft-release-notes-${randomUUID()}.md`)
    const result = Bun.spawnSync({
      cmd: ["bun", "run", "release:notes", "--", "--output", outputPath],
      cwd: workspaceRoot,
      stderr: "pipe",
      stdout: "pipe"
    })

    try {
      expect(result.exitCode).toBe(0)
      const notes = await Bun.file(outputPath).text()
      expect(notes).toContain("### Added")
      expect(notes).toContain("### Changed")
    } finally {
      await rm(outputPath, { force: true })
    }
  })

  test("keeps package metadata usable outside npm", async () => {
    const cliPackage = await readJson<PackageJson>("packages/cli/package.json")
    const aliasPackage = await readJson<PackageJson>("packages/ingraft/package.json")
    const skillPackage = await readJson<PackageJson>("packages/skill/package.json")
    const lock = await readJson<PackageLockJson>("packages/cli/package-lock.json")
    const lockText = await workflowText("packages/cli/package-lock.json")

    expect(cliPackage).toMatchObject({
      homepage: "https://ingraft.dev",
      bugs: { url: "https://github.com/gunta/ingraft/issues" },
      repository: {
        type: "git",
        url: "git+https://github.com/gunta/ingraft.git",
        directory: "packages/cli"
      }
    })
    expect(skillPackage.repository?.directory).toBe("packages/skill")
    expect(aliasPackage.repository?.directory).toBe("packages/ingraft")
    expect(cliPackage.devDependencies).toMatchObject({
      "@types/node": expect.any(String),
      typescript: expect.any(String)
    })
    expect(lock.name).toBe("@ingraft/cli")
    expect(lock.version).toBe(cliPackage.version!)
    expect(lock.packages[""]).toMatchObject({ name: "@ingraft/cli", version: cliPackage.version })
    expect(lockText).not.toContain(".bun")
    expect(lockText).not.toContain("private/var")
    expect(lockText).not.toContain("workspace:")
  })

  test("ships Homebrew and Nix package definitions", async () => {
    const rootPackage = await readJson<PackageJson>("package.json")
    const formula = await workflowText("Formula/ingraft.rb")
    const flake = await workflowText("flake.nix")
    const nixPackage = await workflowText("nix/package.nix")

    expect(formula).toContain("class Ingraft < Formula")
    expect(formula).toContain(
      `url "https://registry.npmjs.org/@ingraft/cli/-/cli-${rootPackage.version}.tgz"`
    )
    expect(formula).toMatch(/sha256 "[a-f0-9]{64}"/)
    expect(formula).toContain("preserve_rpath")
    expect(formula).toContain('depends_on "oven-sh/bun/bun"')
    expect(formula).toContain('depends_on "git"')
    expect(formula).toContain('depends_on "node"')
    expect(formula).toContain('system "npm", "install", *std_npm_args')
    expect(formula).toContain('bin.install_symlink libexec.glob("bin/*")')
    expect(formula).toContain("repository context router for coding agents")

    expect(flake).toContain('nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable"')
    expect(flake).toContain("overlays.default")
    expect(nixPackage).toContain("buildNpmPackage")
    expect(nixPackage).toContain("importNpmLock")
    expect(nixPackage).toContain("nodejs_24")
    expect(nixPackage).toContain("makeWrapperArgs")
  })

  test("documents skills.sh installation and badge", async () => {
    const rootReadme = await workflowText("README.md")
    const skillReadme = await workflowText("packages/skill/README.md")
    const rootSkill = await workflowText("SKILL.md")

    for (const text of [rootReadme, skillReadme]) {
      expect(text).toContain("[![skills.sh](https://skills.sh/b/gunta/ingraft)]")
      expect(text).toContain("https://skills.sh/gunta/ingraft")
    }

    for (const text of [rootReadme, skillReadme, rootSkill]) {
      expect(text).toContain("npx skills add gunta/ingraft")
    }
  })

  test("documents public install lanes across repo and website", async () => {
    const rootReadme = await workflowText("README.md")
    const cliReadme = await workflowText("packages/cli/README.md")
    const installDocs = await workflowText(
      "packages/website/src/content/docs/docs/installation.mdx"
    )
    const landing = await workflowText(
      "packages/website/src/components/landing/InstallSection.astro"
    )
    const installer = await workflowText("packages/website/public/install.sh")

    for (const text of [rootReadme, cliReadme, installDocs, landing]) {
      expect(text).toContain("bunx @ingraft/cli@latest")
      expect(text).toContain("npm install -g @ingraft/cli")
      expect(text).toContain("brew tap oven-sh/bun")
      expect(text).toContain("brew install ingraft")
      expect(text).toContain("nix run github:gunta/ingraft")
      expect(text).toContain("npx skills add gunta/ingraft")
    }

    for (const text of [rootReadme, cliReadme, installDocs]) {
      expect(text).toContain("npx ingraft@latest")
      expect(text).toContain("npm install -g ingraft")
    }

    expect(installDocs).toContain("pnpm dlx @ingraft/cli@latest")
    expect(installDocs).toContain("yarn dlx @ingraft/cli@latest")
    expect(installDocs).toContain("curl -fsSL https://ingraft.dev/install.sh | sh")
    expect(installer).toContain("INGRAFT_INSTALL_METHOD")
    expect(installer).toContain("INGRAFT_VERSION")
    expect(installer).toContain("@ingraft/cli@")
    expect(installer).toContain("bun add -g")
    expect(installer).toContain("npm install -g")
    expect(installer).toContain("pnpm add -g")
    expect(installer).toContain("yarn global add")
  })

  test("deploys the Astro site through the Cloudflare website workflow", async () => {
    const workflow = await readWorkflow(".github/workflows/deploy-website.yml")
    const deploy = workflow.jobs?.deploy

    expect(workflow.name).toBe("Deploy website")
    expect(workflow.on).toMatchObject({
      push: {
        branches: ["main"],
        paths: expect.arrayContaining([
          "packages/website/**",
          "package.json",
          "bun.lock",
          ".github/workflows/deploy-website.yml"
        ])
      },
      workflow_dispatch: {}
    })
    expect(deploy).toMatchObject({
      environment: "production"
    })
    expectStep(deploy?.steps, {
      uses: "oven-sh/setup-bun@v2",
      with: { "bun-version": "1.3.14" }
    })
    expectStep(deploy?.steps, { run: "bun install --frozen-lockfile" })
    expectStep(deploy?.steps, {
      "working-directory": "packages/website",
      run: "bun run deploy"
    })
  })
})
