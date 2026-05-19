import { describe, expect, test } from "bun:test"
import { join } from "node:path"

import { Option } from "effect"

import {
  defaultForkCheckoutPath,
  defaultForkRoot,
  defaultForkVendorPrefix,
  forkRemoteUrl,
  forkRouteName,
  forkRouteTarget
} from "../src/domain/fork-workspace.ts"

describe("fork workspace naming", () => {
  test("uses a sibling forked directory for repositories under a GitHub workspace", () => {
    expect(defaultForkRoot("/Users/me/Documents/GitHub/ingraft")).toBe(
      "/Users/me/Documents/GitHub/forked"
    )
  })

  test("falls back to ../forked outside a GitHub workspace", () => {
    expect(defaultForkRoot("/tmp/project")).toBe(join("/tmp", "forked"))
  })

  test("keeps editable fork checkouts namespaced by upstream owner and repo", () => {
    expect(
      defaultForkCheckoutPath({
        cwd: "/Users/me/Documents/GitHub/app",
        upstream: { owner: "Effect-TS", name: "effect", nameWithOwner: "Effect-TS/effect" },
        root: Option.none()
      })
    ).toBe("/Users/me/Documents/GitHub/forked/Effect-TS/effect")
  })

  test("uses upstream naming for the read-only vendor projection by default", () => {
    const upstream = { owner: "Effect-TS", name: "effect", nameWithOwner: "Effect-TS/effect" }

    expect(defaultForkVendorPrefix(upstream)).toBe("vendor/Effect-TS/effect")
    expect(forkRouteName(upstream, Option.none())).toBe("effect")
  })

  test("builds the fork remote and add route from the fork owner", () => {
    const upstream = { owner: "Effect-TS", name: "effect", nameWithOwner: "Effect-TS/effect" }

    expect(forkRemoteUrl({ owner: "gunta", repo: upstream })).toBe(
      "https://github.com/gunta/effect.git"
    )
    expect(
      forkRouteTarget({
        forkOwner: "gunta",
        name: Option.none(),
        prefix: Option.none(),
        upstream
      })
    ).toEqual({
      name: "effect",
      prefix: "vendor/Effect-TS/effect",
      url: "https://github.com/gunta/effect.git"
    })
  })
})
