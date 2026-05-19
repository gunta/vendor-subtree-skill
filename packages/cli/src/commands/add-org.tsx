import { stdin, stdout } from "node:process"

import { Effect, Option } from "effect"
import { Argument, Command, Flag } from "effect/unstable/cli"

import { info, ok, warn, withCommandTelemetry } from "../app/log.tsx"
import { RuntimeConfig, type RuntimeConfigShape } from "../app/runtime.ts"
import { OrgFilterParseFailed } from "../domain/errors.ts"
import { filterOrgRepos, parseSince, type OrgFilter } from "../domain/org-filter.ts"
import { sortOrgRepos, type OrgRepoSort } from "../domain/org-sort.ts"
import { listVendored } from "../domain/vendor-state.ts"
import { type VendorStrategy } from "../domain/vendor-strategy.ts"
import { repoRoot } from "../services/git.ts"
import { GitHubOrg } from "../services/github-org.ts"
import { LocalState, type OrgRepository } from "../services/local-state.ts"
import { handleAddOrgKey } from "../tui/add-org/keyboard.ts"
import { renderAddOrg } from "../tui/add-org/render.ts"
import { runSelected } from "../tui/add-org/runner.ts"
import {
  AddOrgAction,
  createAddOrgState,
  dispatchAddOrg,
  type AddOrgState,
  vendoredOrgRepoIds
} from "../tui/add-org/state.ts"
import { addImpl } from "./add.tsx"

export interface AddOrgCommandParams {
  readonly owner: string
  readonly language: ReadonlyArray<string>
  readonly since: Option.Option<string>
  readonly includeArchived: boolean
  readonly includeForks: boolean
  readonly visibility: "public" | "private" | "internal" | "all"
  readonly yes: boolean
  readonly dryRun: boolean
  readonly refresh: boolean
  readonly sort?: OrgRepoSort
  readonly concurrency: number
  readonly strategy: VendorStrategy
  readonly ref: Option.Option<string>
  readonly tag: Option.Option<string>
  readonly release: Option.Option<string>
}

const CONCURRENCY_MAX = 32
const ORG_CACHE_TTL_MS = 60 * 60 * 1000

const clampConcurrency = (value: number) =>
  Math.max(1, Math.min(CONCURRENCY_MAX, Math.floor(value)))

const isFreshCache = (fetchedAt: string): boolean =>
  Date.now() - new Date(fetchedAt).getTime() < ORG_CACHE_TTL_MS

const shouldUseIcons = (runtime: RuntimeConfigShape): boolean => {
  if (!runtime.colors) return false
  const locale = runtime.env.LC_ALL ?? runtime.env.LC_CTYPE ?? runtime.env.LANG ?? ""
  return locale.toUpperCase() !== "C"
}

const discoverRepos = ({
  owner,
  refresh,
  sort
}: {
  readonly owner: string
  readonly refresh: boolean
  readonly sort: OrgRepoSort
}) =>
  Effect.gen(function* () {
    const cwd = yield* repoRoot
    const local = yield* LocalState
    const cached = yield* local.readOrgCache({ cwd, owner })
    if (!refresh && Option.isSome(cached) && isFreshCache(cached.value.fetchedAt)) {
      yield* info(`Using cached ${cached.value.repos.length} repos for ${owner}.`)
      return sortOrgRepos(cached.value.repos as ReadonlyArray<OrgRepository>, sort)
    }
    const gh = yield* GitHubOrg
    yield* info(`Fetching repository list for ${owner} from GitHub...`)
    const repos = yield* gh.listRepos({ owner })
    yield* local
      .writeOrgCache({
        cwd,
        cache: {
          schemaVersion: 1,
          owner,
          fetchedAt: new Date().toISOString(),
          repos,
          preferences: {
            language: [],
            since: null,
            excludeArchived: true,
            excludeForks: true,
            visibility: "all",
            selectedNames: []
          }
        }
      })
      .pipe(Effect.ignore)
    return sortOrgRepos(repos as ReadonlyArray<OrgRepository>, sort)
  })

const ensureFilter = (params: AddOrgCommandParams): OrgFilter => ({
  language: params.language,
  since: Option.getOrNull(params.since),
  excludeArchived: !params.includeArchived,
  excludeForks: !params.includeForks,
  visibility: params.visibility,
  search: ""
})

export const addOrgImpl = (params: AddOrgCommandParams) =>
  Effect.gen(function* () {
    if (Option.isSome(params.since)) {
      const parsed = parseSince(params.since.value)
      if (Option.isNone(parsed)) {
        return yield* Effect.fail(
          new OrgFilterParseFailed({
            flag: "--since",
            value: params.since.value,
            reason: "expected ISO date or relative duration (90d, 12w, 6m)"
          })
        )
      }
    }
    const sort = params.sort ?? "stars"
    const repos = yield* discoverRepos({
      owner: params.owner,
      refresh: params.refresh,
      sort
    })
    const filter = ensureFilter(params)
    const selected = filterOrgRepos(repos, filter)
    if (params.dryRun) {
      if (selected.length === 0) {
        yield* warn(`No repositories matched the filter under ${params.owner}.`)
        return
      }
      yield* info(`Adding ${selected.length} repositories from ${params.owner}...`)
      for (const repo of selected) yield* info(`would add ${repo.owner}/${repo.name}`)
      return
    }

    const concurrency = clampConcurrency(params.concurrency)

    if (!params.yes && stdin.isTTY && stdout.isTTY) {
      if (repos.length === 0) {
        yield* warn(`No repositories found under ${params.owner}.`)
        return
      }
      const cwd = yield* repoRoot
      const vendored = yield* listVendored(cwd)
      yield* launchAddOrgTui({
        owner: params.owner,
        repos,
        vendored: vendoredOrgRepoIds({ repos, vendored }),
        filters: filter,
        strategy: params.strategy,
        concurrency,
        sort,
        ref: params.ref,
        tag: params.tag,
        release: params.release
      })
      return
    }

    if (selected.length === 0) {
      yield* warn(`No repositories matched the filter under ${params.owner}.`)
      return
    }
    yield* info(`Adding ${selected.length} repositories from ${params.owner}...`)

    yield* Effect.forEach(
      selected,
      (repo) =>
        addImpl({
          // Pass the URL (not owner/name shorthand) so test fixtures that
          // mock the gh response with file:// URLs work, and so real gh
          // responses (HTTPS URLs) clone the actual remote rather than
          // re-resolving via the GitHub shorthand.
          repo: repo.url,
          ref: params.ref,
          tag: params.tag,
          release: params.release,
          syncPackage: Option.none(),
          cloudflareArtifact: false,
          cloudflareArtifactDepth: Option.none(),
          cloudflareArtifactName: Option.none(),
          exclude: [],
          excludeDirs: [],
          excludeExtensions: [],
          include: [],
          includeDirs: [],
          localOnly: false,
          maxFileSize: Option.none(),
          prefix: Option.none(),
          // Use the GitHub repo name as the durable source name so the
          // vendored entry is keyed by the upstream name rather than the
          // URL's trailing path segment.
          name: Option.some(repo.name),
          strategy: params.strategy
        }).pipe(
          Effect.catch((cause) =>
            warn(`Failed to add ${repo.owner}/${repo.name}: ${String(cause)}`)
          )
        ),
      { concurrency, discard: true }
    )

    yield* ok(`Processed ${selected.length} repos from ${params.owner}.`)
  }).pipe(withCommandTelemetry("add-org"))

const ownerArg = Argument.string("owner").pipe(
  Argument.withDescription("GitHub organization or user name to bulk vendor.")
)

const languageFlag = Flag.string("language").pipe(
  Flag.withDescription("Comma-separated languages to include (case-insensitive)."),
  Flag.optional
)

const sinceFlag = Flag.string("since").pipe(
  Flag.withDescription("Filter to repos pushed after this date (ISO or 90d/12w/6m)."),
  Flag.optional
)

const includeArchivedFlag = Flag.boolean("include-archived").pipe(
  Flag.withDescription("Include archived repositories. Default: skip.")
)

const includeForksFlag = Flag.boolean("include-forks").pipe(
  Flag.withDescription("Include forked repositories. Default: skip.")
)

const visibilityFlag = Flag.choiceWithValue("visibility", [
  ["public", "public"],
  ["private", "private"],
  ["internal", "internal"],
  ["all", "all"]
] as const).pipe(Flag.withDescription("Repository visibility filter."), Flag.optional)

const yesFlag = Flag.boolean("yes").pipe(
  Flag.withAlias("y"),
  Flag.withDescription("Skip the interactive TUI; use flag filters as-is.")
)

const dryRunFlag = Flag.boolean("dry-run").pipe(
  Flag.withDescription("Discover and filter only; do not clone.")
)

const refreshFlag = Flag.boolean("refresh").pipe(
  Flag.withDescription("Bypass the org repo-list cache.")
)

const sortFlag = Flag.choiceWithValue("sort", [
  ["stars", "stars"],
  ["name", "name"],
  ["alpha", "name"],
  ["alphabetical", "name"],
  ["pushed", "pushed"],
  ["recent", "pushed"],
  ["updated", "pushed"]
] as const).pipe(
  Flag.withDescription("Repository order. Choices: stars, name, pushed. Default: stars."),
  Flag.optional
)

const concurrencyFlag = Flag.string("concurrency").pipe(
  Flag.withDescription("Parallel clones. Default 8. Clamped to [1, 32]."),
  Flag.optional
)

const strategyFlag = Flag.choiceWithValue("strategy", [
  ["subtree", "subtree"],
  ["submodule", "submodule"],
  ["clone-ignore", "clone-ignore"],
  ["clone", "clone-ignore"],
  ["cache-link", "cache-link"]
] as const).pipe(
  Flag.withDescription("Vendoring strategy. Default for add-org: clone-ignore."),
  Flag.optional
)

const refFlag = Flag.string("ref").pipe(
  Flag.withAlias("r"),
  Flag.withDescription("Branch, tag, or commit to vendor. Default: upstream's default branch."),
  Flag.optional
)

const tagFlag = Flag.string("tag").pipe(
  Flag.withDescription("Git tag to vendor across every selected repo."),
  Flag.optional
)

const releaseFlag = Flag.string("release").pipe(
  Flag.withDescription("Host release to vendor across every selected repo."),
  Flag.optional
)

const splitLanguages = (value: Option.Option<string>): ReadonlyArray<string> =>
  Option.match(value, {
    onNone: () => [],
    onSome: (raw) =>
      raw
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
  })

const parseConcurrency = (value: Option.Option<string>): number =>
  Option.match(value, {
    onNone: () => 8,
    onSome: (raw) => {
      const parsed = Number.parseInt(raw, 10)
      return Number.isInteger(parsed) ? parsed : 8
    }
  })

export const addOrgCmd = Command.make(
  "add-org",
  {
    owner: ownerArg,
    language: languageFlag,
    since: sinceFlag,
    includeArchived: includeArchivedFlag,
    includeForks: includeForksFlag,
    visibility: visibilityFlag,
    yes: yesFlag,
    dryRun: dryRunFlag,
    refresh: refreshFlag,
    sort: sortFlag,
    concurrency: concurrencyFlag,
    strategy: strategyFlag,
    ref: refFlag,
    tag: tagFlag,
    release: releaseFlag
  },
  (params) =>
    addOrgImpl({
      owner: params.owner,
      language: splitLanguages(params.language),
      since: params.since,
      includeArchived: params.includeArchived,
      includeForks: params.includeForks,
      visibility: Option.getOrElse(params.visibility, () => "all" as const),
      yes: params.yes,
      dryRun: params.dryRun,
      refresh: params.refresh,
      sort: Option.getOrElse(params.sort, () => "stars" as const),
      concurrency: parseConcurrency(params.concurrency),
      strategy: Option.getOrElse(params.strategy, () => "clone-ignore" as const),
      ref: params.ref,
      tag: params.tag,
      release: params.release
    })
).pipe(
  Command.withDescription(
    "Discover every repository under a GitHub organization or user and vendor them into vendor/<owner>/<repo>."
  )
)

interface AddOrgTuiParams {
  readonly owner: string
  readonly repos: ReadonlyArray<OrgRepository>
  readonly vendored: ReadonlySet<string>
  readonly filters: OrgFilter
  readonly strategy: VendorStrategy
  readonly concurrency: number
  readonly sort?: OrgRepoSort
  readonly ref: Option.Option<string>
  readonly tag: Option.Option<string>
  readonly release: Option.Option<string>
}

export const createInitialAddOrgTuiState = (input: {
  readonly owner: string
  readonly repos: ReadonlyArray<OrgRepository>
  readonly vendored: ReadonlySet<string>
  readonly filters: OrgFilter
  readonly strategy: VendorStrategy
  readonly concurrency: number
  readonly sort?: OrgRepoSort
}): AddOrgState =>
  createAddOrgState({
    owner: input.owner,
    repos: input.repos,
    vendored: input.vendored,
    filters: input.filters,
    strategy: input.strategy,
    concurrency: input.concurrency,
    sort: input.sort ?? "stars"
  })

const writeFrame = (state: AddOrgState, runtime: RuntimeConfigShape): void => {
  // Clear screen + move cursor to home (ANSI escape sequences).
  stdout.write("[2J[H")
  for (const line of renderAddOrg(state, {
    colors: runtime.colors,
    height: stdout.rows ?? 24,
    icons: shouldUseIcons(runtime),
    width: stdout.columns ?? 100
  })) {
    stdout.write(`${line}\n`)
  }
}

// Stage 1: blocking raw-stdin keyboard loop. Resolves with the final state
// once the user either confirms (Enter -> mode === "running") or cancels
// (q -> mode === "browsing" or "done"). The Effect has no dependencies.
const runTuiKeyboardLoop = (initial: AddOrgState, runtime: RuntimeConfigShape) =>
  Effect.callback<AddOrgState>((resume) => {
    let state = initial

    const cleanup = () => {
      stdin.removeListener("data", onData)
      if (stdin.setRawMode) stdin.setRawMode(false)
      stdin.pause()
    }

    const onData = (chunk: Buffer) => {
      const key = chunk.toString("utf8")
      if (key === "") {
        // Ctrl-C: treat as cancel.
        cleanup()
        resume(Effect.succeed({ ...state, mode: "done" as const }))
        return
      }
      const action = handleAddOrgKey(key, state)
      if (action) {
        state = dispatchAddOrg(state, action)
        writeFrame(state, runtime)
      }
      // Confirming sequence: first Enter sets mode "confirming-run", second
      // sets "running". When we reach "running", the user has approved the
      // batch and we exit the loop so the runner can take over.
      if (state.mode === "running") {
        cleanup()
        resume(Effect.succeed(state))
        return
      }
      if (state.mode === "done") {
        cleanup()
        resume(Effect.succeed(state))
      }
    }

    if (stdin.setRawMode) stdin.setRawMode(true)
    stdin.resume()
    stdin.on("data", onData)
    writeFrame(state, runtime)

    // Interruption cleanup.
    return Effect.sync(() => cleanup())
  })

const launchAddOrgTui = ({
  owner,
  repos,
  vendored,
  filters,
  strategy,
  concurrency,
  sort,
  ref,
  tag,
  release
}: AddOrgTuiParams) =>
  Effect.gen(function* () {
    const runtime = yield* RuntimeConfig
    const initial = createInitialAddOrgTuiState({
      owner,
      repos,
      vendored,
      filters,
      strategy,
      concurrency,
      sort: sort ?? "stars"
    })

    let state = yield* runTuiKeyboardLoop(initial, runtime)
    if (state.mode !== "running") return

    // Stage 2: run selected repos. Dispatch updates state + re-renders.
    const dispatch = (action: AddOrgAction) => {
      state = dispatchAddOrg(state, action)
      writeFrame(state, runtime)
    }
    yield* runSelected({ state, dispatch, options: { ref, tag, release } })
    yield* ok(`Processed ${state.selected.size} repos from ${owner}.`)
  })
