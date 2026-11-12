import { computeInvestmentState } from "./investment-state";
import { Decimal, allocateProRata, sum } from "./money";
import type {
  Allocation,
  DistributionResult,
  Investment,
  InvestmentState,
  PriorPayment,
  Tier,
  TierType,
} from "./types";

const BPS = 10_000;

export type RunDistributionInput = {
  investments: Investment[];
  tiers: Tier[];
  /** Payments from all active distributions before this one. */
  priorPayments: PriorPayment[];
  date: string;
  amountCents: number;
};

/**
 * Runs one distribution through the waterfall and returns exactly who gets paid what.
 * Pure: the same inputs always give the same output, which is what makes void-and-re-enter safe.
 */
export function runDistribution({
  investments,
  tiers,
  priorPayments,
  date,
  amountCents,
}: RunDistributionInput): DistributionResult {
  // Only investments made by the distribution date take part. One made on the distribution
  // date itself is included (with 0 days of pref). Sorting here fixes the order
  // that decides who gets a leftover cent when rounding ties.
  const eligible = investments
    .filter((investment) => investment.investmentDate <= date)
    .sort(byCreatedAt);
  if (eligible.length === 0) {
    throw new Error("No investors had invested by this date");
  }

  const prefRateBps = prefRateOf(tiers);
  const totalInvested = sum(
    eligible.map((investment) => investment.amountCents),
  );

  const rows = eligible.map((investment) => ({
    investment,
    before: computeInvestmentState(
      investment,
      priorPayments,
      date,
      prefRateBps,
    ),
    paid: { roc: 0, pref: 0, split: 0 },
  }));
  let managerCents = 0;

  const tierTotals: DistributionResult["tierTotals"] = [];
  let remaining = amountCents;
  // A number while every tier has a limit; null once a split tier can absorb any amount.
  let maxDistributableCents: number | null = 0;

  for (const tier of tiers) {
    let tierPaid: number;

    if (tier.type === "roc" || tier.type === "pref") {
      const owed = rows.map((row) => amountOwed(row.before, tier.type));
      const payments = payOwed(owed, remaining);
      rows.forEach((row, i) => (row.paid[tier.type] = payments[i]!));
      tierPaid = sum(payments);
      if (maxDistributableCents !== null) maxDistributableCents += sum(owed);
    } else {
      // Profit split takes everything left. Investors get investorBps / 10,000 of it, shared by
      // ownership % among eligible investments; managers get the rest as a single recipient.
      // It's done as one pro-rata split (managers listed last) so the cents always add up.
      const weights = [
        ...rows.map((row) =>
          new Decimal(row.investment.amountCents).mul(tier.investorBps),
        ),
        new Decimal(totalInvested).mul(BPS - tier.investorBps),
      ];
      const shares = allocateProRata(remaining, weights);
      rows.forEach((row, i) => (row.paid.split = shares[i]!));
      managerCents = shares[rows.length]!;
      tierPaid = remaining;
      maxDistributableCents = null;
    }

    tierTotals.push({ type: tier.type, amountCents: tierPaid });
    remaining -= tierPaid;
  }

  const allocations = buildAllocations(tiers, rows, managerCents);
  const paymentsIncludingThis = [
    ...priorPayments,
    ...allocationsToPayments(date, allocations),
  ];

  return {
    date,
    amountCents,
    tierTotals,
    investments: rows.map(({ investment, before, paid }) => ({
      investment,
      ownership: investment.amountCents / totalInvested,
      byTier: paid,
      totalCents: paid.roc + paid.pref + paid.split,
      before,
      after: computeInvestmentState(
        investment,
        paymentsIncludingThis,
        date,
        prefRateBps,
      ),
    })),
    managerCents,
    allocations,
    undistributedCents: remaining,
    maxDistributableCents,
  };
}

/** The waterfall's preferred return rate, or null if it has no pref tier. */
export function prefRateOf(tiers: Tier[]): number | null {
  const pref = tiers.find((tier) => tier.type === "pref");
  return pref?.type === "pref" ? pref.rateBps : null;
}

/** The investor payments in a distribution, in the shape the engine reads history in. */
export function allocationsToPayments(
  date: string,
  allocations: Allocation[],
): PriorPayment[] {
  return allocations.flatMap((a) =>
    a.investmentId === null
      ? []
      : [
          {
            date,
            investmentId: a.investmentId,
            tierType: a.tierType,
            amountCents: a.amountCents,
          },
        ],
  );
}

function amountOwed(state: InvestmentState, tierType: "roc" | "pref"): number {
  return tierType === "roc"
    ? state.unreturnedCapitalCents
    : state.prefOwedCents;
}

/**
 * Return-of-capital and preferred-return tiers: if there's enough money, pay everyone what they're
 * owed. Otherwise split what's available pro rata by amount owed. That never overpays anyone, and
 * everyone's balance reaches zero at the same time ("until the condition is met for ALL investors").
 */
function payOwed(owed: number[], availableCents: number): number[] {
  if (sum(owed) <= availableCents) return owed;
  return allocateProRata(availableCents, owed);
}

function byCreatedAt(a: Investment, b: Investment): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id - b.id;
}

/** One allocation per tier per eligible investment (zeros included), plus managers' split share. */
function buildAllocations(
  tiers: Tier[],
  rows: { investment: Investment; paid: Record<TierType, number> }[],
  managerCents: number,
): Allocation[] {
  return tiers.flatMap((tier) => [
    ...rows.map((row) => ({
      tierType: tier.type,
      recipientType: "investor" as const,
      investmentId: row.investment.id,
      amountCents: row.paid[tier.type],
    })),
    ...(tier.type === "split"
      ? [
          {
            tierType: tier.type,
            recipientType: "manager" as const,
            investmentId: null,
            amountCents: managerCents,
          },
        ]
      : []),
  ]);
}
