import { existsSync, mkdirSync } from "node:fs"
import path from "node:path"

import { Console, Effect, Option } from "effect"
import { Argument, Command, Flag } from "effect/unstable/cli"

import { info, ok, withCommandTelemetry } from "../app/log.tsx"
import {
  ForkWorkspaceFailed,
  GitCommandFailed,
  GitHubCliMissing,
  InvalidAddTargets
} from "../domain/errors.ts"
import {
  readForkWorkspaceState,
  upsertForkWorkspaceEntry,
  type ForkWorkspaceEntry
} from "../domain/fork-state.ts"
import {
  defaultForkCheckoutPath,
  forkRemoteUrl,
  forkRouteTarget,
  type ForkRouteTarget
} from "../domain/fork-workspace.ts"
import { githubRepoFromInput, type GitHubRepository } from "../domain/repo.ts"
import { findByName } from "../domain/vendor-state.ts"
import { GitHubCli, type GitHubCliResult } from "../services/gh.ts"
import { assertCleanTree, Git, repoRoot } from "../services/git.ts"
import { addImpl } from "./add.tsx"

export interface ForkCommandParams {
  readonly checkoutRoot: Option.Option<string>
  readonly name: Option.Option<string>
  readonly owner: Option.Option<string>
  readonly prefix: Option.Option<string>
  readonly upstream: string
}

export interface ForkStatusCommandParams {
  readonly json: boolean
}

export interface PrepareForkWorkspaceParams {
  readonly checkoutRoot: Option.Option<string>
  readonly cwd: string
  readonly owner: Option.Option<string>
  readonly upstreamInput: string
}

export interface PreparedForkWorkspace {
  readonly checkoutPath: string
  readonly fork: GitHubRepository
  readonly forkUrl: string
  readonly route: ForkRouteTarget
  readonly upstream: GitHubRepository
  readonly upstreamUrl: string
}

const forkRepoArg = Argument.string("upstream").pipe(
  Argument.withDescription("GitHub repository to fork, for example Effect-TS/effect.")
)

const forkOwnerOption = Flag.string("owner").pipe(
  Flag.withDescription("GitHub user or organization that should own the fork."),
  Flag.optional
)

const forkCheckoutRootOption = Flag.string("checkout-root").pipe(
  Flag.withDescription(
    "Directory that stores editable fork checkouts. Defaults to a sibling forked/ workspace."
  ),
  Flag.optional
)

const forkNameOption = Flag.string("name").pipe(
  Flag.withDescription("Durable source route name. Defaults to the upstream repository name."),
  Flag.optional
)

const forkPrefixOption = Flag.string("prefix").pipe(
  Flag.withDescription(
    "Read-only vendor projection path. Defaults to vendor/<upstream-owner>/<repo>."
  ),
  Flag.optional
)

const forkStatusJsonOption = Flag.boolean("json").pipe(
  Flag.withDescription("Output machine-readable JSON to stdout.")
)

const isAuthError = (stderr: string): boolean => {
  const lower = stderr.toLowerCase()
  return lower.includes("authentication") || lower.includes("gh auth login")
}

const ghFailure = (action: string, result: GitHubCliResult) =>
  new ForkWorkspaceFailed({
    action,
    detail: result.stderr.trim() || result.stdout.trim() || `gh exited ${result.exitCode}`
  })

const ghChecked = (args: ReadonlyArray<string>, action: string) =>
  Effect.gen(function* () {
    const gh = yield* GitHubCli
    const result = yield* gh
      .exec(args)
      .pipe(Effect.catch((cause) => Effect.fail(new GitHubCliMissing({ cause }))))
    if (result.exitCode !== 0) {
      if (isAuthError(result.stderr)) {
        return yield* Effect.fail(
          new ForkWorkspaceFailed({
            action,
            detail: result.stderr
          })
        )
      }
      return yield* Effect.fail(ghFailure(action, result))
    }
    return result
  })

const gitFailure = (
  args: ReadonlyArray<string>,
  cwd: string | undefined,
  result: { readonly exitCode: number; readonly stdout: string; readonly stderr: string }
) =>
  new GitCommandFailed({
    args,
    ...(cwd === undefined ? {} : { cwd }),
    exitCode: result.exitCode,
    output: result.stderr.trim() || result.stdout.trim() || "unknown error"
  })

const gitChecked = (args: ReadonlyArray<string>, cwd?: string) =>
  Effect.gen(function* () {
    const git = yield* Git
    const result = yield* git.exec(args, cwd === undefined ? {} : { cwd })
    if (result.exitCode !== 0) return yield* Effect.fail(gitFailure(args, cwd, result))
    return result
  })

const ghLogin = () =>
  ghChecked(["api", "user", "--jq", ".login"], "read authenticated GitHub user").pipe(
    Effect.map((result) => result.stdout.trim()),
    Effect.filterOrFail(
      (login) => login.length > 0,
      () =>
        new ForkWorkspaceFailed({
          action: "read authenticated GitHub user",
          detail: "gh returned an empty login."
        })
    )
  )

const ensureGitHubFork = ({
  forkOwner,
  login,
  upstream
}: {
  readonly forkOwner: string
  readonly login: string
  readonly upstream: GitHubRepository
}) =>
  Effect.gen(function* () {
    const forkNameWithOwner = `${forkOwner}/${upstream.name}`
    const existing = yield* Effect.gen(function* () {
      const gh = yield* GitHubCli
      return yield* gh.exec(["repo", "view", forkNameWithOwner, "--json", "nameWithOwner"])
    }).pipe(Effect.catch(() => Effect.succeed({ stdout: "", stderr: "", exitCode: 1 })))
    if (existing.exitCode === 0) return

    const args =
      forkOwner === login
        ? ["repo", "fork", upstream.nameWithOwner, "--clone=false", "--remote=false"]
        : [
            "repo",
            "fork",
            upstream.nameWithOwner,
            "--org",
            forkOwner,
            "--clone=false",
            "--remote=false"
          ]
    yield* ghChecked(args, `fork ${upstream.nameWithOwner}`)
  })

const ensureForkCheckout = ({
  checkoutPath,
  forkUrl,
  upstreamUrl
}: {
  readonly checkoutPath: string
  readonly forkUrl: string
  readonly upstreamUrl: string
}) =>
  Effect.gen(function* () {
    if (!existsSync(checkoutPath)) {
      mkdirSync(path.dirname(checkoutPath), { recursive: true })
      yield* gitChecked(["clone", forkUrl, checkoutPath])
    } else if (!existsSync(path.join(checkoutPath, ".git"))) {
      return yield* Effect.fail(
        new ForkWorkspaceFailed({
          action: "reuse checkout",
          detail: `${checkoutPath} exists but is not a git checkout.`
        })
      )
    }

    yield* gitChecked(["remote", "set-url", "origin", forkUrl], checkoutPath)
    const upstreamRemote = yield* Effect.gen(function* () {
      const git = yield* Git
      return yield* git.exec(["remote", "get-url", "upstream"], { cwd: checkoutPath })
    })
    yield* upstreamRemote.exitCode === 0
      ? gitChecked(["remote", "set-url", "upstream", upstreamUrl], checkoutPath)
      : gitChecked(["remote", "add", "upstream", upstreamUrl], checkoutPath)
  })

export const prepareForkWorkspace = ({
  checkoutRoot,
  cwd,
  owner,
  upstreamInput
}: PrepareForkWorkspaceParams) =>
  Effect.gen(function* () {
    const upstream = githubRepoFromInput(upstreamInput)
    if (upstream === null) {
      return yield* Effect.fail(
        new InvalidAddTargets({
          reason: "ingraft fork supports GitHub repositories in v1.",
          targets: [upstreamInput]
        })
      )
    }

    const login = yield* ghLogin()
    const forkOwner = Option.getOrElse(owner, () => login)
    const fork = {
      owner: forkOwner,
      name: upstream.name,
      nameWithOwner: `${forkOwner}/${upstream.name}`
    } satisfies GitHubRepository
    const forkUrl = forkRemoteUrl({ owner: forkOwner, repo: upstream })
    const upstreamUrl = forkRemoteUrl({ owner: upstream.owner, repo: upstream })
    const checkoutPath = defaultForkCheckoutPath({ cwd, root: checkoutRoot, upstream })
    const route = forkRouteTarget({
      forkOwner,
      name: Option.none(),
      prefix: Option.none(),
      upstream
    })

    yield* ensureGitHubFork({ forkOwner, login, upstream })
    yield* ensureForkCheckout({ checkoutPath, forkUrl, upstreamUrl })

    return {
      checkoutPath,
      fork,
      forkUrl,
      route,
      upstream,
      upstreamUrl
    } satisfies PreparedForkWorkspace
  })

export const forkImpl = ({ checkoutRoot, name, owner, prefix, upstream }: ForkCommandParams) =>
  Effect.gen(function* () {
    const cwd = yield* repoRoot
    yield* assertCleanTree(cwd)
    const prepared = yield* prepareForkWorkspace({
      checkoutRoot,
      cwd,
      owner,
      upstreamInput: upstream
    })
    const route = forkRouteTarget({
      forkOwner: prepared.fork.owner,
      name,
      prefix,
      upstream: prepared.upstream
    })

    const existing = yield* findByName({ cwd, name: route.name })
    if (Option.isNone(existing)) {
      yield* addImpl({
        cloudflareArtifact: false,
        cloudflareArtifactDepth: Option.none(),
        cloudflareArtifactName: Option.none(),
        exclude: [],
        excludeDirs: [],
        excludeExtensions: [],
        include: [],
        includeDirs: [],
        localOnly: true,
        maxFileSize: Option.none(),
        name: Option.some(route.name),
        prefix: Option.some(route.prefix),
        ref: Option.none(),
        release: Option.none(),
        repo: route.url,
        strategy: "cache-link",
        syncPackage: Option.none(),
        tag: Option.none()
      })
    } else if (existing.value.prefix !== route.prefix || existing.value.url !== route.url) {
      return yield* Effect.fail(
        new ForkWorkspaceFailed({
          action: "register vendor projection",
          detail: `Route '${route.name}' already exists at ${existing.value.prefix} for ${existing.value.url}. Choose --name or --prefix, or remove the existing route first.`
        })
      )
    } else {
      yield* info(`Reusing existing read-only vendor projection at ${route.prefix}/.`)
    }

    yield* upsertForkWorkspaceEntry({
      cwd,
      entry: {
        checkoutPath: prepared.checkoutPath,
        fork: prepared.fork.nameWithOwner,
        forkUrl: prepared.forkUrl,
        name: route.name,
        prefix: route.prefix,
        updatedAt: new Date().toISOString(),
        upstream: prepared.upstream.nameWithOwner,
        upstreamUrl: prepared.upstreamUrl
      }
    })

    yield* ok(`Fork workspace ready: edit ${prepared.checkoutPath}; read ${route.prefix}/.`)
  }).pipe(withCommandTelemetry("fork"))

const renderForkStatus = (entries: ReadonlyArray<ForkWorkspaceEntry>): string => {
  if (entries.length === 0) return "No fork workspaces recorded."
  return entries
    .map(
      (entry) =>
        `${entry.name}\n  upstream  ${entry.upstream}\n  fork      ${entry.fork}\n  checkout  ${entry.checkoutPath}\n  vendor    ${entry.prefix}`
    )
    .join("\n\n")
}

export const forkStatusImpl = ({ json }: ForkStatusCommandParams) =>
  Effect.gen(function* () {
    const cwd = yield* repoRoot
    const forks = yield* readForkWorkspaceState({ cwd })
    yield* Console.log(json ? JSON.stringify({ forks }, null, 2) : renderForkStatus(forks))
  }).pipe(withCommandTelemetry("fork-status"))

const forkStatusCmd = Command.make("status", { json: forkStatusJsonOption }, forkStatusImpl).pipe(
  Command.withDescription("Show recorded fork workspaces and their read-only vendor projections.")
)

export const forkCmd = Command.make(
  "fork",
  {
    checkoutRoot: forkCheckoutRootOption,
    name: forkNameOption,
    owner: forkOwnerOption,
    prefix: forkPrefixOption,
    upstream: forkRepoArg
  },
  forkImpl
).pipe(
  Command.withDescription(
    "Create or reuse an editable GitHub fork checkout beside this repo, then expose it as read-only local vendor context."
  ),
  Command.withSubcommands([forkStatusCmd])
)
