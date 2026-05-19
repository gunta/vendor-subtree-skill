import { describe, expect, test } from "bun:test"
import { join } from "node:path"

const workspaceRoot = process.cwd()

const readJson = async <T>(path: string): Promise<T> =>
  JSON.parse(await Bun.file(join(workspaceRoot, path)).text()) as T

type PackageJson = {
  readonly bin?: Record<string, string>
  readonly name: string
}

describe("project naming", () => {
  test("uses ingraft as the project name", async () => {
    const rootPackage = await readJson<PackageJson>("package.json")
    const cliPackage = await readJson<PackageJson>("packages/cli/package.json")
    const aliasPackage = await readJson<PackageJson>("packages/ingraft/package.json")
    const skillPackage = await readJson<PackageJson>("packages/skill/package.json")
    const rootSkill = await Bun.file(join(workspaceRoot, "SKILL.md")).text()
    const packagedSkill = await Bun.file(join(workspaceRoot, "packages/skill/SKILL.md")).text()

    expect(rootPackage.name).toBe("ingraft-workspace")
    expect(cliPackage.name).toBe("@ingraft/cli")
    expect(aliasPackage.name).toBe("ingraft")
    expect(skillPackage.name).toBe("@ingraft/skill")
    expect(cliPackage.bin).toEqual({
      ingraft: "dist/bin/ingraft.js"
    })
    expect(rootSkill).toContain("name: ingraft")
    expect(packagedSkill).toContain("name: ingraft")

    for (const text of [rootSkill, packagedSkill]) {
      expect(text).not.toContain("ingraft-skill")
    }
  })
})
