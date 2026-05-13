import { Effect, FileSystem, Path } from "effect"

import {
  hasVendorFilter,
  includedTreePaths,
  parseGitTreeEntries,
  type VendorFilter
} from "../domain/vendor-filter.ts"
import { gitChecked } from "../services/git.ts"

export interface FilteredCheckoutParams {
  readonly cwd: string
  readonly filter: VendorFilter
  readonly ref: string
  readonly redactedUrl?: string
  readonly storedRemoteUrl?: string
  readonly target: string
  readonly url: string
}

export interface MaterializeFilteredRepoParams {
  readonly cwd: string
  readonly filter: VendorFilter
  readonly prefix: string
  readonly ref: string
  readonly url: string
}

const sparseCheckoutText = (paths: ReadonlyArray<string>): string =>
  paths.length === 0
    ? "# ingraft: filter selected no files\n"
    : `${paths.map((path) => `/${path}`).join("\n")}\n`

const targetPath = (cwd: string, target: string, path: Path.Path): string =>
  path.isAbsolute(target) ? target : path.resolve(cwd, target)

export const checkoutFilteredRepo = ({
  cwd,
  filter,
  ref,
  redactedUrl,
  storedRemoteUrl,
  target,
  url
}: FilteredCheckoutParams) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const absoluteTarget = targetPath(cwd, target, path)

    yield* fs.makeDirectory(path.dirname(absoluteTarget), { recursive: true }).pipe(Effect.ignore)
    const cloneOptions =
      redactedUrl === undefined
        ? { cwd }
        : {
            cwd,
            redactedArgs: [
              "clone",
              "--filter=blob:none",
              "--no-checkout",
              redactedUrl,
              absoluteTarget
            ] as const
          }
    yield* gitChecked(
      ["clone", "--filter=blob:none", "--no-checkout", url, absoluteTarget],
      cloneOptions
    )
    yield* gitChecked(["-C", absoluteTarget, "fetch", "--tags", "origin", ref], {
      cwd
    })

    if (!hasVendorFilter(filter)) {
      yield* gitChecked(["-C", absoluteTarget, "checkout", "FETCH_HEAD"], { cwd })
      if (storedRemoteUrl !== undefined) {
        yield* gitChecked(["-C", absoluteTarget, "remote", "set-url", "origin", storedRemoteUrl], {
          cwd
        })
      }
      return
    }

    const tree = yield* gitChecked(
      ["-C", absoluteTarget, "ls-tree", "-r", "-l", "--full-tree", "FETCH_HEAD"],
      { cwd }
    )
    const paths = includedTreePaths({
      entries: parseGitTreeEntries(tree.stdout),
      filter
    })

    yield* gitChecked(["-C", absoluteTarget, "sparse-checkout", "init", "--no-cone"], { cwd })
    yield* fs.writeFileString(
      path.resolve(absoluteTarget, ".git", "info", "sparse-checkout"),
      sparseCheckoutText(paths)
    )
    yield* gitChecked(["-C", absoluteTarget, "checkout", "FETCH_HEAD"], { cwd })
    if (storedRemoteUrl !== undefined) {
      yield* gitChecked(["-C", absoluteTarget, "remote", "set-url", "origin", storedRemoteUrl], {
        cwd
      })
    }
  })

export const materializeFilteredRepo = ({
  cwd,
  filter,
  prefix,
  ref,
  url
}: MaterializeFilteredRepoParams) =>
  Effect.scoped(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const tmp = yield* fs.makeTempDirectoryScoped({
        prefix: "ingraft-filter-"
      })
      const checkout = path.resolve(tmp, "repo")
      const target = path.resolve(cwd, prefix)

      yield* checkoutFilteredRepo({ cwd, filter, ref, target: checkout, url })
      yield* fs.remove(path.resolve(checkout, ".git"), {
        force: true,
        recursive: true
      })
      const materializedFiles = yield* fs.readDirectory(checkout, {
        recursive: true
      })
      if (materializedFiles.length === 0) {
        yield* fs.writeFileString(
          path.resolve(checkout, ".vendor-filter-empty"),
          "ingraft: filter selected no upstream files\n"
        )
      }
      yield* fs.remove(target, { force: true, recursive: true })
      yield* fs.makeDirectory(path.dirname(target), { recursive: true }).pipe(Effect.ignore)
      yield* fs.copy(checkout, target, { overwrite: true })
    })
  )
