import { filteredRepos, type AddOrgState } from "./state.ts"

const truncate = (value: string, max: number): string =>
  value.length <= max ? value.padEnd(max, " ") : `${value.slice(0, max - 1)}…`

const formatPushed = (pushedAt: string | null): string => {
  if (pushedAt === null) return "      —"
  const ms = Date.now() - new Date(pushedAt).getTime()
  const days = Math.floor(ms / (1000 * 60 * 60 * 24))
  if (days < 1) return "today"
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

export const renderAddOrg = (state: AddOrgState): ReadonlyArray<string> => {
  const visible = filteredRepos(state)
  const header = [
    `── ingraft add-org ─ ${state.owner} ─────────`,
    `language=${state.filters.language.join(",") || "-"}  since=${state.filters.since ?? "-"}  visibility=${state.filters.visibility}`,
    `[${state.filters.excludeArchived ? "x" : " "}] skip archived   [${state.filters.excludeForks ? "x" : " "}] skip forks`,
    `${state.selected.size} selected   strategy=${state.strategy}   concurrency=${state.concurrency}`,
    "j/k move  space select  a all  c clear  A/F toggle filters  enter run  q cancel",
    "──────────────────────────────────────────────"
  ]
  const rows = visible.map((repo, index) => {
    const id = `${repo.owner}/${repo.name}`
    const cursor = index === state.focusedIndex ? ">" : " "
    const checked = state.selected.has(id) ? "x" : " "
    const tag = state.vendored.has(id) ? "[added]" : "       "
    const status = state.runProgress.get(id) ?? "       "
    return `${cursor} [${checked}] ${truncate(id, 36)} ${truncate(repo.primaryLanguage ?? "-", 12)} ${truncate(formatPushed(repo.pushedAt), 10)} ${repo.visibility.padEnd(8, " ")} ${tag} ${status}`
  })
  return [...header, ...rows]
}
