import { Effect, Option } from "effect"

import { RepoNameInferenceFailed } from "./errors.ts"

export interface GitHubRepository {
  readonly owner: string
  readonly name: string
  readonly nameWithOwner: string
}

export type RepositoryHostKind =
  | "github"
  | "gitlab"
  | "bitbucket"
  | "codeberg"
  | "sourcehut"
  | "gitea"
  | "forgejo"
  | "generic"

export interface HostedRepository {
  readonly kind: RepositoryHostKind
  readonly host: string
  readonly name: string
  readonly path: string
  readonly cloneSpec: string
  readonly nameWithOwner?: string
}

const GITHUB_REPO_PART = "[A-Za-z0-9_.-]+"
const GITHUB_SHORTHAND = new RegExp(`^(${GITHUB_REPO_PART})\\/(${GITHUB_REPO_PART})$`)

export const normalizeRepoUrl = (input: string): string => {
  const trimmed = input.trim()
  if (GITHUB_SHORTHAND.test(trimmed)) {
    return `https://github.com/${trimmed}.git`
  }
  return trimmed
}

const githubRepo = (owner: string, name: string): GitHubRepository => ({
  owner,
  name,
  nameWithOwner: `${owner}/${name}`
})

const repoNameWithoutGit = (name: string): string =>
  name.endsWith(".git") ? name.slice(0, -4) : name

const hostKind = (host: string): RepositoryHostKind => {
  const normalized = host.toLowerCase()
  if (normalized === "github.com") return "github"
  if (normalized === "gitlab.com" || normalized.includes("gitlab")) {
    return "gitlab"
  }
  if (normalized === "bitbucket.org") return "bitbucket"
  if (normalized === "codeberg.org") return "codeberg"
  if (normalized === "git.sr.ht" || normalized.endsWith(".sr.ht")) {
    return "sourcehut"
  }
  if (normalized.includes("forgejo")) return "forgejo"
  if (normalized === "gitea.com" || normalized.includes("gitea")) return "gitea"
  return "generic"
}

const hostedRepo = ({
  cloneSpec,
  host,
  path
}: {
  readonly cloneSpec: string
  readonly host: string
  readonly path: string
}): HostedRepository | null => {
  const normalizedPath = path.replace(/^\/+|\/+$/g, "").replace(/\.git$/, "")
  const parts = normalizedPath.split("/").filter((part) => part.length > 0)
  const name = parts.at(-1)
  if (!name || parts.length < 2) return null

  const kind = hostKind(host)
  const base = {
    kind,
    host,
    name,
    path: normalizedPath,
    cloneSpec
  }

  return parts[0] && parts[1] ? { ...base, nameWithOwner: `${parts[0]}/${parts[1]}` } : base
}

export const hostedRepoFromInput = (input: string): HostedRepository | null => {
  const trimmed = input.trim()
  const shorthand = trimmed.match(GITHUB_SHORTHAND)
  if (shorthand?.[1] && shorthand[2]) {
    return hostedRepo({
      cloneSpec: `${shorthand[1]}/${repoNameWithoutGit(shorthand[2])}`,
      host: "github.com",
      path: `${shorthand[1]}/${repoNameWithoutGit(shorthand[2])}`
    })
  }

  const scpLike = trimmed.match(/^git@([^:]+):(.+)$/)
  if (scpLike?.[1] && scpLike[2]) {
    return hostedRepo({
      cloneSpec: trimmed,
      host: scpLike[1],
      path: scpLike[2]
    })
  }

  return Option.liftThrowable((value: string) => new URL(value))(trimmed).pipe(
    Option.flatMap((url) =>
      Option.fromNullishOr(
        hostedRepo({
          cloneSpec: trimmed,
          host: url.hostname,
          path: url.pathname
        })
      )
    ),
    Option.getOrNull
  )
}

export const githubRepoFromInput = (input: string): GitHubRepository | null => {
  const repo = hostedRepoFromInput(input)
  if (repo?.kind !== "github" || !repo.nameWithOwner) return null
  const [owner, name] = repo.nameWithOwner.split("/")
  return owner && name ? githubRepo(owner, name) : null
}

const withoutGitSuffix = (value: string): string =>
  value.endsWith(".git") ? value.slice(0, -4) : value

const pathFromRepoUrl = (value: string): string => {
  if (value.includes(":") && !value.includes("://")) {
    return value.split(":").slice(1).join(":")
  }
  if (!value.includes("://")) return value

  return Option.liftThrowable((url: string) => new URL(url).pathname)(value).pipe(
    Option.getOrElse(() => value)
  )
}

const nameFromPath = (path: string): Option.Option<string> =>
  Option.fromNullishOr(path.replace(/\/+$/, "").split("/").pop()).pipe(
    Option.filter((name) => name.length > 0)
  )

export const inferRepoName = (url: string) =>
  Option.match(nameFromPath(pathFromRepoUrl(withoutGitSuffix(url))), {
    onNone: () => Effect.fail(new RepoNameInferenceFailed({ url })),
    onSome: Effect.succeed
  })
