import { describe, expect, test } from "bun:test"

import { sortOrgRepos } from "../src/domain/org-sort.ts"
import type { OrgRepository } from "../src/services/local-state.ts"

const repo = (overrides: Partial<OrgRepository>): OrgRepository => ({
  name: "demo",
  owner: "gunta",
  defaultBranch: "main",
  pushedAt: "2026-05-01T00:00:00Z",
  primaryLanguage: "TypeScript",
  isArchived: false,
  isFork: false,
  visibility: "public",
  description: null,
  stars: 0,
  url: "https://github.com/gunta/demo.git",
  ...overrides
})

describe("sortOrgRepos", () => {
  const repos = [
    repo({ name: "zeta", pushedAt: "2026-01-01T00:00:00Z", stars: 100 }),
    repo({ name: "alpha", pushedAt: "2026-05-01T00:00:00Z", stars: 1 }),
    repo({ name: "beta", pushedAt: "2026-03-01T00:00:00Z", stars: 25 })
  ]

  test("orders by stars descending by default", () => {
    expect(sortOrgRepos(repos).map((r) => r.name)).toEqual(["zeta", "beta", "alpha"])
  })

  test("orders alphabetically by repository name", () => {
    expect(sortOrgRepos(repos, "name").map((r) => r.name)).toEqual(["alpha", "beta", "zeta"])
  })

  test("orders by most recently pushed", () => {
    expect(sortOrgRepos(repos, "pushed").map((r) => r.name)).toEqual(["alpha", "beta", "zeta"])
  })
})
