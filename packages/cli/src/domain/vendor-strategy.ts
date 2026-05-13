import { Option, Schema } from "effect"

export const VENDOR_STRATEGIES = ["subtree", "submodule", "clone-ignore", "cache-link"] as const

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

export interface ResolveVendorStrategyPreferenceParams {
  readonly recommended: VendorStrategy | undefined
  readonly requested: Option.Option<VendorStrategy>
}

export const effectiveVendorStrategy = ({
  jjColocated,
  requested
}: EffectiveVendorStrategyParams): VendorStrategy =>
  jjColocated && !isLocalIgnoredVendorStrategy(requested) ? "clone-ignore" : requested

export const resolveVendorStrategyPreference = ({
  recommended,
  requested
}: ResolveVendorStrategyPreferenceParams): VendorStrategy =>
  Option.getOrElse(requested, () => recommended ?? DEFAULT_VENDOR_STRATEGY)

export const strategyLabel = (strategy: VendorStrategy): string => {
  switch (strategy) {
    case "subtree":
      return "subtree"
    case "submodule":
      return "submodule"
    case "clone-ignore":
      return "clone-ignore"
    case "cache-link":
      return "cache-link"
  }
}

export const isLocalIgnoredVendorStrategy = (strategy: VendorStrategy): boolean =>
  strategy === "clone-ignore" || strategy === "cache-link"
