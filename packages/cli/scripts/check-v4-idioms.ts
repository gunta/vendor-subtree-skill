#!/usr/bin/env bun
import { readdir, readFile } from "node:fs/promises"
import { resolve, relative, sep } from "node:path"

interface Rule {
  readonly name: string
  readonly pattern: RegExp
  readonly allow?: (filePath: string) => boolean
}

const ALLOW_RUNTIME = (p: string) =>
  p.endsWith(`src${sep}app${sep}runtime.ts`) || p.endsWith(`src${sep}cli.tsx`)
const ALLOW_INK_OR_TEST = (p: string) =>
  p.includes(`src${sep}app${sep}ink${sep}`) || p.includes(`tests${sep}`)

const rules: ReadonlyArray<Rule> = [
  {
    name: "Effect.promise (use Effect.tryPromise with a tagged error)",
    pattern: /\bEffect\.promise\s*\(/
  },
  { name: "Effect.catchAll (v4: Effect.catch)", pattern: /\bEffect\.catchAll\b/ },
  { name: "Effect.catchAllCause (v4: Effect.catchCause)", pattern: /\bEffect\.catchAllCause\b/ },
  { name: "Effect.catchAllDefect (v4: Effect.catchDefect)", pattern: /\bEffect\.catchAllDefect\b/ },
  { name: "Effect.catchSome (v4: Effect.catchFilter)", pattern: /\bEffect\.catchSome\b/ },
  { name: "Effect.Service (v4: Context.Service + Layer)", pattern: /\bEffect\.Service\b/ },
  { name: "Context.Tag (v4: Context.Service)", pattern: /\bContext\.Tag\s*\(/ },
  { name: "Context.GenericTag (v4: Context.Service)", pattern: /\bContext\.GenericTag\b/ },
  { name: "Scope.extend (v4: Scope.provide)", pattern: /\bScope\.extend\b/ },
  { name: "FiberRef (v4: Context.Reference)", pattern: /\bFiberRef\.\b/ },
  { name: "Either (v4: Result)", pattern: /\bEither\b/ },
  {
    name: "Untyped error channel Effect.Effect<X, unknown>",
    pattern: /Effect\.Effect<[^>]*,\s*unknown[\s,>]/
  },
  { name: "@effect/cli import (v4: effect/unstable/cli)", pattern: /from\s+["']@effect\/cli["']/ },
  { name: "@effect/platform import (v4: effect)", pattern: /from\s+["']@effect\/platform["']/ },
  { name: "@effect/schema import (v4: effect Schema)", pattern: /from\s+["']@effect\/schema["']/ },
  {
    name: "Raw process.* access (route through RuntimeConfig)",
    pattern: /\bprocess\.(env|argv|cwd|exit|exitCode)\b/,
    allow: ALLOW_RUNTIME
  },
  {
    name: "Stray console.* (use Effect.log* or Ink)",
    pattern: /\bconsole\.(log|warn|error|debug)\s*\(/,
    allow: ALLOW_INK_OR_TEST
  }
]

const walk = async (dir: string): Promise<ReadonlyArray<string>> => {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: Array<string> = []
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist") continue
    const path = resolve(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await walk(path)))
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(path)
  }
  return files
}

const repoRoot = resolve(import.meta.dir, "..")
const targets = await walk(resolve(repoRoot, "src"))
const violations: Array<string> = []

for (const file of targets) {
  const text = await readFile(file, "utf-8")
  const lines = text.split("\n")
  for (const rule of rules) {
    if (rule.allow?.(file)) continue
    lines.forEach((line, i) => {
      if (rule.pattern.test(line)) {
        violations.push(`${relative(repoRoot, file)}:${i + 1}  ${rule.name}\n    ${line.trim()}`)
      }
    })
  }
}

if (violations.length > 0) {
  console.error(`Effect v4 idiom check failed (${violations.length} violations):\n`)
  for (const v of violations) console.error(v + "\n")
  process.exit(1)
}
console.log(`Effect v4 idiom check passed (${targets.length} files scanned).`)
