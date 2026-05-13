import { describe, expect, test } from "bun:test"

import {
  cacheLinkCacheRootFromEnv,
  cacheLinkEntryPath,
  parseLsRemoteCommit
} from "../src/project/cache-link.ts"

describe("cache-link strategy", () => {
  test("uses INGRAFT_CACHE_DIR before the platform cache directory", () => {
    expect(
      cacheLinkCacheRootFromEnv({
        HOME: "/home/alice",
        INGRAFT_CACHE_DIR: "/var/tmp/ingraft-cache",
        XDG_CACHE_HOME: "/home/alice/.cache"
      })
    ).toBe("/var/tmp/ingraft-cache")
  })

  test("builds a readable content-addressed cache path from source and resolved ref", () => {
    expect(
      cacheLinkEntryPath({
        root: "/home/alice/.cache/ingraft",
        resolvedRef: "9f3a0d8e6f3a0d8e6f3a0d8e6f3a0d8e6f3a0d8e",
        url: "https://github.com/Effect-TS/effect.git"
      })
    ).toMatch(
      /^\/home\/alice\/\.cache\/ingraft\/repos\/github\.com\/Effect-TS\/effect\/9f3a0d8e6f3a-[a-f0-9]{12}$/
    )
  })

  test("prefers peeled annotated tag commits from ls-remote output", () => {
    expect(
      parseLsRemoteCommit(
        [
          "1111111111111111111111111111111111111111\trefs/tags/v1.0.0",
          "2222222222222222222222222222222222222222\trefs/tags/v1.0.0^{}"
        ].join("\n")
      )
    ).toBe("2222222222222222222222222222222222222222")
  })
})
