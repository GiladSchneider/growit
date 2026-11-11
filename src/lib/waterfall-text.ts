import type { Tier } from "~/lib/engine";
import { formatBps } from "~/lib/format";

export const TIER_DESCRIPTIONS = {
  roc: "Returns each investor's capital until it's fully repaid.",
  pref: "Pays preferred return accrued on unreturned capital. Simple interest, Actual/365.",
  split:
    "Splits all remaining cash between investors (by ownership) and managers.",
} as const;

/** 8000 bps → "80% to investors, 20% to managers" */
export function splitPercents(investorBps: number): string {
  return `${formatBps(investorBps)} to investors, ${formatBps(10_000 - investorBps)} to managers`;
}

export function describeTier(tier: Tier): string {
  switch (tier.type) {
    case "roc":
      return "Return investors' capital";
    case "pref":
      return `Pay the ${formatBps(tier.rateBps)} preferred return`;
    case "split":
      return `Split the rest: ${splitPercents(tier.investorBps)}`;
  }
}
