import { describe, expect, test } from "bun:test"

import { Effect } from "effect"

import {
  expandAliasTargetsWith,
  repositoryAliasEntriesFromDatabase
} from "../src/aliases/service.ts"

const database = {
  aliases: [
    {
      alias: "effect",
      strategy: "clone-ignore",
      targets: ["Effect-TS/effect"]
    },
    {
      alias: "convex",
      targets: ["get-convex/convex-js", "get-convex/convex-helpers"]
    },
    {
      alias: "vscode",
      targets: [
        {
          target: "microsoft/vscode",
          strategy: "submodule"
        }
      ]
    }
  ]
}

describe("repository aliases", () => {
  test("loads entries from the JSON database shape", async () => {
    const entries = await Effect.runPromise(repositoryAliasEntriesFromDatabase(database))

    expect(entries).toEqual([
      {
        alias: "effect",
        description: undefined,
        strategy: "clone-ignore",
        targets: [
          {
            strategy: "clone-ignore",
            target: "Effect-TS/effect"
          }
        ]
      },
      {
        alias: "convex",
        description: undefined,
        strategy: undefined,
        targets: [
          {
            strategy: undefined,
            target: "get-convex/convex-js"
          },
          {
            strategy: undefined,
            target: "get-convex/convex-helpers"
          }
        ]
      },
      {
        alias: "vscode",
        description: undefined,
        strategy: undefined,
        targets: [
          {
            strategy: "submodule",
            target: "microsoft/vscode"
          }
        ]
      }
    ])
  })

  test("expands aliases before add target classification", async () => {
    const entries = await Effect.runPromise(repositoryAliasEntriesFromDatabase(database))

    expect(expandAliasTargetsWith(entries, ["effect", "zod"])).toEqual([
      {
        alias: "effect",
        input: "effect",
        strategy: "clone-ignore",
        target: "Effect-TS/effect"
      },
      {
        input: "zod",
        target: "zod"
      }
    ])
  })

  test("expands a single alias into multiple repositories", async () => {
    const entries = await Effect.runPromise(repositoryAliasEntriesFromDatabase(database))

    expect(expandAliasTargetsWith(entries, ["convex"])).toEqual([
      {
        alias: "convex",
        input: "convex",
        target: "get-convex/convex-js"
      },
      {
        alias: "convex",
        input: "convex",
        target: "get-convex/convex-helpers"
      }
    ])
  })

  test("deduplicates repeated alias targets while preserving order", async () => {
    const entries = await Effect.runPromise(repositoryAliasEntriesFromDatabase(database))

    expect(expandAliasTargetsWith(entries, ["effect", "Effect-TS/effect", "convex"])).toEqual([
      {
        alias: "effect",
        input: "effect",
        strategy: "clone-ignore",
        target: "Effect-TS/effect"
      },
      {
        alias: "convex",
        input: "convex",
        target: "get-convex/convex-js"
      },
      {
        alias: "convex",
        input: "convex",
        target: "get-convex/convex-helpers"
      }
    ])
  })

  test("uses per-target strategy recommendations when an alias expands", async () => {
    const entries = await Effect.runPromise(repositoryAliasEntriesFromDatabase(database))

    expect(expandAliasTargetsWith(entries, ["vscode"])).toEqual([
      {
        alias: "vscode",
        input: "vscode",
        strategy: "submodule",
        target: "microsoft/vscode"
      }
    ])
  })

  test("uses known strategy recommendations for direct repository inputs", async () => {
    const entries = await Effect.runPromise(repositoryAliasEntriesFromDatabase(database))

    expect(expandAliasTargetsWith(entries, ["https://github.com/microsoft/vscode.git"])).toEqual([
      {
        input: "https://github.com/microsoft/vscode.git",
        strategy: "submodule",
        target: "https://github.com/microsoft/vscode.git"
      }
    ])
  })
})
