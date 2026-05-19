import { describe, expect, test } from "bun:test"

import { Effect } from "effect"

import { LiveLayer } from "../src/app/layers.ts"
import { GitHubCli } from "../src/services/gh.ts"
import { GitMetadataLive } from "../src/services/git-metadata.ts"

describe("LiveLayer", () => {
  test("provides GitHubCli for services that call GitHub lazily", async () => {
    const gh = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* GitHubCli
      }).pipe(Effect.provide(LiveLayer), Effect.provide(GitMetadataLive))
    )

    expect(typeof gh.exec).toBe("function")
  })
})
