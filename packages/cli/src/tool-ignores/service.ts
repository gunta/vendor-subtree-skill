import { Context, Effect, Layer } from "effect"

import {
  doctorToolCategories,
  refreshToolCategories,
  type ToolIgnoreCategory
} from "./categories.ts"
import { PrettierIgnore } from "./formatters/index.ts"
import {
  CargoIgnore,
  ElixirIgnore,
  MypyIgnore,
  PyrightIgnore,
  TypeScriptIgnore,
  ZigIgnore
} from "./language-analyzers/index.ts"
import {
  BiomeIgnore,
  CspellIgnore,
  EslintIgnore,
  GolangciLintIgnore,
  MarkdownlintIgnore,
  OxlintIgnore,
  RuffIgnore,
  StylelintIgnore
} from "./linters/index.ts"
import { MonorepoTools } from "./monorepo.ts"

export interface RefreshToolIgnoresParams {
  readonly cwd: string
}

export interface ToolIgnoresShape {
  readonly doctor: (
    params: RefreshToolIgnoresParams
  ) => Effect.Effect<ReadonlyArray<import("./common.ts").ToolIgnoreReport>, unknown>
  readonly refresh: (
    params: RefreshToolIgnoresParams
  ) => Effect.Effect<ReadonlyArray<string>, unknown>
}

export class ToolIgnores extends Context.Service<ToolIgnores, ToolIgnoresShape>()(
  "ingraft/ToolIgnores"
) {}

export const ToolIgnoresLive = Layer.effect(
  ToolIgnores,
  Effect.gen(function* () {
    const biome = yield* BiomeIgnore
    const cspell = yield* CspellIgnore
    const eslint = yield* EslintIgnore
    const golangciLint = yield* GolangciLintIgnore
    const markdownlint = yield* MarkdownlintIgnore
    const monorepo = yield* MonorepoTools
    const mypy = yield* MypyIgnore
    const oxlint = yield* OxlintIgnore
    const prettier = yield* PrettierIgnore
    const pyright = yield* PyrightIgnore
    const ruff = yield* RuffIgnore
    const stylelint = yield* StylelintIgnore
    const typescript = yield* TypeScriptIgnore
    const cargo = yield* CargoIgnore
    const elixir = yield* ElixirIgnore
    const zig = yield* ZigIgnore
    const toolCategories = [
      {
        name: "linters",
        tools: [biome, cspell, eslint, golangciLint, markdownlint, oxlint, ruff, stylelint]
      },
      {
        name: "formatters",
        tools: [prettier]
      },
      {
        name: "language-analyzers",
        tools: [mypy, pyright, typescript, cargo, elixir, zig]
      }
    ] as const satisfies ReadonlyArray<ToolIgnoreCategory>

    return {
      doctor: ({ cwd }: RefreshToolIgnoresParams) =>
        Effect.all([doctorToolCategories(toolCategories, cwd), monorepo.doctor(cwd)], {
          concurrency: 2
        }).pipe(
          Effect.map(([toolReports, monorepoReports]) => [...toolReports, ...monorepoReports])
        ),
      refresh: ({ cwd }: RefreshToolIgnoresParams) =>
        Effect.all([refreshToolCategories(toolCategories, cwd), monorepo.refresh(cwd)], {
          concurrency: 2
        }).pipe(Effect.map(([toolPaths, monorepoPaths]) => [...toolPaths, ...monorepoPaths]))
    }
  })
)
