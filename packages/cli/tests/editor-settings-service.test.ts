import { describe, expect, test } from "bun:test"

import { Effect } from "effect"

import { EditorSettings } from "../src/editors/service.ts"

describe("editor settings service", () => {
  test("can be replaced by an injected Effect service", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* EditorSettings
        return yield* svc.refresh({ cwd: "/workspace" })
      }).pipe(
        Effect.provideService(
          EditorSettings,
          EditorSettings.of({
            refresh: ({ cwd }) => Effect.succeed([`${cwd}/.ignore`])
          })
        )
      )
    )

    expect(result).toEqual(["/workspace/.ignore"])
  })
})
