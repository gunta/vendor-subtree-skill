import { describe, expect, test } from "bun:test"

import { Effect } from "effect"

import { RuntimeConfig } from "../src/app/runtime.ts"

describe("runtime config service", () => {
  test("can be injected with argv, cwd, and exit behavior", async () => {
    const runtime = RuntimeConfig.of({
      argv: ["bun", "vendor.ts", "list"],
      colors: false,
      cwd: "/workspace",
      exit: (code) => Effect.die(`exit ${code}`)
    })

    const result = await Effect.runPromise(
      RuntimeConfig.pipe(
        Effect.map((config) => ({
          argv: config.argv,
          cwd: config.cwd
        })),
        Effect.provideService(RuntimeConfig, runtime)
      )
    )

    expect(result).toEqual({
      argv: ["bun", "vendor.ts", "list"],
      cwd: "/workspace"
    })
  })
})
