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

export interface RepositoryTargetInput {
  readonly ref: Option.Option<string>
  readonly url: string
}

const GITHUB_REPO_PART = "[A-Za-z0-9_.-]+"
const GITHUB_SHORTHAND = new RegExp(`^(${GITHUB_REPO_PART})\\/(${GITHUB_REPO_PART})$`)

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

const decodePathRef = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

interface HostedPathRoute {
  readonly path: string
  readonly ref?: string
}

const splitHostedPathRoute = (host: string, path: string): HostedPathRoute => {
  const normalizedPath = path.replace(/^\/+|\/+$/g, "").replace(/\.git$/, "")
  const parts = normalizedPath.split("/").filter((part) => part.length > 0)
  const kind = hostKind(host)

  if (kind === "github" && parts.length >= 4 && parts[2] === "tree") {
    return {
      path: parts.slice(0, 2).join("/"),
      ref: decodePathRef(parts.slice(3).join("/"))
    }
  }

  if (kind === "gitlab") {
    const marker = parts.findIndex((part, index) => index >= 2 && part === "-")
    if (marker !== -1 && parts[marker + 1] === "tree" && parts.length > marker + 2) {
      return {
        path: parts.slice(0, marker).join("/"),
        ref: decodePathRef(parts.slice(marker + 2).join("/"))
      }
    }
  }

  return { path: normalizedPath }
}

const cloneUrlFromHostedRoute = (input: string, path: string): string => {
  const cloneUrl = new URL(input)
  cloneUrl.pathname = `/${path.replace(/\.git$/, "")}.git`
  cloneUrl.search = ""
  cloneUrl.hash = ""
  return cloneUrl.toString()
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

interface ParsedHostedRepoInput {
  readonly cloneUrl: string
  readonly ref: Option.Option<string>
  readonly repo: HostedRepository
}

const parsedHostedRepoInput = (trimmed: string): ParsedHostedRepoInput | null => {
  const shorthand = trimmed.match(GITHUB_SHORTHAND)
  if (shorthand?.[1] && shorthand[2]) {
    const repo = hostedRepo({
      cloneSpec: `${shorthand[1]}/${repoNameWithoutGit(shorthand[2])}`,
      host: "github.com",
      path: `${shorthand[1]}/${repoNameWithoutGit(shorthand[2])}`
    })
    return repo === null
      ? null
      : {
          cloneUrl: `https://github.com/${repo.path}.git`,
          ref: Option.none(),
          repo
        }
  }

  const scpLike = trimmed.match(/^git@([^:]+):(.+)$/)
  if (scpLike?.[1] && scpLike[2]) {
    const repo = hostedRepo({
      cloneSpec: trimmed,
      host: scpLike[1],
      path: scpLike[2]
    })
    return repo === null
      ? null
      : {
          cloneUrl: trimmed,
          ref: Option.none(),
          repo
        }
  }

  return Option.liftThrowable((value: string) => new URL(value))(trimmed).pipe(
    Option.flatMap((url) => {
      const route = splitHostedPathRoute(url.hostname, url.pathname)
      const cloneSpec =
        route.ref === undefined ? trimmed : cloneUrlFromHostedRoute(trimmed, route.path)
      return Option.fromNullishOr(
        hostedRepo({
          cloneSpec,
          host: url.hostname,
          path: route.path
        })
      ).pipe(
        Option.map((repo) => ({
          cloneUrl: cloneSpec,
          ref: Option.fromNullishOr(route.ref),
          repo
        }))
      )
    }),
    Option.getOrNull
  )
}

const splitExplicitRefSuffix = (
  input: string
): { readonly input: string; readonly ref: Option.Option<string> } => {
  const at = input.lastIndexOf("@")
  if (at <= 0 || at === input.length - 1) {
    return { input, ref: Option.none() }
  }

  const candidateInput = input.slice(0, at)
  const candidateRef = input.slice(at + 1).trim()
  if (candidateRef.length === 0 || parsedHostedRepoInput(candidateInput) === null) {
    return { input, ref: Option.none() }
  }

  return {
    input: candidateInput,
    ref: Option.some(candidateRef)
  }
}

export const repositoryTargetFromInput = (input: string): RepositoryTargetInput | null => {
  const trimmed = input.trim()
  const explicit = splitExplicitRefSuffix(trimmed)
  const parsed = parsedHostedRepoInput(explicit.input)
  if (parsed === null) return null

  return {
    ref: Option.isSome(explicit.ref) ? explicit.ref : parsed.ref,
    url: parsed.cloneUrl
  }
}

export const normalizeRepoUrl = (input: string): string =>
  repositoryTargetFromInput(input)?.url ?? input.trim()

export const hostedRepoFromInput = (input: string): HostedRepository | null => {
  const trimmed = input.trim()
  const explicit = splitExplicitRefSuffix(trimmed)
  return parsedHostedRepoInput(explicit.input)?.repo ?? null
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
  Option.match(
    Option.fromNullishOr(hostedRepoFromInput(url)?.name).pipe(
      Option.orElse(() => nameFromPath(pathFromRepoUrl(withoutGitSuffix(url))))
    ),
    {
      onNone: () => Effect.fail(new RepoNameInferenceFailed({ url })),
      onSome: Effect.succeed
    }
  )
