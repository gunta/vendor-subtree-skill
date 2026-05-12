import { Effect, Option } from "effect"
import { RepoNameInferenceFailed } from "./errors.ts"

export const normalizeRepoUrl = (input: string): string => {
  const trimmed = input.trim()
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(trimmed)) {
    return `https://github.com/${trimmed}.git`
  }
  return trimmed
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
  Option.fromNullable(path.replace(/\/+$/, "").split("/").pop()).pipe(
    Option.filter((name) => name.length > 0)
  )

export const inferRepoName = (url: string) =>
  Option.match(nameFromPath(pathFromRepoUrl(withoutGitSuffix(url))), {
    onNone: () => Effect.fail(new RepoNameInferenceFailed({ url })),
    onSome: Effect.succeed
  })
