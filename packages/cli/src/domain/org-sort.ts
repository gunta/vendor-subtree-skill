import type { OrgRepository } from "../services/local-state.ts"

export const ORG_REPO_SORTS = ["stars", "name", "pushed"] as const

export type OrgRepoSort = (typeof ORG_REPO_SORTS)[number]

const compareNames = (left: OrgRepository, right: OrgRepository): number =>
  left.name.localeCompare(right.name)

const pushedAtTime = (repo: OrgRepository): number => {
  if (repo.pushedAt === null) return 0
  const time = Date.parse(repo.pushedAt)
  return Number.isFinite(time) ? time : 0
}

export const sortOrgRepos = (
  repos: ReadonlyArray<OrgRepository>,
  sort: OrgRepoSort = "stars"
): ReadonlyArray<OrgRepository> => {
  switch (sort) {
    case "name":
      return [...repos].sort(compareNames)
    case "pushed":
      return [...repos].sort(
        (left, right) => pushedAtTime(right) - pushedAtTime(left) || compareNames(left, right)
      )
    case "stars":
      return [...repos].sort((left, right) => right.stars - left.stars || compareNames(left, right))
  }
}

export const sortOrgReposByStars = (
  repos: ReadonlyArray<OrgRepository>
): ReadonlyArray<OrgRepository> => sortOrgRepos(repos, "stars")
