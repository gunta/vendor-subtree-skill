import { describe, expect, test } from "bun:test"

import type { OrgRepository } from "../src/services/local-state.ts"
import { renderAddOrg } from "../src/tui/add-org/render.ts"
import { createAddOrgState, type RunStatus } from "../src/tui/add-org/state.ts"

const stripAnsi = (value: string): string => value.replace(/\x1b\[[0-9;]*m/g, "")

const repo = (index: number, overrides: Partial<OrgRepository> = {}): OrgRepository => ({
  name: `very-long-repository-name-that-should-not-overflow-${index}`,
  owner: "get-convex",
  defaultBranch: "main",
  pushedAt: "2026-05-01T00:00:00Z",
  primaryLanguage: "TypeScriptWithLongName",
  isArchived: false,
  isFork: false,
  visibility: "public",
  description: null,
  stars: 1200 + index,
  url: `https://github.com/get-convex/repo-${index}.git`,
  ...overrides
})

describe("renderAddOrg", () => {
  test("keeps the selection UI inside the terminal viewport", () => {
    const state = {
      ...createAddOrgState({
        owner: "get-convex",
        repos: Array.from({ length: 80 }, (_, index) => repo(index)),
        vendored: new Set()
      }),
      focusedIndex: 42
    }

    const lines = renderAddOrg(state, { height: 12, width: 64 })

    expect(lines.length).toBeLessThanOrEqual(12)
    expect(lines.every((line) => line.length <= 64)).toBe(true)
    expect(lines.some((line) => line.startsWith(">"))).toBe(true)
    expect(lines.join("\n")).toContain("43/80")
    expect(lines.find((line) => line.startsWith(">"))).toContain("very-long-repository")
  })

  test("shows the interactive filter hotkeys and active filter state", () => {
    const state = createAddOrgState({
      owner: "get-convex",
      repos: [repo(0)],
      vendored: new Set(),
      filters: {
        language: ["Rust"],
        since: "90d",
        excludeArchived: true,
        excludeForks: true,
        visibility: "public",
        search: ""
      }
    })

    const text = renderAddOrg(state, { height: 12, width: 88 }).join("\n")

    expect(text).toContain("l language=Rust")
    expect(text).toContain("/ search=-")
    expect(text).toContain("s since=90d")
    expect(text).toContain("v visibility=public")
    expect(text).toContain("o order=stars")
    expect(text).toContain("A [x] skip archived")
    expect(text).toContain("F [x] skip forks")
  })

  test("shows active typed search state in the filter bar", () => {
    const state = {
      ...createAddOrgState({
        owner: "get-convex",
        repos: [repo(0)],
        vendored: new Set(),
        filters: {
          language: [],
          since: null,
          excludeArchived: false,
          excludeForks: false,
          visibility: "all",
          search: "convex"
        }
      }),
      searchActive: true
    }

    const text = renderAddOrg(state, { height: 12, width: 100 }).join("\n")

    expect(text).toContain("/ search=convex_")
  })

  test("omits the redundant owner prefix from repository rows", () => {
    const state = createAddOrgState({
      owner: "get-convex",
      repos: [repo(0)],
      vendored: new Set()
    })

    const row = renderAddOrg(state, { height: 10, width: 100 }).find((line) => line.startsWith(">"))

    expect(row).toBeDefined()
    expect(row).toContain("overflow-0")
    expect(row).toContain("1.2k")
    expect(row).not.toContain("get-convex/")
  })

  test("shows an aligned stars column in wide viewports", () => {
    const state = createAddOrgState({
      owner: "get-convex",
      repos: [repo(0, { name: "small", stars: 12 }), repo(1, { name: "large", stars: 42_100 })],
      vendored: new Set()
    })

    const text = renderAddOrg(state, { height: 12, width: 100 }).join("\n")

    expect(text).toContain("language       stars  pushed")
    expect(text).toContain("  42.1k")
    expect(text).toContain("     12")
  })

  test("can render a colored icon mode without breaking viewport width", () => {
    const state = {
      ...createAddOrgState({
        owner: "get-convex",
        repos: [repo(0), repo(1)],
        vendored: new Set()
      }),
      selected: new Set(["get-convex/very-long-repository-name-that-should-not-overflow-0"]),
      runProgress: new Map<string, RunStatus>([
        ["get-convex/very-long-repository-name-that-should-not-overflow-0", "success"]
      ])
    }

    const lines = renderAddOrg(state, { height: 10, width: 72, colors: true, icons: true })
    const plain = lines.map(stripAnsi)

    expect(lines.join("\n")).toContain("\x1b[")
    expect(plain.join("\n")).toContain("✦ ingraft add-org")
    expect(plain.some((line) => line.startsWith("›"))).toBe(true)
    expect(plain.join("\n")).toContain("✓")
    expect(plain.every((line) => line.length <= 72)).toBe(true)
  })

  test("colors row metadata by language, age, and visibility", () => {
    const state = createAddOrgState({
      owner: "get-convex",
      repos: [
        repo(0, {
          name: "public-typescript",
          primaryLanguage: "TypeScript",
          visibility: "public"
        }),
        repo(1, {
          name: "private-rust",
          primaryLanguage: "Rust",
          pushedAt: "2024-01-01T00:00:00Z",
          visibility: "private"
        })
      ],
      vendored: new Set()
    })

    const lines = renderAddOrg(state, { height: 12, width: 110, colors: true })
    const text = lines.join("\n")
    const plain = stripAnsi(text)

    expect(plain).toContain("TypeScript")
    expect(plain).toContain("Rust")
    expect(plain).toContain("public")
    expect(plain).toContain("private")
    expect(text).toContain("\x1b[38;2;166;227;161mpublic")
    expect(text).toContain("\x1b[38;2;243;139;168mprivate")
  })
})
