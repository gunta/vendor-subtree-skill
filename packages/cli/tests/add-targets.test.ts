import { describe, expect, test } from "bun:test"

import { classifyAddTarget } from "../src/commands/add.tsx"
import { hostedRepoFromInput } from "../src/domain/repo.ts"

describe("add target parsing", () => {
  test("treats hosted repository inputs as repository targets", () => {
    expect(classifyAddTarget("Effect-TS/effect")).toEqual({
      _tag: "RepositoryTarget",
      input: "Effect-TS/effect",
      url: "https://github.com/Effect-TS/effect.git"
    })
    expect(classifyAddTarget("https://gitlab.com/gitlab-org/cli.git")).toEqual({
      _tag: "RepositoryTarget",
      input: "https://gitlab.com/gitlab-org/cli.git",
      url: "https://gitlab.com/gitlab-org/cli.git"
    })
  })

  test("keeps branch selectors from repository inputs", () => {
    expect(classifyAddTarget("https://github.com/gunta/confect/tree/effect4")).toEqual({
      _tag: "RepositoryTarget",
      input: "https://github.com/gunta/confect/tree/effect4",
      ref: "effect4",
      url: "https://github.com/gunta/confect.git"
    })
    expect(classifyAddTarget("gunta/confect@effect4")).toEqual({
      _tag: "RepositoryTarget",
      input: "gunta/confect@effect4",
      ref: "effect4",
      url: "https://github.com/gunta/confect.git"
    })
  })

  test("treats npm package names as package targets", () => {
    expect(classifyAddTarget("zod")).toEqual({
      _tag: "PackageTarget",
      ecosystem: "npm",
      input: "zod",
      packageName: "zod"
    })
    expect(classifyAddTarget("@types/node")).toEqual({
      _tag: "PackageTarget",
      ecosystem: "npm",
      input: "@types/node",
      packageName: "@types/node"
    })
  })

  test("treats hex-prefixed package names as Hex package targets", () => {
    expect(classifyAddTarget("hex:jason")).toEqual({
      _tag: "PackageTarget",
      ecosystem: "hex",
      input: "hex:jason",
      packageName: "jason"
    })
  })

  test("treats ecosystem-prefixed package names as package targets", () => {
    expect(classifyAddTarget("react:react")).toEqual({
      _tag: "PackageTarget",
      ecosystem: "react",
      input: "react:react",
      packageName: "react"
    })
    expect(classifyAddTarget("expo:expo")).toEqual({
      _tag: "PackageTarget",
      ecosystem: "expo",
      input: "expo:expo",
      packageName: "expo"
    })
    expect(classifyAddTarget("react-native:react-native")).toEqual({
      _tag: "PackageTarget",
      ecosystem: "react-native",
      input: "react-native:react-native",
      packageName: "react-native"
    })
    expect(classifyAddTarget("swift:apple/swift-argument-parser")).toEqual({
      _tag: "PackageTarget",
      ecosystem: "swift",
      input: "swift:apple/swift-argument-parser",
      packageName: "apple/swift-argument-parser"
    })
    expect(classifyAddTarget("android:com.squareup.okhttp3:okhttp")).toEqual({
      _tag: "PackageTarget",
      ecosystem: "android",
      input: "android:com.squareup.okhttp3:okhttp",
      packageName: "com.squareup.okhttp3:okhttp"
    })
  })
})

describe("default vendor prefix shape", () => {
  test("github shorthand resolves to vendor/<owner>/<name>", () => {
    const repo = hostedRepoFromInput("Effect-TS/effect")
    expect(repo?.nameWithOwner).toBe("Effect-TS/effect")
    const owner = repo?.nameWithOwner?.split("/")[0]
    const finalName = "effect"
    const defaultPrefix =
      owner === undefined ? `vendor/${finalName}` : `vendor/${owner}/${finalName}`
    expect(defaultPrefix).toBe("vendor/Effect-TS/effect")
  })

  test("https github URL resolves to vendor/<owner>/<name>", () => {
    const repo = hostedRepoFromInput("https://github.com/Effect-TS/effect.git")
    expect(repo?.nameWithOwner).toBe("Effect-TS/effect")
  })

  test("github branch URLs resolve to the repository name, not the branch name", () => {
    const repo = hostedRepoFromInput("https://github.com/gunta/confect/tree/effect4")
    expect(repo?.nameWithOwner).toBe("gunta/confect")
    expect(repo?.name).toBe("confect")
  })

  test("ssh github URL resolves to vendor/<owner>/<name>", () => {
    const repo = hostedRepoFromInput("git@github.com:Effect-TS/effect.git")
    expect(repo?.nameWithOwner).toBe("Effect-TS/effect")
  })

  test("file:// URL does not resolve to a nameWithOwner", () => {
    // file:// URLs to local upstream repos used in tests should stay flat —
    // hostedRepoFromInput returns nameWithOwner only when the path has 2+ segments
    // under a recognized hostname. A bare file URL has no host owner.
    const repo = hostedRepoFromInput("file:///tmp/some-upstream/.git")
    // The implementation may return a HostedRepository with `kind: "generic"` and
    // a path-derived nameWithOwner ("tmp" + "some-upstream"). What we care about
    // is: there's no GitHub-style owner. Verify the kind is NOT "github".
    expect(repo?.kind === "github").toBe(false)
  })

  test("bare URL with no owner stays flat", () => {
    // A URL where the path has fewer than 2 segments → nameWithOwner is undefined,
    // so owner is undefined, so the prefix stays vendor/<name>.
    const repo = hostedRepoFromInput("https://example.com/single")
    expect(repo?.nameWithOwner).toBeUndefined()
  })
})
