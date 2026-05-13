import * as nodeFs from "node:fs"

import { Context, Effect, Layer } from "effect"
import * as git from "isomorphic-git"

import { GitMetadataFailed } from "../domain/errors.ts"

export interface GitMetadataCommit {
  readonly message: string
  readonly oid: string
  readonly timestamp: number
}

const findRoot = (cwd: string): Effect.Effect<string, GitMetadataFailed> =>
  Effect.tryPromise({
    try: () => git.findRoot({ fs: nodeFs, filepath: cwd }),
    catch: (cause) => new GitMetadataFailed({ operation: "findRoot", cwd, cause })
  })

const listCommits = (
  cwd: string
): Effect.Effect<ReadonlyArray<GitMetadataCommit>, GitMetadataFailed> =>
  Effect.tryPromise({
    try: async () => {
      const commits = await git.log({ fs: nodeFs, dir: cwd })
      return commits.map((entry) => ({
        message: entry.commit.message,
        oid: entry.oid,
        timestamp: entry.commit.committer.timestamp
      }))
    },
    catch: (cause) => new GitMetadataFailed({ operation: "listCommits", cwd, cause })
  })

const listProjectFiles = (
  cwd: string
): Effect.Effect<ReadonlyArray<string>, GitMetadataFailed> =>
  Effect.tryPromise({
    try: async () => {
      const matrix = await git.statusMatrix({
        fs: nodeFs,
        dir: cwd,
        ignored: false
      })
      return matrix.map(([filepath]) => String(filepath))
    },
    catch: (cause) => new GitMetadataFailed({ operation: "listProjectFiles", cwd, cause })
  })

const pathKnownToGit = (
  cwd: string,
  filepath: string
): Effect.Effect<boolean, GitMetadataFailed> =>
  Effect.tryPromise({
    try: async () => {
      const status = await git.status({ fs: nodeFs, dir: cwd, filepath })
      return status !== "absent"
    },
    catch: (cause) => new GitMetadataFailed({ operation: "pathKnownToGit", cwd, filepath, cause })
  })

const isIgnored = (
  cwd: string,
  filepath: string
): Effect.Effect<boolean, GitMetadataFailed> =>
  Effect.tryPromise({
    try: () => git.isIgnored({ fs: nodeFs, dir: cwd, filepath }),
    catch: (cause) => new GitMetadataFailed({ operation: "isIgnored", cwd, filepath, cause })
  })

export interface GitMetadataShape {
  readonly findRoot: (cwd: string) => Effect.Effect<string, GitMetadataFailed>
  readonly isIgnored: (cwd: string, filepath: string) => Effect.Effect<boolean, GitMetadataFailed>
  readonly listCommits: (
    cwd: string
  ) => Effect.Effect<ReadonlyArray<GitMetadataCommit>, GitMetadataFailed>
  readonly listProjectFiles: (
    cwd: string
  ) => Effect.Effect<ReadonlyArray<string>, GitMetadataFailed>
  readonly pathKnownToGit: (
    cwd: string,
    filepath: string
  ) => Effect.Effect<boolean, GitMetadataFailed>
}

export class GitMetadata extends Context.Service<GitMetadata, GitMetadataShape>()(
  "ingraft/GitMetadata"
) {}

export const GitMetadataLive = Layer.sync(GitMetadata, () => ({
  findRoot,
  isIgnored,
  listCommits,
  listProjectFiles,
  pathKnownToGit
}))
