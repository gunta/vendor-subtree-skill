import { describe, expect, test } from "bun:test"

import { Effect } from "effect"

import { commandInvocation, scriptRelTo } from "../src/project/script.ts"

describe("script invocation", () => {
  test("derives a repo-relative bun command from injected argv", () => {
    const params = {
      cwd: "/repo",
      argv: ["bun", "/repo/packages/cli/scripts/vendor.ts"]
    }

    expect(Effect.runSync(scriptRelTo(params))).toBe("packages/cli/scripts/vendor.ts")
    expect(Effect.runSync(commandInvocation(params))).toBe("bun packages/cli/scripts/vendor.ts")
  })

  test("uses bunx ingraft@latest when argv does not point into the repo", () => {
    expect(
      Effect.runSync(
        commandInvocation({
          cwd: "/repo",
          argv: ["ingraft", "/usr/local/bin/ingraft"]
        })
      )
    ).toBe("bunx ingraft@latest")
  })
})
