import { describe, expect, test } from "bun:test"
import { pathToFileURL } from "node:url"

import { Effect } from "effect"

import { siblingModulePath, tuiLaunchPlan } from "../src/tui/launcher.ts"

describe("tui launcher", () => {
  test("uses a Bun child process for built Node executions", () => {
    const moduleUrl = pathToFileURL("/repo/packages/cli/dist/src/tui/launcher.js").href
    const plan = Effect.runSync(
      tuiLaunchPlan({ args: ["--debug"], isBunRuntime: false, moduleUrl })
    )
    expect(plan).toEqual({
      _tag: "spawn",
      args: ["/repo/packages/cli/dist/src/tui/runner.js", "--debug"],
      command: "bun"
    })
  })

  test("preserves TypeScript source paths during workspace development", () => {
    const moduleUrl = pathToFileURL("/repo/packages/cli/src/tui/launcher.ts").href
    expect(Effect.runSync(siblingModulePath(moduleUrl, "runner"))).toBe(
      "/repo/packages/cli/src/tui/runner.ts"
    )
  })

  test("runs directly when the CLI itself is already running in Bun", () => {
    const plan = Effect.runSync(tuiLaunchPlan({ isBunRuntime: true }))
    expect(plan).toEqual({ _tag: "direct", args: [] })
  })
})
