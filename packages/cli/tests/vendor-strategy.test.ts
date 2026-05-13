import { describe, expect, test } from "bun:test"
import { Option } from "effect"

import {
  DEFAULT_VENDOR_STRATEGY,
  effectiveVendorStrategy,
  isLocalIgnoredVendorStrategy,
  resolveVendorStrategyPreference,
  strategyLabel,
  VENDOR_ACTIONS,
  VENDOR_STRATEGIES,
  type VendorStrategy
} from "../src/domain/vendor-strategy.ts"

describe("VENDOR_STRATEGIES + VENDOR_ACTIONS + DEFAULT_VENDOR_STRATEGY", () => {
  test("VENDOR_STRATEGIES enumerates the 4 supported strategies", () => {
    expect(VENDOR_STRATEGIES).toEqual(["subtree", "submodule", "clone-ignore", "cache-link"])
  })

  test("VENDOR_ACTIONS enumerates upsert + remove", () => {
    expect(VENDOR_ACTIONS).toEqual(["upsert", "remove"])
  })

  test("default strategy is subtree", () => {
    expect(DEFAULT_VENDOR_STRATEGY).toBe("subtree")
  })
})

describe("isLocalIgnoredVendorStrategy", () => {
  test("clone-ignore is local-ignored", () => {
    expect(isLocalIgnoredVendorStrategy("clone-ignore")).toBe(true)
  })

  test("cache-link is local-ignored", () => {
    expect(isLocalIgnoredVendorStrategy("cache-link")).toBe(true)
  })

  test("subtree is not local-ignored", () => {
    expect(isLocalIgnoredVendorStrategy("subtree")).toBe(false)
  })

  test("submodule is not local-ignored", () => {
    expect(isLocalIgnoredVendorStrategy("submodule")).toBe(false)
  })
})

describe("effectiveVendorStrategy", () => {
  test("returns the requested strategy when jj is not colocated", () => {
    for (const requested of VENDOR_STRATEGIES) {
      expect(effectiveVendorStrategy({ jjColocated: false, requested })).toBe(requested)
    }
  })

  test("preserves a local-ignored strategy even under jj colocation", () => {
    expect(effectiveVendorStrategy({ jjColocated: true, requested: "clone-ignore" })).toBe(
      "clone-ignore"
    )
    expect(effectiveVendorStrategy({ jjColocated: true, requested: "cache-link" })).toBe(
      "cache-link"
    )
  })

  test("forces clone-ignore when jj is colocated and the requested strategy is not local-ignored", () => {
    expect(effectiveVendorStrategy({ jjColocated: true, requested: "subtree" })).toBe(
      "clone-ignore"
    )
    expect(effectiveVendorStrategy({ jjColocated: true, requested: "submodule" })).toBe(
      "clone-ignore"
    )
  })
})

describe("resolveVendorStrategyPreference", () => {
  test("requested wins when it is Some", () => {
    expect(
      resolveVendorStrategyPreference({
        recommended: "subtree",
        requested: Option.some("submodule")
      })
    ).toBe("submodule")
  })

  test("falls back to recommended when requested is None", () => {
    expect(
      resolveVendorStrategyPreference({
        recommended: "cache-link",
        requested: Option.none()
      })
    ).toBe("cache-link")
  })

  test("falls back to DEFAULT_VENDOR_STRATEGY when both requested and recommended are absent", () => {
    expect(
      resolveVendorStrategyPreference({
        recommended: undefined,
        requested: Option.none()
      })
    ).toBe(DEFAULT_VENDOR_STRATEGY)
  })

  test("requested still wins when recommended is undefined", () => {
    expect(
      resolveVendorStrategyPreference({
        recommended: undefined,
        requested: Option.some("clone-ignore")
      })
    ).toBe("clone-ignore")
  })
})

describe("strategyLabel", () => {
  test("returns a human-readable label for each strategy", () => {
    expect(strategyLabel("subtree")).toBe("subtree")
    expect(strategyLabel("submodule")).toBe("submodule")
    expect(strategyLabel("clone-ignore")).toBe("clone-ignore")
    expect(strategyLabel("cache-link")).toBe("cache-link")
  })

  test("is exhaustive across all VendorStrategy values", () => {
    for (const strategy of VENDOR_STRATEGIES) {
      expect(typeof strategyLabel(strategy as VendorStrategy)).toBe("string")
    }
  })
})
