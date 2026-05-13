import { describe, expect, test } from "bun:test"

import { Effect, Option } from "effect"

import { RuntimeConfig } from "../src/app/runtime.ts"
import { resolveVersion, versionSelectorFromOptions } from "../src/domain/version.ts"
import { Git } from "../src/services/git.ts"
import { RepositoryHosts } from "../src/services/repository-hosts.ts"

describe("version selectors", () => {
  const runtime = RuntimeConfig.of({
    argv: ["bun", "vendor.ts"],
    colors: false,
    cwd: "/workspace",
    exit: (code) => Effect.die(`exit ${code}`)
  })

  test("rejects ambiguous version selectors", async () => {
    const failure = await Effect.runPromise(
      versionSelectorFromOptions({
        ref: Option.some("main"),
        tag: Option.some("v1.0.0"),
        release: Option.none(),
        syncPackage: Option.none()
      }).pipe(Effect.flip)
    )

    expect(failure._tag).toBe("VersionSelectorConflict")
  })

  test("rejects sync package mixed with explicit selectors", async () => {
    const failure = await Effect.runPromise(
      versionSelectorFromOptions({
        ref: Option.none(),
        tag: Option.some("v1.0.0"),
        release: Option.none(),
        syncPackage: Option.some("effect")
      }).pipe(Effect.flip)
    )

    expect(failure._tag).toBe("VersionSelectorConflict")
    expect(failure.selectors).toEqual(["--tag", "--sync-package"])
  })

  test("creates a sync package selector", async () => {
    const selector = await Effect.runPromise(
      versionSelectorFromOptions({
        ref: Option.none(),
        tag: Option.none(),
        release: Option.none(),
        syncPackage: Option.some("effect")
      })
    )

    expect(selector).toEqual({ _tag: "SyncPackage", value: "effect" })
  })

  test("resolves provider releases to tags", async () => {
    const result = await Effect.runPromise(
      resolveVersion({
        url: "https://github.com/Effect-TS/effect.git",
        selector: { _tag: "Release", value: "latest" }
      }).pipe(
        Effect.provideService(
          RepositoryHosts,
          RepositoryHosts.of({
            clone: () => Effect.succeed(Option.none()),
            defaultBranch: () => Effect.succeed(Option.none()),
            identify: () => Effect.succeed(Option.none()),
            releaseTag: () => Effect.succeed(Option.some("v3.21.2"))
          })
        ),
        Effect.provideService(
          Git,
          Git.of({
            exec: () => Effect.die("git tag fallback should not run")
          })
        ),
        Effect.provideService(RuntimeConfig, runtime)
      )
    )

    expect(Option.getOrUndefined(result)).toBe("v3.21.2")
  })

  test("falls back to git tags for named releases on generic hosts", async () => {
    const result = await Effect.runPromise(
      resolveVersion({
        url: "https://example.com/org/repo.git",
        selector: { _tag: "Release", value: "v1.2.3" }
      }).pipe(
        Effect.provideService(
          RepositoryHosts,
          RepositoryHosts.of({
            clone: () => Effect.succeed(Option.none()),
            defaultBranch: () => Effect.succeed(Option.none()),
            identify: () => Effect.succeed(Option.none()),
            releaseTag: () => Effect.succeed(Option.none())
          })
        ),
        Effect.provideService(
          Git,
          Git.of({
            exec: (args) => {
              expect(args).toEqual([
                "ls-remote",
                "--tags",
                "https://example.com/org/repo.git",
                "refs/tags/v1.2.3"
              ])
              return Effect.succeed({
                stdout: "abc\trefs/tags/v1.2.3\n",
                stderr: "",
                exitCode: 0
              })
            }
          })
        ),
        Effect.provideService(RuntimeConfig, runtime)
      )
    )

    expect(Option.getOrUndefined(result)).toBe("v1.2.3")
  })
})
