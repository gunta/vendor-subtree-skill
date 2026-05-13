import { describe, expect, test } from "bun:test"
import { join } from "node:path"

const workspaceRoot = process.cwd()

const readJson = async <T>(path: string): Promise<T> =>
  JSON.parse(await Bun.file(join(workspaceRoot, path)).text()) as T

type PackageJson = {
  readonly devDependencies?: Record<string, string>
  readonly portless?: unknown
  readonly scripts?: Record<string, string>
}

type TurboJson = {
  readonly tasks?: Record<string, unknown>
}

describe("workspace dev tooling", () => {
  test("routes monorepo tasks through Turborepo without hiding direct package scripts", async () => {
    const rootPackage = await readJson<PackageJson>("package.json")
    const turboConfig = await readJson<TurboJson>("turbo.json")
    const gitignore = await Bun.file(join(workspaceRoot, ".gitignore")).text()

    expect(rootPackage.devDependencies).toMatchObject({
      portless: expect.any(String),
      turbo: expect.any(String)
    })
    expect(rootPackage.scripts).toMatchObject({
      build: "turbo run build",
      check: "turbo run check check:root",
      "check:root": "bun run lint && bun run format:check",
      "dev:website": "turbo run dev --filter=ingraft-website",
      "dev:website:local": "bun run --cwd packages/website dev:app",
      test: "turbo run test",
      tui: "bun run dev:tui",
      typecheck: "turbo run typecheck",
      vendor: "bun packages/cli/scripts/vendor.ts",
      website: "bun run dev:website",
      "website:build": "bun run build:website"
    })

    expect(turboConfig.tasks).toMatchObject({
      build: {
        dependsOn: ["^build"],
        outputs: ["dist/**"]
      },
      dev: {
        cache: false,
        persistent: true
      },
      check: {},
      "//#check:root": {}
    })
    expect(gitignore).toContain(".turbo/")
  })

  test("runs the website dev server through Portless with an Astro fallback", async () => {
    const websitePackage = await readJson<PackageJson>("packages/website/package.json")
    const astroConfig = await Bun.file(
      join(workspaceRoot, "packages/website/astro.config.mjs")
    ).text()
    const devScript = await Bun.file(join(workspaceRoot, "packages/website/scripts/dev.ts")).text()

    expect(websitePackage.scripts).toMatchObject({
      dev: "portless",
      "dev:app": "bun scripts/dev.ts",
      "dev:local": "bun run dev:app"
    })
    expect(websitePackage.portless).toEqual({
      name: "ingraft",
      script: "dev:app"
    })
    expect(devScript).toContain("PORTLESS_URL")
    expect(devScript).toContain("--port")
    expect(devScript).toContain("--allowed-hosts")
    expect(astroConfig).toContain('cacheDir: ".astro/vite"')
    expect(astroConfig).toContain("strictPort: true")
    expect(astroConfig).toContain("PORTLESS_URL")
  })

  test("rewrites Astro dev server URLs to the Portless origin", async () => {
    const { rewritePortlessDevServerUrls } = (await import(
      new URL("../../website/scripts/portless-output.ts", import.meta.url).href
    )) as {
      readonly rewritePortlessDevServerUrls: (
        output: string,
        options: { readonly host: string; readonly port: string; readonly publicOrigin?: string }
      ) => string
    }

    const output = rewritePortlessDevServerUrls("┃ Local    http://127.0.0.1:4534/\n", {
      host: "127.0.0.1",
      port: "4534",
      publicOrigin: "https://ingraft.localhost"
    })

    expect(output).toBe("┃ Local    https://ingraft.localhost/\n")
  })

  test("loads the Astro config without Portless environment variables", async () => {
    const originalPortlessUrl = process.env.PORTLESS_URL
    const originalPort = process.env.PORT
    const originalHost = process.env.HOST
    delete process.env.PORTLESS_URL
    delete process.env.PORT
    delete process.env.HOST
    try {
      const config = (
        (await import(new URL("../../website/astro.config.mjs", import.meta.url).href)) as {
          readonly default: { readonly server: unknown }
        }
      ).default
      expect(config.server).toMatchObject({
        host: "127.0.0.1",
        port: 4321
      })
    } finally {
      if (originalPortlessUrl === undefined) delete process.env.PORTLESS_URL
      else process.env.PORTLESS_URL = originalPortlessUrl
      if (originalPort === undefined) delete process.env.PORT
      else process.env.PORT = originalPort
      if (originalHost === undefined) delete process.env.HOST
      else process.env.HOST = originalHost
    }
  })
})
