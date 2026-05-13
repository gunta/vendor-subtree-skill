import { describe, expect, test } from "bun:test"

import { Effect } from "effect"

import { ProjectFiles } from "../src/project/service.ts"

describe("project files service", () => {
  test("can be replaced by an injected Effect service", async () => {
    let cwd = ""

    await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* ProjectFiles
        yield* service.refresh({
          commitMessage: "vendor: test",
          cwd: "/workspace",
          repos: []
        })
      }).pipe(
        Effect.provideService(
          ProjectFiles,
          ProjectFiles.of({
            refresh: (params) =>
              Effect.sync(() => {
                cwd = params.cwd
              })
          })
        )
      )
    )

    expect(cwd).toBe("/workspace")
  })
})
