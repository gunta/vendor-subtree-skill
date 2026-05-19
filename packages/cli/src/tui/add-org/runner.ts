import { Effect, Option } from "effect"

import { addImpl, type AddCommandParams } from "../../commands/add.tsx"
import { sortOrgRepos } from "../../domain/org-sort.ts"
import type { OrgRepository } from "../../services/local-state.ts"
import { AddOrgAction, type AddOrgState } from "./state.ts"

export interface AddOrgRunOptions {
  readonly ref: Option.Option<string>
  readonly tag: Option.Option<string>
  readonly release: Option.Option<string>
}

export interface RunSelectedParams {
  readonly state: AddOrgState
  readonly dispatch: (action: AddOrgAction) => void
  readonly options: AddOrgRunOptions
}

const idOf = (repo: OrgRepository): string => `${repo.owner}/${repo.name}`

export const addOrgRepoParams = ({
  repo,
  state,
  ref,
  tag,
  release
}: {
  readonly repo: OrgRepository
  readonly state: AddOrgState
} & AddOrgRunOptions): AddCommandParams => ({
  repo: repo.url,
  ref,
  tag,
  release,
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
  name: Option.some(repo.name),
  strategy: state.strategy
})

export const runSelected = ({ state, dispatch, options }: RunSelectedParams) =>
  Effect.gen(function* () {
    const selected = sortOrgRepos(state.repos, state.sort).filter((repo) =>
      state.selected.has(idOf(repo))
    )
    dispatch(AddOrgAction.StartRun())
    yield* Effect.forEach(
      selected,
      (repo) =>
        Effect.gen(function* () {
          dispatch(AddOrgAction.TickProgress({ id: idOf(repo), status: "running" }))
          const result = yield* Effect.result(
            addImpl(addOrgRepoParams({ repo, state, ...options }))
          )
          dispatch(
            AddOrgAction.TickProgress({
              id: idOf(repo),
              status: result._tag === "Success" ? "success" : "error"
            })
          )
          if (result._tag === "Failure") {
            dispatch(
              AddOrgAction.AppendLog({ line: `error: ${idOf(repo)} ${String(result.failure)}` })
            )
          }
        }),
      { concurrency: state.concurrency, discard: true }
    )
    dispatch(AddOrgAction.FinishRun())
  })
