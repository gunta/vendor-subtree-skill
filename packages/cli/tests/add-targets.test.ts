import { describe, expect, test } from "bun:test"

import { classifyAddTarget } from "../src/commands/add.tsx"

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
