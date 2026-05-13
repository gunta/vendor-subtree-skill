import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import type { CommandPlan } from "./dashboard.ts"
import type { VendorTuiRepo, VendorTuiSnapshot, VendorTuiTaskVersions } from "./status.ts"

interface CliInvocation {
  readonly args: ReadonlyArray<string>
  readonly command: string
}

export interface SnapshotResult {
  readonly message: string
  readonly snapshot: VendorTuiSnapshot
}

interface ListJsonRepo {
  readonly name?: unknown
  readonly packageNames?: unknown
  readonly prefix?: unknown
  readonly ref?: unknown
  readonly strategy?: unknown
  readonly url?: unknown
  readonly versions?: unknown
}

interface ListJsonOutput {
  readonly repos?: unknown
}

const localCli = resolve(dirname(fileURLToPath(import.meta.url)), "../../scripts/vendor.ts")

const cliInvocation = (args: ReadonlyArray<string>): CliInvocation =>
  existsSync(localCli)
    ? { args: [localCli, ...args], command: "bun" }
    : { args, command: "ingraft" }

const failedSnapshot = (message: string): VendorTuiSnapshot => ({
  candidates: [],
  repos: [],
  tasks: [
    {
      action: "add",
      existingName: null,
      packageNames: ["ingraft deps --json failed"],
      primaryPackageName: "ingraft",
      repositoryUrl: message,
      suggestedName: "CLI unavailable"
    }
  ]
})

const stringValue = (value: unknown): string => (typeof value === "string" ? value : "-")

const stringArray = (value: unknown): ReadonlyArray<string> =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []

const toTuiRepo = (repo: ListJsonRepo): VendorTuiRepo => {
  const base: VendorTuiRepo = {
    name: stringValue(repo.name),
    packageNames: stringArray(repo.packageNames),
    path: stringValue(repo.prefix),
    ref: stringValue(repo.ref),
    source: stringValue(repo.url),
    strategy: stringValue(repo.strategy)
  }
  if (repo.versions !== undefined) {
    return { ...base, versions: repo.versions as VendorTuiTaskVersions }
  }
  return base
}

export const readSnapshot = (): SnapshotResult => {
  const depsCommand = cliInvocation(["deps", "--json"])
  const depsResult = spawnSync(depsCommand.command, depsCommand.args, {
    encoding: "utf8"
  })
  if (depsResult.status !== 0) {
    const output = depsResult.stderr.trim() || depsResult.stdout.trim()
    return {
      message: output || "Dependency scan failed.",
      snapshot: failedSnapshot(output || "Dependency scan failed.")
    }
  }
  try {
    const snapshot = JSON.parse(depsResult.stdout) as VendorTuiSnapshot
    const listCommand = cliInvocation(["list", "--json"])
    const listResult = spawnSync(listCommand.command, listCommand.args, {
      encoding: "utf8"
    })
    if (listResult.status !== 0) {
      return {
        message: "Dependency snapshot refreshed; repository list failed.",
        snapshot: { ...snapshot, repos: [] }
      }
    }
    const list = JSON.parse(listResult.stdout) as ListJsonOutput
    const repos = Array.isArray(list.repos)
      ? list.repos.map((repo) => toTuiRepo(repo as ListJsonRepo))
      : []
    return {
      message: "Dependency and repository snapshots refreshed.",
      snapshot: { ...snapshot, repos }
    }
  } catch {
    return {
      message: "CLI returned invalid JSON.",
      snapshot: failedSnapshot("CLI returned invalid JSON.")
    }
  }
}

export const runCommandPlan = (plan: CommandPlan): string => {
  const command = cliInvocation(plan.args)
  const result = spawnSync(command.command, command.args, {
    encoding: "utf8"
  })
  const output = (result.stderr.trim() || result.stdout.trim()).split("\n").slice(-4)
  const suffix = output.length > 0 ? `: ${output.join(" | ")}` : ""
  return result.status === 0 ? `OK ${plan.label}${suffix}` : `FAIL ${plan.label}${suffix}`
}
