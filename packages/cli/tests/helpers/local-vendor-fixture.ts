import { execSync } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Option } from "effect"

import type { AddCommandParams } from "../../src/commands/add.tsx"
import type { VendorStrategy } from "../../src/domain/vendor-strategy.ts"

export const initLocalRepo = (): string => {
  const cwd = mkdtempSync(join(tmpdir(), "ingraft-local-"))
  execSync("git init -q -b main", { cwd })
  execSync("git config user.email tests@example.com && git config user.name tests", { cwd })
  execSync("git commit --allow-empty -m init -q", { cwd })
  return cwd
}

export const initBareUpstream = (): string => {
  const base = mkdtempSync(join(tmpdir(), "ingraft-upstream-"))
  // Put the repo two levels deep so `file://` URL has 2+ path segments,
  // which lets hostedRepoFromInput classify it as a RepositoryTarget.
  const upstream = join(base, "test", "upstream-repo")
  execSync(`mkdir -p ${upstream}`)
  execSync("git init -q -b main", { cwd: upstream })
  execSync("git config user.email up@example.com && git config user.name up", { cwd: upstream })
  writeFileSync(join(upstream, "README.md"), "hello\n")
  execSync("git add README.md && git commit -m seed -q", { cwd: upstream })
  return `file://${upstream}`
}

export const advanceUpstream = (upstream: string, file: string, content: string): void => {
  // upstream may be a file:// URL; strip the prefix to get the FS path
  const cwd = upstream.startsWith("file://") ? upstream.slice("file://".length) : upstream
  writeFileSync(join(cwd, file), content)
  execSync(`git add ${file} && git commit -m bump -q`, { cwd })
}

export const defaultAddParams = (overrides: Partial<AddCommandParams>): AddCommandParams => ({
  repo: overrides.repo ?? "",
  ref: overrides.ref ?? Option.none(),
  tag: overrides.tag ?? Option.none(),
  release: overrides.release ?? Option.none(),
  syncPackage: overrides.syncPackage ?? Option.none(),
  cloudflareArtifact: overrides.cloudflareArtifact ?? false,
  cloudflareArtifactDepth: overrides.cloudflareArtifactDepth ?? Option.none(),
  cloudflareArtifactName: overrides.cloudflareArtifactName ?? Option.none(),
  exclude: overrides.exclude ?? [],
  excludeDirs: overrides.excludeDirs ?? [],
  excludeExtensions: overrides.excludeExtensions ?? [],
  include: overrides.include ?? [],
  includeDirs: overrides.includeDirs ?? [],
  maxFileSize: overrides.maxFileSize ?? Option.none(),
  prefix: overrides.prefix ?? Option.none(),
  name: overrides.name ?? Option.none(),
  strategy: overrides.strategy ?? ("clone-ignore" satisfies VendorStrategy),
  localOnly: overrides.localOnly ?? false
})

export const setForkMode = (cwd: string, mode: "personal" | "contribute"): void => {
  execSync(`git config ingraft.forkMode ${mode}`, { cwd })
}
