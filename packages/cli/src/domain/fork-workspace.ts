import path from "node:path"

import { Option } from "effect"

import { VENDOR_DIR } from "./constants.ts"
import type { GitHubRepository } from "./repo.ts"

export interface ForkRouteTargetParams {
  readonly forkOwner: string
  readonly name: Option.Option<string>
  readonly prefix: Option.Option<string>
  readonly upstream: GitHubRepository
}

export interface ForkRouteTarget {
  readonly name: string
  readonly prefix: string
  readonly url: string
}

export const defaultForkRoot = (cwd: string): string => {
  const parts = cwd.split(path.sep)
  const githubIndex = parts.lastIndexOf("GitHub")
  if (githubIndex >= 0) {
    const root = path.parse(cwd).root
    const relativeParts = root === "" ? parts : parts.slice(1)
    const adjustedIndex = root === "" ? githubIndex : githubIndex - 1
    return path.join(root, ...relativeParts.slice(0, adjustedIndex + 1), "forked")
  }
  return path.resolve(cwd, "..", "forked")
}

export const defaultForkCheckoutPath = ({
  cwd,
  root,
  upstream
}: {
  readonly cwd: string
  readonly root: Option.Option<string>
  readonly upstream: GitHubRepository
}): string =>
  path.resolve(
    Option.getOrElse(root, () => defaultForkRoot(cwd)),
    upstream.owner,
    upstream.name
  )

export const defaultForkVendorPrefix = (upstream: GitHubRepository): string =>
  `${VENDOR_DIR}/${upstream.owner}/${upstream.name}`

export const forkRouteName = (upstream: GitHubRepository, name: Option.Option<string>): string =>
  Option.getOrElse(name, () => upstream.name)

export const forkRemoteUrl = ({
  owner,
  repo
}: {
  readonly owner: string
  readonly repo: GitHubRepository
}): string => `https://github.com/${owner}/${repo.name}.git`

export const forkRouteTarget = ({
  forkOwner,
  name,
  prefix,
  upstream
}: ForkRouteTargetParams): ForkRouteTarget => ({
  name: forkRouteName(upstream, name),
  prefix: Option.getOrElse(prefix, () => defaultForkVendorPrefix(upstream)).replace(/\/+$/, ""),
  url: forkRemoteUrl({ owner: forkOwner, repo: upstream })
})
