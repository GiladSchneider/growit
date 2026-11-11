import type { Tier } from "./types";

export const TIER_LABELS = {
  roc: "Return of Capital",
  pref: "Preferred Return",
  split: "Profit Split",
} as const;

/** `tierIndex` is the tier the issue is about, or null if it's about the waterfall as a whole. */
export type WaterfallIssue = { tierIndex: number | null; message: string };

export type WaterfallValidation = {
  /** Block saving. */
  errors: WaterfallIssue[];
  /** Allowed, but probably a mistake, so the UI shows them. */
  warnings: WaterfallIssue[];
};

export function validateWaterfall(tiers: Tier[]): WaterfallValidation {
  const errors: WaterfallIssue[] = [];
  const warnings: WaterfallIssue[] = [];

  if (tiers.length === 0) {
    errors.push({ tierIndex: null, message: "Add at least one tier." });
    return { errors, warnings };
  }

  const seen = new Set<Tier["type"]>();
  const splitIndex = tiers.findIndex((tier) => tier.type === "split");

  tiers.forEach((tier, i) => {
    if (seen.has(tier.type)) {
      errors.push({
        tierIndex: i,
        message: `There's already a ${TIER_LABELS[tier.type]} tier. Each tier type can only be used once.`,
      });
    }
    seen.add(tier.type);

    // The split takes everything that's left, so a tier below it could never receive money.
    if (splitIndex !== -1 && i > splitIndex) {
      errors.push({
        tierIndex: i,
        message:
          "Nothing below Profit Split can ever be paid, because the split takes everything that's left. Move this tier above Profit Split or remove it.",
      });
    }

    if (
      tier.type === "pref" &&
      !(
        Number.isInteger(tier.rateBps) &&
        tier.rateBps >= 1 &&
        tier.rateBps <= 10_000
      )
    ) {
      errors.push({
        tierIndex: i,
        message:
          "Enter a preferred return between 0.01% and 100% (up to two decimals).",
      });
    }

    if (
      tier.type === "split" &&
      !(
        Number.isInteger(tier.investorBps) &&
        tier.investorBps >= 0 &&
        tier.investorBps <= 10_000
      )
    ) {
      errors.push({
        tierIndex: i,
        message:
          "Enter an investor share between 0% and 100% (up to two decimals).",
      });
    }
  });

  if (!seen.has("roc")) {
    warnings.push({
      tierIndex: null,
      message: seen.has("pref")
        ? "No return of capital tier: capital is never returned, so pref keeps accruing on the full investment."
        : "No return of capital tier: capital is never returned through this waterfall.",
    });
  }
  if (!seen.has("split")) {
    warnings.push({
      tierIndex: null,
      message:
        "No profit split tier: cash beyond what investors are owed can't be distributed.",
    });
  }

  return { errors, warnings };
}
