import { AddOrgAction, type AddOrgState } from "./state.ts"

export const handleAddOrgKey = (key: string, state: AddOrgState): AddOrgAction | null => {
  if (state.mode === "done" || state.mode === "running") return null
  if (state.mode === "confirming-run") {
    switch (key) {
      case "q":
        return AddOrgAction.Cancel()
      case "\r":
      case "\n":
        return AddOrgAction.StartRun()
      default:
        return null
    }
  }

  switch (key) {
    case "j":
      return AddOrgAction.MoveDown()
    case "k":
      return AddOrgAction.MoveUp()
    case " ":
      return AddOrgAction.ToggleSelected()
    case "a":
      return AddOrgAction.SelectAllFiltered()
    case "c":
      return AddOrgAction.ClearSelection()
    case "A":
      return AddOrgAction.ToggleArchived()
    case "F":
      return AddOrgAction.ToggleForks()
    case "q":
      return AddOrgAction.Cancel()
    case "\r":
    case "\n":
      return AddOrgAction.Confirm()
    default:
      return null
  }
}
