import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { NodeServices } from "@effect/platform-node"
import { Effect } from "effect"

import { RuntimeConfigLive } from "../src/app/runtime.ts"
import {
  IntellijSettings,
  IntellijSettingsLive,
  mergeIntellijFileColorsText,
  mergeIntellijVendorScopeText
} from "../src/editors/intellij.ts"

const withTempWorkspace = async <A>(run: (cwd: string) => Promise<A>): Promise<A> => {
  const cwd = mkdtempSync(join(tmpdir(), "vendor-intellij-"))
  try {
    return await run(cwd)
  } finally {
    rmSync(cwd, { force: true, recursive: true })
  }
}

describe("IntelliJ settings", () => {
  test("creates a shared vendor scope that keeps vendor visible", () => {
    const result = mergeIntellijVendorScopeText()

    expect(result._tag).toBe("Updated")
    if (result._tag === "Updated") {
      expect(result.text).toContain('scope name="Vendor"')
      expect(result.text).toContain('pattern="file:vendor//*"')
      expect(result.text).not.toContain("excludeFolder")
    }
  })

  test("adds a shared file color without replacing existing colors", () => {
    const result = mergeIntellijFileColorsText(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<project version="4">',
        '  <component name="SharedFileColors">',
        '    <fileColor scope="Tests" color="Blue" />',
        "  </component>",
        "</project>"
      ].join("\n")
    )

    expect(result._tag).toBe("Updated")
    if (result._tag === "Updated") {
      expect(result.text).toMatch(/<fileColor scope="Tests" color="Blue"\s*\/>/)
      expect(result.text).toMatch(/<fileColor scope="Vendor" color="Green"\s*\/>/)
    }
  })

  test("rejects malformed file color xml instead of rewriting it", () => {
    const result = mergeIntellijFileColorsText(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<project version="4">',
        '  <component name="SharedFileColors">',
        '    <fileColor scope="Tests" color="Blue">',
        "  </component>",
        "</project>"
      ].join("\n")
    )

    expect(result._tag).toBe("Invalid")
    if (result._tag === "Invalid") {
      expect(result.message).toBe(".idea/fileColors.xml is not well-formed XML.")
    }
  })

  test("refresh writes JetBrains project files only when .idea exists", async () => {
    await withTempWorkspace(async (cwd) => {
      const missing = await Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* IntellijSettings
          return yield* svc.refresh(cwd)
        }).pipe(
          Effect.provide(IntellijSettingsLive),
          Effect.provide(RuntimeConfigLive),
          Effect.provide(NodeServices.layer)
        )
      )
      expect(missing).toEqual([])

      mkdirSync(join(cwd, ".idea"), { recursive: true })
      const written = await Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* IntellijSettings
          return yield* svc.refresh(cwd)
        }).pipe(
          Effect.provide(IntellijSettingsLive),
          Effect.provide(RuntimeConfigLive),
          Effect.provide(NodeServices.layer)
        )
      )

      expect(written.map((path) => path.replace(`${cwd}/`, ""))).toEqual([
        ".idea/scopes/Vendor.xml",
        ".idea/fileColors.xml"
      ])
      expect(readFileSync(join(cwd, ".idea/scopes/Vendor.xml"), "utf8")).toContain(
        'pattern="file:vendor//*"'
      )
      expect(readFileSync(join(cwd, ".idea/fileColors.xml"), "utf8")).toContain(
        '<fileColor scope="Vendor" color="Green" />'
      )
    })
  })
})
