import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join, resolve } from "node:path"

type JsonObject = Record<string, unknown>

type PackageJson = JsonObject & {
  scripts?: Record<string, string>
  version?: string
}

type PackageLockJson = JsonObject & {
  packages?: Record<string, JsonObject>
  version?: string
}

type BumpKind = "major" | "minor" | "patch" | "prerelease"

type Options = {
  readonly bump?: BumpKind
  readonly date?: string
  readonly output?: string
  readonly skipPack: boolean
  readonly version?: string
}

const root = resolve(import.meta.dir, "..")

const paths = {
  changelog: join(root, "CHANGELOG.md"),
  cliPackage: join(root, "packages/cli/package.json"),
  cliPackageLock: join(root, "packages/cli/package-lock.json"),
  formula: join(root, "Formula/ingraft.rb"),
  prepareWorkflow: join(root, ".github/workflows/prepare-release.yml"),
  releaseWorkflow: join(root, ".github/workflows/release-packages.yml"),
  rootPackage: join(root, "package.json"),
  skillPackage: join(root, "packages/skill/package.json")
} as const

const usage = `Usage:
  bun scripts/release.ts check
  bun scripts/release.ts next [--version <version>] [--bump patch|minor|major|prerelease]
  bun scripts/release.ts notes [--version <version>] [--output <path>]
  bun scripts/release.ts prepare [--version <version>] [--bump patch|minor|major|prerelease] [--date YYYY-MM-DD] [--skip-pack]
`

const parseArgs = (
  args: readonly string[]
): { readonly command: string; readonly options: Options } => {
  const [command = "check", ...rest] = args
  const options: {
    bump?: BumpKind
    date?: string
    output?: string
    skipPack: boolean
    version?: string
  } = { skipPack: false }

  for (let index = 0; index < rest.length; index++) {
    const arg = rest[index]
    switch (arg) {
      case "--bump": {
        options.bump = parseBumpKind(requireValue(rest, ++index, arg))
        break
      }
      case "--date": {
        options.date = requireValue(rest, ++index, arg)
        break
      }
      case "--output": {
        options.output = requireValue(rest, ++index, arg)
        break
      }
      case "--skip-pack": {
        options.skipPack = true
        break
      }
      case "--version": {
        options.version = requireValue(rest, ++index, arg)
        break
      }
      case "-h":
      case "--help": {
        console.log(usage)
        process.exit(0)
      }
      default:
        throw new Error(`Unknown release option: ${arg}`)
    }
  }

  return { command, options }
}

const parseBumpKind = (value: string): BumpKind => {
  if (value === "major" || value === "minor" || value === "patch" || value === "prerelease") {
    return value
  }
  throw new Error(`Unknown release bump: ${value}`)
}

const requireValue = (args: readonly string[], index: number, flag: string): string => {
  const value = args[index]
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`)
  }
  return value
}

const readText = async (path: string): Promise<string> => await Bun.file(path).text()

const writeText = async (path: string, text: string): Promise<void> => {
  await Bun.write(path, text.endsWith("\n") ? text : `${text}\n`)
}

const readJson = async <T extends JsonObject>(path: string): Promise<T> =>
  JSON.parse(await readText(path)) as T

const writeJson = async (path: string, value: JsonObject): Promise<void> => {
  await writeText(path, JSON.stringify(value, null, 2))
}

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message)
}

const assertSemver = (version: string): void => {
  assert(
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version),
    `Expected a semver version, received: ${version}`
  )
}

const currentVersion = async (): Promise<string> => {
  const packageJson = await readJson<PackageJson>(paths.rootPackage)
  assert(typeof packageJson.version === "string", "Root package.json is missing version")
  return packageJson.version
}

const parseSemver = (
  version: string
): {
  readonly major: number
  readonly minor: number
  readonly patch: number
  readonly prerelease?: string
} => {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/)
  assert(match, `Expected a semver version, received: ${version}`)
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]
  }
}

const bumpPrerelease = (prerelease: string | undefined): string => {
  if (!prerelease) return "rc.0"

  const parts = prerelease.split(".")
  const last = parts.at(-1)
  if (last !== undefined && /^\d+$/.test(last)) {
    parts[parts.length - 1] = String(Number(last) + 1)
    return parts.join(".")
  }

  return `${prerelease}.1`
}

const incrementVersion = (version: string, bump: BumpKind): string => {
  const parsed = parseSemver(version)

  switch (bump) {
    case "major":
      return `${parsed.major + 1}.0.0`
    case "minor":
      return `${parsed.major}.${parsed.minor + 1}.0`
    case "patch":
      return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`
    case "prerelease":
      if (parsed.prerelease) {
        return `${parsed.major}.${parsed.minor}.${parsed.patch}-${bumpPrerelease(parsed.prerelease)}`
      }
      return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}-${bumpPrerelease(undefined)}`
  }
}

const explicitVersion = (options: Options): string | undefined => {
  const version = options.version?.trim()
  return version === "" ? undefined : version
}

const resolveReleaseVersion = async (options: Options): Promise<string> => {
  const version = explicitVersion(options)
  if (version) {
    assertSemver(version)
    return version
  }

  return incrementVersion(await currentVersion(), options.bump ?? "patch")
}

const run = (command: readonly string[], cwd = root): string => {
  const result = Bun.spawnSync(command, {
    cwd,
    env: process.env,
    stderr: "pipe",
    stdout: "pipe"
  })
  const stdout = result.stdout.toString()
  const stderr = result.stderr.toString()
  if (result.exitCode !== 0) {
    throw new Error(
      [`Command failed: ${command.join(" ")}`, stdout.trim(), stderr.trim()]
        .filter(Boolean)
        .join("\n")
    )
  }
  return stdout.trim()
}

const updatePackageVersion = async (path: string, version: string): Promise<void> => {
  const packageJson = await readJson<PackageJson>(path)
  packageJson.version = version
  await writeJson(path, packageJson)
}

const updatePackageLockVersion = async (version: string): Promise<void> => {
  const lock = await readJson<PackageLockJson>(paths.cliPackageLock)
  lock.version = version
  lock.packages ??= {}
  lock.packages[""] ??= {}
  lock.packages[""].version = version
  await writeJson(paths.cliPackageLock, lock)
}

const sha256File = async (path: string): Promise<string> => {
  const bytes = await Bun.file(path).arrayBuffer()
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex")
}

const packCliTarball = async (): Promise<string> => {
  run(["bun", "run", "--cwd", "packages/cli", "build"])
  const temp = await mkdtemp(join(tmpdir(), "ingraft-release-"))
  try {
    const packJson = run(
      ["npm", "pack", "--json", "--pack-destination", temp],
      join(root, "packages/cli")
    )
    const [packed] = JSON.parse(packJson) as Array<{ filename: string }>
    assert(packed?.filename, "npm pack did not report a tarball filename")
    const tarball = join(temp, basename(packed.filename))
    return await sha256File(tarball)
  } finally {
    await rm(temp, { force: true, recursive: true })
  }
}

const updateFormula = async (version: string, sha256?: string): Promise<void> => {
  let formula = await readText(paths.formula)
  formula = formula.replace(
    /url "https:\/\/registry\.npmjs\.org\/ingraft\/-\/ingraft-[^"]+\.tgz"/,
    `url "https://registry.npmjs.org/ingraft/-/ingraft-${version}.tgz"`
  )
  if (sha256 !== undefined) {
    formula = formula.replace(/sha256 "[a-f0-9]{64}"/, `sha256 "${sha256}"`)
  }
  await writeText(paths.formula, formula)
}

const latestGitTag = (): string | undefined => {
  try {
    return run(["git", "describe", "--tags", "--abbrev=0"])
  } catch {
    return undefined
  }
}

const gitCommitSubjects = (tag?: string): readonly string[] => {
  const range = tag ? `${tag}..HEAD` : "HEAD"
  const output = run(["git", "log", "--pretty=format:%s", range])
  return output === "" ? [] : output.split("\n")
}

const cleanSubject = (subject: string): string =>
  subject.replace(/^[a-z]+(?:\([^)]+\))?!?:\s*/i, "").replace(/^./, (first) => first.toUpperCase())

const changelogBuckets = (
  subjects: readonly string[]
): Record<"Added" | "Changed" | "Fixed", string[]> => {
  const buckets: Record<"Added" | "Changed" | "Fixed", string[]> = {
    Added: [],
    Changed: [],
    Fixed: []
  }

  for (const subject of subjects) {
    if (/^feat(?:\([^)]+\))?!?:/i.test(subject)) {
      buckets.Added.push(cleanSubject(subject))
    } else if (/^fix(?:\([^)]+\))?!?:/i.test(subject)) {
      buckets.Fixed.push(cleanSubject(subject))
    } else if (/^(build|chore|ci|docs|perf|refactor|test)(?:\([^)]+\))?!?:/i.test(subject)) {
      buckets.Changed.push(cleanSubject(subject))
    }
  }

  if (buckets.Added.length === 0 && buckets.Changed.length === 0 && buckets.Fixed.length === 0) {
    buckets.Changed.push("Release maintenance and packaging updates.")
  }

  return buckets
}

const renderChangelogSection = (
  version: string,
  date: string,
  subjects: readonly string[]
): string => {
  const buckets = changelogBuckets(subjects)
  const sections = Object.entries(buckets)
    .filter(([, entries]) => entries.length > 0)
    .map(([title, entries]) => `### ${title}\n\n${entries.map((entry) => `- ${entry}`).join("\n")}`)
    .join("\n\n")

  return `## ${version} - ${date}\n\n${sections}`
}

const updateChangelog = async (version: string, date: string): Promise<void> => {
  const existing = existsSync(paths.changelog) ? await readText(paths.changelog) : ""
  const tag = latestGitTag()
  const section = renderChangelogSection(version, date, gitCommitSubjects(tag))
  const header =
    "# Changelog\n\nAll notable changes to ingraft are recorded here.\n\n## Unreleased\n\n"

  if (existing.includes(`## ${version}`)) {
    const updated = existing.replace(
      new RegExp(`## ${escapeRegExp(version)}(?: - [^\\n]+)?\\n[\\s\\S]*?(?=\\n## |$)`),
      section
    )
    await writeText(paths.changelog, updated)
    return
  }

  if (existing.trim() === "") {
    await writeText(paths.changelog, `${header}${section}\n`)
    return
  }

  if (existing.includes("## Unreleased")) {
    await writeText(
      paths.changelog,
      existing.replace(/## Unreleased\n\n/, `## Unreleased\n\n${section}\n\n`)
    )
    return
  }

  await writeText(paths.changelog, `${header}${section}\n\n${existing.trim()}\n`)
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const extractReleaseNotes = async (version: string): Promise<string> => {
  const changelog = await readText(paths.changelog)
  const match = changelog.match(
    new RegExp(`## ${escapeRegExp(version)}(?: - [^\\n]+)?\\n([\\s\\S]*?)(?=\\n## |$)`)
  )
  assert(match?.[1], `CHANGELOG.md does not contain notes for ${version}`)
  return match[1].trim()
}

const checkRelease = async (): Promise<void> => {
  const rootPackage = await readJson<PackageJson>(paths.rootPackage)
  const cliPackage = await readJson<PackageJson>(paths.cliPackage)
  const skillPackage = await readJson<PackageJson>(paths.skillPackage)
  const lock = await readJson<PackageLockJson>(paths.cliPackageLock)
  const version = rootPackage.version

  assert(typeof version === "string", "Root package.json is missing version")
  assertSemver(version)
  assert(cliPackage.version === version, "packages/cli/package.json version does not match root")
  assert(
    skillPackage.version === version,
    "packages/skill/package.json version does not match root"
  )
  assert(lock.version === version, "packages/cli/package-lock.json version does not match root")
  assert(
    lock.packages?.[""]?.version === version,
    "packages/cli/package-lock.json root package version is stale"
  )
  assert(
    rootPackage.scripts?.["release:prepare"] === "bun scripts/release.ts prepare",
    "Missing release:prepare script"
  )
  assert(
    rootPackage.scripts?.["release:check"] === "bun scripts/release.ts check",
    "Missing release:check script"
  )
  assert(
    rootPackage.scripts?.["release:next"] === "bun scripts/release.ts next",
    "Missing release:next script"
  )
  assert(
    rootPackage.scripts?.["release:notes"] === "bun scripts/release.ts notes",
    "Missing release:notes script"
  )

  const formula = await readText(paths.formula)
  assert(formula.includes(`ingraft-${version}.tgz`), "Formula/ingraft.rb tarball URL is stale")
  assert(/sha256 "[a-f0-9]{64}"/.test(formula), "Formula/ingraft.rb is missing a sha256")

  const changelog = await readText(paths.changelog)
  assert(changelog.includes("## Unreleased"), "CHANGELOG.md is missing an Unreleased section")
  assert(changelog.includes(`## ${version}`), `CHANGELOG.md is missing ${version}`)

  const releaseWorkflow = await readText(paths.releaseWorkflow)
  assert(
    releaseWorkflow.includes("bun run release:check"),
    "release-packages.yml must run release:check"
  )
  assert(
    releaseWorkflow.includes("npm publish --access public --provenance"),
    "npm publish must include provenance"
  )
  assert(
    !releaseWorkflow.includes("NPM_TOKEN"),
    "release workflow should use trusted publishing, not NPM_TOKEN"
  )
  assert(
    !releaseWorkflow.includes("NODE_AUTH_TOKEN"),
    "release workflow should use trusted publishing, not NODE_AUTH_TOKEN"
  )

  const prepareWorkflow = await readText(paths.prepareWorkflow)
  assert(
    prepareWorkflow.includes("bun run release:prepare"),
    "prepare-release.yml must run release:prepare"
  )
}

const prepareRelease = async (options: Options): Promise<void> => {
  const version = await resolveReleaseVersion(options)

  await updatePackageVersion(paths.rootPackage, version)
  await updatePackageVersion(paths.cliPackage, version)
  await updatePackageVersion(paths.skillPackage, version)
  await updatePackageLockVersion(version)

  const sha256 = options.skipPack ? undefined : await packCliTarball()
  await updateFormula(version, sha256)
  await updateChangelog(version, options.date ?? new Date().toISOString().slice(0, 10))
  await checkRelease()
  console.log(`Prepared ingraft ${version}`)
}

const writeNotes = async (options: Options): Promise<void> => {
  const version = options.version ?? (await currentVersion())
  const notes = await extractReleaseNotes(version)
  if (options.output) {
    await writeText(resolve(root, options.output), `${notes}\n`)
  } else {
    console.log(notes)
  }
}

const main = async (): Promise<void> => {
  const { command, options } = parseArgs(Bun.argv.slice(2))

  switch (command) {
    case "check":
      await checkRelease()
      console.log("Release metadata is consistent.")
      break
    case "next":
      console.log(await resolveReleaseVersion(options))
      break
    case "notes":
      await writeNotes(options)
      break
    case "prepare":
      await prepareRelease(options)
      break
    default:
      throw new Error(`Unknown release command: ${command}\n${usage}`)
  }
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
