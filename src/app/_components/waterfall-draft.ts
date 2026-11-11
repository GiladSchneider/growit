import type { Tier } from "~/lib/engine";
import { bpsToPercentText, parsePercentToBps } from "~/lib/parse";

/**
 * The waterfall while it's being edited. Rates are kept as the text the user typed (so "8." or an
 * empty box don't get reformatted under their cursor) and converted to basis points when needed.
 * Each tier type appears at most once, so the type doubles as a stable id for drag-and-drop.
 */
export type DraftTier =
  | { type: "roc" }
  | { type: "pref"; rate: string }
  | { type: "split"; investors: string; managers: string };

export function toDraft(tier: Tier): DraftTier {
  switch (tier.type) {
    case "roc":
      return { type: "roc" };
    case "pref":
      return { type: "pref", rate: bpsToPercentText(tier.rateBps) };
    case "split":
      return {
        type: "split",
        investors: bpsToPercentText(tier.investorBps),
        managers: bpsToPercentText(10_000 - tier.investorBps),
      };
  }
}

/** Invalid text becomes NaN, which validateWaterfall reports next to the tier. */
export function toTier(draft: DraftTier): Tier {
  switch (draft.type) {
    case "roc":
      return { type: "roc" };
    case "pref":
      return { type: "pref", rateBps: parsePercentToBps(draft.rate) };
    case "split":
      return { type: "split", investorBps: parsePercentToBps(draft.investors) };
  }
}

export function sameTiers(a: Tier[], b: Tier[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
