import { spawn } from "node:child_process"
import { rewritePortlessDevServerUrls } from "./portless-output"

const DEFAULT_HOST = "127.0.0.1"
const DEFAULT_PORT = "4321"

const host = process.env.HOST?.trim() || DEFAULT_HOST
const port = process.env.PORT?.trim() || DEFAULT_PORT
const portlessUrl = process.env.PORTLESS_URL?.trim()

const portlessOrigin = (() => {
  if (!portlessUrl) return undefined
  try {
    return new URL(portlessUrl)
  } catch {
    return undefined
  }
})()

const args = ["dev", "--host", host, "--port", port]

if (portlessOrigin) {
  args.push("--allowed-hosts", portlessOrigin.hostname)
}

const child = spawn("astro", args, {
  env: process.env,
  stdio: ["inherit", "pipe", "pipe"]
})

const rewriteOutput = (chunk: Buffer): string =>
  rewritePortlessDevServerUrls(chunk.toString(), {
    host,
    port,
    publicOrigin: portlessOrigin?.origin
  })

child.stdout?.on("data", (chunk: Buffer) => {
  process.stdout.write(rewriteOutput(chunk))
})

child.stderr?.on("data", (chunk: Buffer) => {
  process.stderr.write(rewriteOutput(chunk))
})

const exitCode = await new Promise<number>((resolve, reject) => {
  child.on("error", reject)
  child.on("exit", (code) => resolve(code ?? 1))
})

process.exit(exitCode)
