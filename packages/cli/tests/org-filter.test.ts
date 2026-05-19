import { describe, expect, test } from "bun:test"

import { Option } from "effect"

import { filterOrgRepos, parseSince, type OrgFilter } from "../src/domain/org-filter.ts"
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

const now = new Date("2026-05-19T00:00:00Z")

describe("parseSince", () => {
  test("returns None for empty input", () => {
    expect(Option.isNone(parseSince(null, now))).toBe(true)
    expect(Option.isNone(parseSince("", now))).toBe(true)
  })

  test("parses ISO date strings", () => {
    const result = parseSince("2026-02-01", now)
    expect(Option.isSome(result)).toBe(true)
    if (Option.isSome(result)) {
      expect(result.value.toISOString()).toBe("2026-02-01T00:00:00.000Z")
    }
  })

  test.each([
    ["7d", "2026-05-12T00:00:00.000Z"],
    ["2w", "2026-05-05T00:00:00.000Z"],
    ["1m", "2026-04-19T00:00:00.000Z"],
    ["6m", "2025-11-19T00:00:00.000Z"]
  ])("parses relative '%s'", (input, expected) => {
    const result = parseSince(input, now)
    expect(Option.isSome(result)).toBe(true)
    if (Option.isSome(result)) expect(result.value.toISOString()).toBe(expected)
  })

  test("returns None for unparseable input", () => {
    expect(Option.isNone(parseSince("90bogus", now))).toBe(true)
    expect(Option.isNone(parseSince("not-a-date", now))).toBe(true)
  })
})

const emptyFilter: OrgFilter = {
  language: [],
  since: null,
  excludeArchived: false,
  excludeForks: false,
  visibility: "all",
  search: ""
}

const repos: ReadonlyArray<OrgRepository> = [
  repo({ name: "ts-app", primaryLanguage: "TypeScript" }),
  repo({ name: "py-app", primaryLanguage: "Python" }),
  repo({ name: "archived-thing", isArchived: true }),
  repo({ name: "forked-thing", isFork: true }),
  repo({ name: "private-thing", visibility: "private" }),
  repo({ name: "old-thing", pushedAt: "2025-01-01T00:00:00Z" }),
  repo({ name: "describes-effect", description: "an effect demo" })
]

describe("filterOrgRepos", () => {
  test("returns all when filter is empty", () => {
    expect(filterOrgRepos(repos, emptyFilter, now).length).toBe(repos.length)
  })

  test("filters by language (case-insensitive, multiple)", () => {
    const out = filterOrgRepos(repos, { ...emptyFilter, language: ["typescript"] }, now)
    expect(out.map((r) => r.name)).toEqual([
      "ts-app",
      "archived-thing",
      "forked-thing",
      "private-thing",
      "old-thing",
      "describes-effect"
    ])
  })

  test("filters by since (relative)", () => {
    const out = filterOrgRepos(repos, { ...emptyFilter, since: "90d" }, now)
    expect(out.find((r) => r.name === "old-thing")).toBeUndefined()
  })

  test("excludes archived when excludeArchived", () => {
    const out = filterOrgRepos(repos, { ...emptyFilter, excludeArchived: true }, now)
    expect(out.find((r) => r.name === "archived-thing")).toBeUndefined()
  })

  test("excludes forks when excludeForks", () => {
    const out = filterOrgRepos(repos, { ...emptyFilter, excludeForks: true }, now)
    expect(out.find((r) => r.name === "forked-thing")).toBeUndefined()
  })

  test("filters by visibility", () => {
    const out = filterOrgRepos(repos, { ...emptyFilter, visibility: "private" }, now)
    expect(out.map((r) => r.name)).toEqual(["private-thing"])
  })

  test("filters by search (matches name OR description)", () => {
    const out = filterOrgRepos(repos, { ...emptyFilter, search: "effect" }, now)
    expect(out.map((r) => r.name)).toEqual(["describes-effect"])
  })

  test("composes multiple filters", () => {
    const out = filterOrgRepos(
      repos,
      {
        ...emptyFilter,
        language: ["typescript"],
        excludeArchived: true,
        excludeForks: true,
        visibility: "public"
      },
      now
    )
    expect(out.map((r) => r.name)).toEqual(["ts-app", "old-thing", "describes-effect"])
  })
})
