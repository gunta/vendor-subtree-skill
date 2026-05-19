#!/usr/bin/env node
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = resolve(scriptDir, "../..")
const artifactDir = resolve(process.argv[2] ?? ".artifacts")
const expectedVersion = JSON.parse(
  readFileSync(join(workspaceRoot, "package.json"), "utf8")
).version
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm"

const run = (command, args, options = {}) => {
  try {
    return execFileSync(command, args, {
      cwd: options.cwd,
      encoding: "utf8",
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"]
    })
  } catch (error) {
    const stdout = error.stdout?.toString() ?? ""
    const stderr = error.stderr?.toString() ?? ""
    const message = [
      `Command failed: ${command} ${args.join(" ")}`,
      stdout.trim() ? `stdout:\n${stdout}` : undefined,
      stderr.trim() ? `stderr:\n${stderr}` : undefined
    ]
      .filter(Boolean)
      .join("\n\n")
    throw new Error(message, { cause: error })
  }
}

const assertIncludes = (label, value, expected) => {
  if (!value.includes(expected)) {
    throw new Error(`${label} did not include ${JSON.stringify(expected)}:\n${value}`)
  }
}

const assertExists = (path) => {
  if (!existsSync(path)) {
    throw new Error(`Expected ${path} to exist.`)
  }
}

const tarballFiles = readdirSync(artifactDir)
  .filter((file) => file.endsWith(".tgz"))
  .sort()

const findTarball = (label, pattern) => {
  const file = tarballFiles.find((candidate) => pattern.test(candidate))
  if (!file) {
    throw new Error(
      `Could not find ${label} package in ${artifactDir}. Found: ${tarballFiles.join(", ")}`
    )
  }
  return join(artifactDir, file)
}

const cliTarball = findTarball("@ingraft/cli", /^ingraft-cli-.+\.tgz$/)
const aliasTarball = findTarball("ingraft", /^ingraft-(?!cli-|skill-).+\.tgz$/)
const skillTarball = findTarball("@ingraft/skill", /^ingraft-skill-.+\.tgz$/)

const binPath = (prefix) =>
  process.platform === "win32" ? join(prefix, "ingraft.cmd") : join(prefix, "bin", "ingraft")

const npmRoot = (prefix) =>
  run(npmCommand, ["root", "--global", "--prefix", prefix], {
    env: { ...process.env, CI: "1" }
  }).trim()

const smokeCliInstall = (label, tarballs) => {
  const prefix = mkdtempSync(join(tmpdir(), `ingraft-${label.replaceAll(/\W+/g, "-")}-`))
  const env = {
    ...process.env,
    CI: "1",
    NO_COLOR: "1",
    PATH: `${process.platform === "win32" ? prefix : join(prefix, "bin")}${delimiter}${
      process.env.PATH ?? ""
    }`
  }

  run(
    npmCommand,
    ["install", "--global", "--prefix", prefix, "--no-audit", "--no-fund", ...tarballs],
    {
      env
    }
  )
  assertExists(binPath(prefix))

  const help = run(binPath(prefix), ["--help"], { env })
  assertIncludes(`${label} --help`, help, "repository context router for coding agents")

  const version = run(binPath(prefix), ["--version"], { env }).trim()
  assertIncludes(`${label} --version`, version, expectedVersion)

  const listHelp = run(binPath(prefix), ["list", "--help"], { env })
  assertIncludes(`${label} list --help`, listHelp, "List durable source routes")

  console.log(`Smoke installed ${label} ${expectedVersion}`)
}

smokeCliInstall("@ingraft/cli", [cliTarball])
smokeCliInstall("ingraft compatibility package", [cliTarball, aliasTarball])

const skillPrefix = mkdtempSync(join(tmpdir(), "ingraft-skill-"))
run(
  npmCommand,
  ["install", "--global", "--prefix", skillPrefix, "--no-audit", "--no-fund", skillTarball],
  {
    env: { ...process.env, CI: "1" }
  }
)

const skillRoot = join(npmRoot(skillPrefix), "@ingraft", "skill")
const skillPackage = JSON.parse(readFileSync(join(skillRoot, "package.json"), "utf8"))
assertIncludes("@ingraft/skill package name", skillPackage.name, "@ingraft/skill")
assertIncludes("@ingraft/skill version", skillPackage.version, expectedVersion)
assertExists(join(skillRoot, "SKILL.md"))

console.log(`Smoke installed @ingraft/skill ${expectedVersion}`)
