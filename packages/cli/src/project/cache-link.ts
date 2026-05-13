import { createHash } from "node:crypto"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

import { Effect, FileSystem, Path } from "effect"

import { VendorStrategyCommandFailed } from "../domain/errors.ts"
import { hostedRepoFromInput } from "../domain/repo.ts"
import type { VendorStrategy } from "../domain/vendor-strategy.ts"
import { git, type GitResult } from "../services/git.ts"

export interface CacheLinkCacheEnv {
  readonly HOME?: string
  readonly INGRAFT_CACHE_DIR?: string
  readonly XDG_CACHE_HOME?: string
}

export interface CacheLinkEntryPathParams {
  readonly resolvedRef: string
  readonly root: string
  readonly url: string
}

export interface EnsureCacheLinkCheckoutParams {
  readonly action: "add" | "update"
  readonly cwd: string
  readonly ref: string
  readonly strategy: VendorStrategy
  readonly url: string
}

export interface LinkCacheCheckoutParams {
  readonly cachePath: string
  readonly cwd: string
  readonly prefix: string
}

export interface CacheLinkCheckout {
  readonly cachePath: string
  readonly resolvedRef: string
}

const hashText = (text: string): string => createHash("sha256").update(text).digest("hex")

const trimTrailingSlashes = (value: string): string => value.replace(/\/+$/, "")

const sanitizeSegment = (value: string): string => {
  const sanitized = value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "")
  return sanitized.length === 0 ? "unknown" : sanitized
}

const cachePathSegments = (url: string): ReadonlyArray<string> => {
  const hosted = hostedRepoFromInput(url)
  if (hosted === null) return ["generic", hashText(url).slice(0, 16)]
  return [hosted.host, ...hosted.path.split("/").map(sanitizeSegment)]
}

export const cacheLinkCacheRootFromEnv = (
  env: CacheLinkCacheEnv = process.env as CacheLinkCacheEnv
): string => {
  if (env.INGRAFT_CACHE_DIR && env.INGRAFT_CACHE_DIR.trim().length > 0) {
    return trimTrailingSlashes(env.INGRAFT_CACHE_DIR.trim())
  }
  const base =
    env.XDG_CACHE_HOME && env.XDG_CACHE_HOME.trim().length > 0
      ? env.XDG_CACHE_HOME.trim()
      : join(env.HOME ?? homedir(), ".cache")
  return join(base, "ingraft")
}

export const cacheLinkEntryPath = ({ resolvedRef, root, url }: CacheLinkEntryPathParams): string =>
  join(
    root,
    "repos",
    ...cachePathSegments(url),
    `${resolvedRef.slice(0, 12)}-${hashText(`${url}\0${resolvedRef}`).slice(0, 12)}`
  )

const lsRemoteLine = (line: string): { readonly ref: string; readonly sha: string } | null => {
  const [sha, ref] = line.trim().split(/\s+/, 2)
  if (!sha || !ref || !/^[a-f0-9]{40,64}$/i.test(sha)) return null
  return { ref, sha }
}

export const parseLsRemoteCommit = (stdout: string): string | null => {
  const refs = stdout.split(/\r?\n/).flatMap((line) => {
    const parsed = lsRemoteLine(line)
    return parsed === null ? [] : [parsed]
  })
  return refs.find((line) => line.ref.endsWith("^{}"))?.sha ?? refs[0]?.sha ?? null
}

const lsRemotePatterns = (ref: string): ReadonlyArray<string> => {
  const patterns = [ref]
  if (!ref.startsWith("refs/")) {
    patterns.push(`refs/heads/${ref}`, `refs/tags/${ref}`, `refs/tags/${ref}^{}`)
  }
  return patterns.filter((pattern, index) => patterns.indexOf(pattern) === index)
}

const strategyGitFailed = ({
  action,
  prefix,
  result,
  strategy
}: {
  readonly action: "add" | "update"
  readonly prefix: string
  readonly result: GitResult
  readonly strategy: VendorStrategy
}) =>
  new VendorStrategyCommandFailed({
    action,
    prefix,
    strategy,
    output: result.stderr.trim() || result.stdout.trim() || "unknown error"
  })

const checkedCacheGit = (
  args: ReadonlyArray<string>,
  {
    action,
    cwd,
    prefix,
    strategy
  }: {
    readonly action: "add" | "update"
    readonly cwd: string
    readonly prefix: string
    readonly strategy: VendorStrategy
  }
) =>
  git(args, { cwd }).pipe(
    Effect.filterOrFail(
      (result) => result.exitCode === 0,
      (result) => strategyGitFailed({ action, prefix, result, strategy })
    )
  )

const resolveRemoteCommit = ({
  cwd,
  ref,
  url
}: {
  readonly cwd: string
  readonly ref: string
  readonly url: string
}) =>
  git(["ls-remote", url, ...lsRemotePatterns(ref)], { cwd }).pipe(
    Effect.map((result) => (result.exitCode === 0 ? parseLsRemoteCommit(result.stdout) : null)),
    Effect.catch(() => Effect.succeed(null))
  )

const checkoutRef = ({
  action,
  cwd,
  ref,
  target,
  strategy
}: {
  readonly action: "add" | "update"
  readonly cwd: string
  readonly ref: string
  readonly target: string
  readonly strategy: VendorStrategy
}) =>
  Effect.gen(function* () {
    yield* checkedCacheGit(["-C", target, "fetch", "--tags", "origin", ref], {
      action,
      cwd,
      prefix: target,
      strategy
    })
    yield* checkedCacheGit(["-C", target, "checkout", "FETCH_HEAD"], {
      action,
      cwd,
      prefix: target,
      strategy
    })
  })

const revParseHead = ({
  action,
  cwd,
  strategy,
  target
}: {
  readonly action: "add" | "update"
  readonly cwd: string
  readonly strategy: VendorStrategy
  readonly target: string
}) =>
  checkedCacheGit(["-C", target, "rev-parse", "HEAD"], {
    action,
    cwd,
    prefix: target,
    strategy
  }).pipe(Effect.map((result) => result.stdout.trim()))

const moveTempCheckout = ({
  cachePath,
  fs,
  tempPath
}: {
  readonly cachePath: string
  readonly fs: FileSystem.FileSystem
  readonly tempPath: string
}) =>
  Effect.gen(function* () {
    const exists = yield* fs.exists(cachePath).pipe(Effect.catch(() => Effect.succeed(false)))
    if (exists) {
      yield* fs.remove(tempPath, { force: true, recursive: true })
      return
    }
    yield* fs.makeDirectory(dirname(cachePath), { recursive: true }).pipe(Effect.ignore)
    yield* fs.rename(tempPath, cachePath)
  })

const cloneCacheCheckout = ({
  action,
  cacheRoot,
  cwd,
  ref,
  strategy,
  url
}: {
  readonly action: "add" | "update"
  readonly cacheRoot: string
  readonly cwd: string
  readonly ref: string
  readonly strategy: VendorStrategy
  readonly url: string
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const tempRoot = join(cacheRoot, "tmp")
    yield* fs.makeDirectory(tempRoot, { recursive: true }).pipe(Effect.ignore)
    const tempPath = yield* fs.makeTempDirectory({
      directory: tempRoot,
      prefix: "cache-link-"
    })
    yield* checkedCacheGit(["clone", url, tempPath], {
      action,
      cwd,
      prefix: tempPath,
      strategy
    })
    yield* checkoutRef({ action, cwd, ref, strategy, target: tempPath })
    const resolvedRef = yield* revParseHead({ action, cwd, strategy, target: tempPath })
    const cachePath = cacheLinkEntryPath({ resolvedRef, root: cacheRoot, url })
    yield* moveTempCheckout({ cachePath, fs, tempPath })
    return { cachePath, resolvedRef } satisfies CacheLinkCheckout
  })

export const ensureCacheLinkCheckout = ({
  action,
  cwd,
  ref,
  strategy,
  url
}: EnsureCacheLinkCheckoutParams) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const cacheRoot = cacheLinkCacheRootFromEnv()
    const advertisedRef = yield* resolveRemoteCommit({ cwd, ref, url })
    if (advertisedRef !== null) {
      const cachePath = cacheLinkEntryPath({
        resolvedRef: advertisedRef,
        root: cacheRoot,
        url
      })
      const exists = yield* fs.exists(cachePath).pipe(Effect.catch(() => Effect.succeed(false)))
      if (exists) return { cachePath, resolvedRef: advertisedRef } satisfies CacheLinkCheckout
    }
    return yield* cloneCacheCheckout({ action, cacheRoot, cwd, ref, strategy, url })
  })

export const linkCacheCheckout = ({ cachePath, cwd, prefix }: LinkCacheCheckoutParams) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const target = path.resolve(cwd, prefix)
    yield* fs.makeDirectory(path.dirname(target), { recursive: true }).pipe(Effect.ignore)
    yield* fs.remove(target, { force: true, recursive: true }).pipe(Effect.ignore)
    yield* fs.symlink(cachePath, target)
  })
