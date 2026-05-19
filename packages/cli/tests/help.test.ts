import { describe, expect, test } from "bun:test"

import { printRootHelp } from "../src/app/help.ts"

const captureStdout = (fn: () => void): string => {
  const originalWrite = process.stdout.write
  let output = ""
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += chunk.toString()
    return true
  }) as typeof process.stdout.write
  try {
    fn()
  } finally {
    process.stdout.write = originalWrite
  }
  return output
}

describe("root help", () => {
  test("lists every top-level workflow command", () => {
    const help = captureStdout(printRootHelp)

    expect(help).toContain("add-org")
    expect(help).toContain("fork")
    expect(help).toContain("editable fork checkout")
  })
})
