import { describe, expect, test } from "bun:test"
import { execSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { Effect, Option } from "effect"

import { LiveLayer } from "../src/app/layers.ts"
import { addOrgImpl, createInitialAddOrgTuiState } from "../src/commands/add-org.tsx"
import { listVendored } from "../src/domain/vendor-state.ts"
import { GitHubCli } from "../src/services/gh.ts"
import { GitMetadataLive } from "../src/services/git-metadata.ts"
import { AddOrgAction, dispatchAddOrg, filteredRepos } from "../src/tui/add-org/state.ts"

const buildOrgRepo = (overrides: {
  readonly name?: string
  readonly url?: string
  readonly isArchived?: boolean
  readonly isFork?: boolean
  readonly stargazerCount?: number
}) => ({
  name: overrides.name ?? "alpha",
  owner: { login: "gunta" },
  defaultBranchRef: { name: "main" },
  pushedAt: "2026-05-18T00:00:00Z",
  primaryLanguage: { name: "TypeScript" },
  isArchived: overrides.isArchived ?? false,
  isFork: overrides.isFork ?? false,
  visibility: "PUBLIC",
  description: null,
  stargazerCount: overrides.stargazerCount ?? 0,
  url: overrides.url ?? "https://github.com/gunta/alpha"
})

const initUpstreamRepo = (): string => {
  // Build the upstream working tree at a path ending in `.git` so that the
  // URL returned by the mocked `gh repo list` already has the `.git` suffix
  // that GitHubOrg.normalizeUrl appends. Two-level dir so the file:// URL
  // has 2+ path segments and hostedRepoFromInput classifies it.
  const base = mkdtempSync(join(tmpdir(), "ingraft-org-upstream-"))
  const upstream = join(base, "test", "upstream.git")
  execSync(`mkdir -p "${upstream}"`)
  execSync("git init -q -b main", { cwd: upstream })
  execSync("git config user.email up@example.com && git config user.name up", { cwd: upstream })
  writeFileSync(join(upstream, "README.md"), "hello\n")
  execSync("git add README.md && git commit -m seed -q", { cwd: upstream })
  return upstream
}

const initProject = (): string => {
  const project = mkdtempSync(join(tmpdir(), "ingraft-org-project-"))
  execSync("git init -q -b main", { cwd: project })
  execSync("git config user.email tests@example.com && git config user.name tests", {
    cwd: project
  })
  execSync("git commit --allow-empty -m init -q", { cwd: project })
  return project
}

const originalCwd = process.cwd()

describe("add-org non-interactive", () => {
  test("keeps the full repo list in the TUI so filters can be relaxed", () => {
    const repos = [
      buildOrgRepo({ name: "active" }),
      buildOrgRepo({ name: "forked", isFork: true })
    ].map((repo) => ({
      name: repo.name,
      owner: repo.owner.login,
      defaultBranch: repo.defaultBranchRef.name,
      pushedAt: repo.pushedAt,
      primaryLanguage: repo.primaryLanguage.name,
      isArchived: repo.isArchived,
      isFork: repo.isFork,
      visibility: repo.visibility.toLowerCase(),
      description: repo.description,
      stars: repo.stargazerCount,
      url: repo.url
    }))

    const state = createInitialAddOrgTuiState({
      owner: "gunta",
      repos,
      vendored: new Set(),
      filters: {
        language: [],
        since: null,
        excludeArchived: true,
        excludeForks: true,
        visibility: "all",
        search: ""
      },
      strategy: "clone-ignore",
      concurrency: 8
    })

    expect(filteredRepos(state).map((repo) => repo.name)).toEqual(["active"])

    const relaxed = dispatchAddOrg(state, AddOrgAction.ToggleForks())
    expect(filteredRepos(relaxed).map((repo) => repo.name)).toEqual(["active", "forked"])
  })

  test("clones every filtered repo and registers them in vendor-state", async () => {
    const upstream = initUpstreamRepo()
    const project = initProject()
    try {
      const upstreamUrl = `file://${upstream}`
      const orgRepos = [buildOrgRepo({ name: "alpha", url: upstreamUrl })]

      process.chdir(project)
      try {
        await Effect.runPromise(
          addOrgImpl({
            owner: "gunta",
            language: [],
            since: Option.none(),
            includeArchived: false,
            includeForks: false,
            visibility: "all",
            yes: true,
            dryRun: false,
            refresh: false,
            concurrency: 8,
            strategy: "clone-ignore",
            ref: Option.none(),
            tag: Option.none(),
            release: Option.none()
          }).pipe(
            Effect.provideService(
              GitHubCli,
              GitHubCli.of({
                exec: (args) => {
                  if (args[0] === "repo" && args[1] === "list") {
                    return Effect.succeed({
                      stdout: JSON.stringify(orgRepos),
                      stderr: "",
                      exitCode: 0
                    })
                  }
                  return Effect.die(`unexpected gh call: ${args.join(" ")}`)
                }
              })
            ),
            Effect.provide(LiveLayer),
            Effect.provide(GitMetadataLive)
          )
        )

        const vendored = await Effect.runPromise(
          listVendored(project).pipe(Effect.provide(LiveLayer), Effect.provide(GitMetadataLive))
        )
        expect(vendored.some((r) => r.name === "alpha")).toBe(true)
      } finally {
        process.chdir(originalCwd)
      }
    } finally {
      rmSync(upstream, { recursive: true, force: true })
      rmSync(project, { recursive: true, force: true })
    }
  })

  test("does not abort when one repo fails", async () => {
    const upstream = initUpstreamRepo()
    const project = initProject()
    try {
      const upstreamUrl = `file://${upstream}`
      const repos = [
        buildOrgRepo({ name: "ok", url: upstreamUrl }),
        buildOrgRepo({ name: "broken", url: "file:///nonexistent/repo.git" })
      ]

      process.chdir(project)
      try {
        await Effect.runPromise(
          addOrgImpl({
            owner: "gunta",
            language: [],
            since: Option.none(),
            includeArchived: false,
            includeForks: false,
            visibility: "all",
            yes: true,
            dryRun: false,
            refresh: false,
            concurrency: 4,
            strategy: "clone-ignore",
            ref: Option.none(),
            tag: Option.none(),
            release: Option.none()
          }).pipe(
            Effect.provideService(
              GitHubCli,
              GitHubCli.of({
                exec: () =>
                  Effect.succeed({
                    stdout: JSON.stringify(repos),
                    stderr: "",
                    exitCode: 0
                  })
              })
            ),
            Effect.provide(LiveLayer),
            Effect.provide(GitMetadataLive)
          )
        )

        const vendored = await Effect.runPromise(
          listVendored(project).pipe(Effect.provide(LiveLayer), Effect.provide(GitMetadataLive))
        )
        expect(vendored.some((r) => r.name === "ok")).toBe(true)
      } finally {
        process.chdir(originalCwd)
      }
    } finally {
      rmSync(upstream, { recursive: true, force: true })
      rmSync(project, { recursive: true, force: true })
    }
  })

  test("passes explicit ref through to each add operation", async () => {
    const upstream = initUpstreamRepo()
    const project = initProject()
    try {
      execSync("git switch -q -c feature", { cwd: upstream })
      writeFileSync(join(upstream, "README.md"), "from feature\n")
      execSync("git add README.md && git commit -m feature -q", { cwd: upstream })

      const upstreamUrl = `file://${upstream}`
      const orgRepos = [buildOrgRepo({ name: "alpha", url: upstreamUrl })]

      process.chdir(project)
      try {
        await Effect.runPromise(
          addOrgImpl({
            owner: "gunta",
            language: [],
            since: Option.none(),
            includeArchived: false,
            includeForks: false,
            visibility: "all",
            yes: true,
            dryRun: false,
            refresh: false,
            concurrency: 8,
            strategy: "clone-ignore",
            ref: Option.some("feature"),
            tag: Option.none(),
            release: Option.none()
          }).pipe(
            Effect.provideService(
              GitHubCli,
              GitHubCli.of({
                exec: (args) => {
                  if (args[0] === "repo" && args[1] === "list") {
                    return Effect.succeed({
                      stdout: JSON.stringify(orgRepos),
                      stderr: "",
                      exitCode: 0
                    })
                  }
                  return Effect.die(`unexpected gh call: ${args.join(" ")}`)
                }
              })
            ),
            Effect.provide(LiveLayer),
            Effect.provide(GitMetadataLive)
          )
        )

        const vendored = await Effect.runPromise(
          listVendored(project).pipe(Effect.provide(LiveLayer), Effect.provide(GitMetadataLive))
        )
        const alpha = vendored.find((r) => r.name === "alpha")
        expect(alpha?.ref).toBe("feature")
        expect(readFileSync(join(project, alpha!.prefix, "README.md"), "utf-8")).toBe(
          "from feature\n"
        )
      } finally {
        process.chdir(originalCwd)
      }
    } finally {
      rmSync(upstream, { recursive: true, force: true })
      rmSync(project, { recursive: true, force: true })
    }
  })

  test("--dry-run does not clone", async () => {
    const project = initProject()
    try {
      const orgRepos = [buildOrgRepo({ name: "alpha", url: "file:///nonexistent/upstream.git" })]

      process.chdir(project)
      try {
        await Effect.runPromise(
          addOrgImpl({
            owner: "gunta",
            language: [],
            since: Option.none(),
            includeArchived: false,
            includeForks: false,
            visibility: "all",
            yes: true,
            dryRun: true,
            refresh: false,
            concurrency: 8,
            strategy: "clone-ignore",
            ref: Option.none(),
            tag: Option.none(),
            release: Option.none()
          }).pipe(
            Effect.provideService(
              GitHubCli,
              GitHubCli.of({
                exec: () =>
                  Effect.succeed({
                    stdout: JSON.stringify(orgRepos),
                    stderr: "",
                    exitCode: 0
                  })
              })
            ),
            Effect.provide(LiveLayer),
            Effect.provide(GitMetadataLive)
          )
        )

        const vendored = await Effect.runPromise(
          listVendored(project).pipe(Effect.provide(LiveLayer), Effect.provide(GitMetadataLive))
        )
        expect(vendored.length).toBe(0)
      } finally {
        process.chdir(originalCwd)
      }
    } finally {
      rmSync(project, { recursive: true, force: true })
    }
  })
})
