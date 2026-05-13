import { describe, expect, test } from "bun:test"

import {
  detectedProjectLanguageNames,
  projectLanguageUsageFromFiles
} from "../src/project/languages.ts"

describe("project language detection", () => {
  test("detects popular source ecosystems from project files", () => {
    const languages = detectedProjectLanguageNames(
      projectLanguageUsageFromFiles([
        "src/index.ts",
        "scripts/build.mjs",
        "pyproject.toml",
        "crates/core/src/lib.rs",
        "cmd/server/main.go",
        "build.zig",
        "backend/src/main/java/App.java",
        "backend/src/main/kotlin/App.kt",
        "Package.swift",
        "app/src/main/AndroidManifest.xml",
        "app/build.gradle.kts",
        "composer.json",
        "lib/tasks/build.rb",
        "mix.exs",
        "lib/my_app.ex",
        "test/my_app_test.exs",
        "native/addon.cpp",
        "src/App.cs",
        "styles/app.scss",
        "docs/README.md"
      ])
    )

    expect(languages).toEqual([
      "typescript",
      "javascript",
      "python",
      "rust",
      "go",
      "zig",
      "java",
      "kotlin",
      "swift",
      "android",
      "php",
      "ruby",
      "elixir",
      "cpp",
      "csharp",
      "css",
      "markdown"
    ])
  })

  test("does not infer project languages from vendored source", () => {
    const usage = projectLanguageUsageFromFiles([
      "vendor/upstream/src/index.ts",
      "vendor/upstream/main.go",
      "node_modules/lib/index.js",
      "dist/generated.py"
    ])

    expect(detectedProjectLanguageNames(usage)).toEqual([])
  })
})
