import { describe, expect, test } from "bun:test"
import { commandInvocation, scriptRelTo } from "../src/script.ts"

describe("script invocation", () => {
  test("derives a repo-relative bun command from injected argv", () => {
    const params = {
      cwd: "/repo",
      argv: ["bun", "/repo/scripts/vendor.ts"]
    }

    expect(scriptRelTo(params)).toBe("scripts/vendor.ts")
    expect(commandInvocation(params)).toBe("bun scripts/vendor.ts")
  })

  test("uses the package binary when argv does not point into the repo", () => {
    expect(
      commandInvocation({
        cwd: "/repo",
        argv: ["vendor-subtree", "/usr/local/bin/vendor-subtree"]
      })
    ).toBe("vendor-subtree")
  })
})
