import { Schema } from "effect"

export const VENDOR_STRATEGIES = ["subtree", "submodule", "clone-ignore"] as const

export const VendorStrategySchema = Schema.Literals(VENDOR_STRATEGIES)

export type VendorStrategy = typeof VendorStrategySchema.Type

export const VENDOR_ACTIONS = ["upsert", "remove"] as const

export const VendorActionSchema = Schema.Literals(VENDOR_ACTIONS)

export type VendorAction = typeof VendorActionSchema.Type

export const DEFAULT_VENDOR_STRATEGY: VendorStrategy = "subtree"

export interface EffectiveVendorStrategyParams {
  readonly jjColocated: boolean
  readonly requested: VendorStrategy
}

export const effectiveVendorStrategy = ({
  jjColocated,
  requested
}: EffectiveVendorStrategyParams): VendorStrategy =>
  jjColocated && requested !== "clone-ignore" ? "clone-ignore" : requested

export const strategyLabel = (strategy: VendorStrategy): string => {
  switch (strategy) {
    case "subtree":
      return "subtree"
    case "submodule":
      return "submodule"
    case "clone-ignore":
      return "clone-ignore"
  }
}
