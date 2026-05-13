import { describe, expect, test } from "bun:test"

import { formatPlanResult, selectCliCommand } from "../src/tui/cli-adapter.ts"

describe("selectCliCommand", () => {
  test("uses bun + local script when the local CLI exists", () => {
    const result = selectCliCommand({
      args: ["add", "owner/repo"],
      localCliExists: true,
      localCliPath: "/repo/scripts/vendor.ts"
    })
    expect(result).toEqual({
      args: ["/repo/scripts/vendor.ts", "add", "owner/repo"],
      command: "bun"
    })
  })

  test("falls back to the published CLI when no local script exists", () => {
    const result = selectCliCommand({
      args: ["list"],
      localCliExists: false,
      localCliPath: "/anywhere"
    })
    expect(result).toEqual({ args: ["list"], command: "ingraft" })
  })

  test("preserves an empty args array", () => {
    const result = selectCliCommand({
      args: [],
      localCliExists: false,
      localCliPath: "/x"
    })
    expect(result.args).toEqual([])
  })
})

describe("formatPlanResult", () => {
  test("returns OK prefix on status 0 with no output", () => {
    const result = formatPlanResult({
      label: "add owner/repo",
      result: { status: 0, stderr: "", stdout: "" }
    })
    expect(result).toBe("OK add owner/repo")
  })

  test("returns FAIL prefix on non-zero status", () => {
    const result = formatPlanResult({
      label: "remove repo",
      result: { status: 1, stderr: "boom", stdout: "" }
    })
    expect(result).toBe("FAIL remove repo: boom")
  })

  test("prefers stderr over stdout when stderr is non-empty", () => {
    const result = formatPlanResult({
      label: "x",
      result: { status: 0, stderr: "stderr line", stdout: "stdout line" }
    })
    expect(result).toBe("OK x: stderr line")
  })

  test("includes the last 4 lines of output, joined with ' | '", () => {
    const stdout = "line1\nline2\nline3\nline4\nline5\nline6"
    const result = formatPlanResult({
      label: "x",
      result: { status: 0, stderr: "", stdout }
    })
    expect(result).toBe("OK x: line3 | line4 | line5 | line6")
  })

  test("treats null status as failure", () => {
    const result = formatPlanResult({
      label: "x",
      result: { status: null, stderr: "", stdout: "" }
    })
    expect(result).toBe("FAIL x")
  })
})
