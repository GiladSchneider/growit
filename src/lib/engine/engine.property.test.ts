import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  addDays,
  runDistribution,
  type DistributionResult,
  type Investment,
  type PriorPayment,
  type Tier,
} from "./index";
import { toPayments } from "./test-helpers";

// ---- Generators -------------------------------------------------------------------------------

const START = "2020-01-01";
const MAX_CENTS = 10_000_000_000; // $100M per investment / distribution

const investmentsArb = fc
  .array(
    fc.record({
      amountCents: fc.integer({ min: 1, max: MAX_CENTS }),
      dayOffset: fc.integer({ min: 0, max: 1500 }),
    }),
    { minLength: 1, maxLength: 5 },
  )
  .map((rows): Investment[] =>
    rows.map((row, i) => ({
      id: i + 1,
      investorName: `Investor ${i + 1}`,
      amountCents: row.amountCents,
      investmentDate: addDays(START, row.dayOffset),
      createdAt: `2020-01-01T00:00:00.${String(i).padStart(3, "0")}Z`,
    })),
  );

const prefArb = fc
  .integer({ min: 1, max: 10_000 })
  .map((rateBps): Tier => ({ type: "pref", rateBps }));
const splitArb = fc
  .integer({ min: 0, max: 10_000 })
  .map((investorBps): Tier => ({ type: "split", investorBps }));

/** Any valid waterfall: ROC and pref in either order (or missing), optionally followed by a split. */
const tiersArb = (opts: { split: "always" | "maybe" }) =>
  fc
    .record({
      head: fc.shuffledSubarray(["roc", "pref"] as const),
      pref: prefArb,
      split:
        opts.split === "always"
          ? splitArb.map((s) => [s])
          : fc.option(splitArb).map((s) => (s ? [s] : [])),
    })
    .map(({ head, pref, split }): Tier[] => [
      ...head.map((type): Tier => (type === "roc" ? { type: "roc" } : pref)),
      ...split,
    ])
    .filter((tiers) => tiers.length > 0);

/** Distributions in date order, starting on or after the first investment so someone is eligible. */
const distributionsArb = (investments: Investment[]) => {
  const firstInvestment = investments.map((i) => i.investmentDate).sort()[0]!;
  return fc
    .array(
      fc.record({
        gapDays: fc.integer({ min: 0, max: 800 }),
        amountCents: fc.integer({ min: 1, max: MAX_CENTS }),
      }),
      { minLength: 1, maxLength: 5 },
    )
    .map((rows) => {
      let date = firstInvestment;
      return rows.map((row) => {
        date = addDays(date, row.gapDays);
        return { date, amountCents: row.amountCents };
      });
    });
};

const scenarioArb = (opts: { split: "always" | "maybe" }) =>
  fc.tuple(investmentsArb, tiersArb(opts)).chain(([investments, tiers]) =>
    distributionsArb(investments).map((distributions) => ({
      investments,
      tiers,
      distributions,
    })),
  );

function runAll(
  investments: Investment[],
  tiers: Tier[],
  distributions: { date: string; amountCents: number }[],
  priorPayments: PriorPayment[] = [],
): { results: DistributionResult[]; payments: PriorPayment[] } {
  const results: DistributionResult[] = [];
  let payments = priorPayments;
  for (const d of distributions) {
    const result = runDistribution({
      investments,
      tiers,
      priorPayments: payments,
      ...d,
    });
    results.push(result);
    payments = [...payments, ...toPayments(result)];
  }
  return { results, payments };
}

// ---- Properties -------------------------------------------------------------------------------

describe("engine properties", () => {
  it("allocations always add up to the distribution amount when there's a split tier", () => {
    fc.assert(
      fc.property(
        scenarioArb({ split: "always" }),
        ({ investments, tiers, distributions }) => {
          for (const result of runAll(investments, tiers, distributions)
            .results) {
            const allocated = result.allocations.reduce(
              (s, a) => s + a.amountCents,
              0,
            );
            expect(allocated).toBe(result.amountCents);
            expect(
              result.tierTotals.reduce((s, t) => s + t.amountCents, 0),
            ).toBe(result.amountCents);
            expect(result.undistributedCents).toBe(0);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it("without a split tier, paid + undistributed = amount and nothing beyond the max is paid", () => {
    fc.assert(
      fc.property(
        scenarioArb({ split: "maybe" }),
        ({ investments, tiers, distributions }) => {
          for (const result of runAll(investments, tiers, distributions)
            .results) {
            const allocated = result.allocations.reduce(
              (s, a) => s + a.amountCents,
              0,
            );
            expect(allocated + result.undistributedCents).toBe(
              result.amountCents,
            );
            if (result.maxDistributableCents !== null) {
              expect(allocated).toBe(
                Math.min(result.amountCents, result.maxDistributableCents),
              );
            }
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it("never pays more than owed in ROC or pref, and no balance ever goes negative", () => {
    fc.assert(
      fc.property(
        scenarioArb({ split: "maybe" }),
        ({ investments, tiers, distributions }) => {
          for (const result of runAll(investments, tiers, distributions)
            .results) {
            for (const allocation of result.allocations) {
              expect(allocation.amountCents).toBeGreaterThanOrEqual(0);
            }
            for (const row of result.investments) {
              expect(row.byTier.roc).toBeLessThanOrEqual(
                row.before.unreturnedCapitalCents,
              );
              expect(row.byTier.pref).toBeLessThanOrEqual(
                row.before.prefOwedCents,
              );
              for (const state of [row.before, row.after]) {
                expect(state.unreturnedCapitalCents).toBeGreaterThanOrEqual(0);
                expect(state.prefOwedCents).toBeGreaterThanOrEqual(0);
              }
            }
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it("splitting one distribution into two on the same date gives the same totals, within rounding", () => {
    const arb = scenarioArb({ split: "always" }).chain((scenario) => {
      const last = scenario.distributions[scenario.distributions.length - 1]!;
      return fc
        .integer({ min: 1, max: Math.max(1, last.amountCents - 1) })
        .map((firstPart) => ({ ...scenario, last, firstPart }));
    });

    fc.assert(
      fc.property(
        arb,
        ({ investments, tiers, distributions, last, firstPart }) => {
          fc.pre(last.amountCents >= 2);
          const history = runAll(
            investments,
            tiers,
            distributions.slice(0, -1),
          ).payments;

          const whole = runAll(investments, tiers, [last], history).results;
          const parts = runAll(
            investments,
            tiers,
            [
              { date: last.date, amountCents: firstPart },
              { date: last.date, amountCents: last.amountCents - firstPart },
            ],
            history,
          ).results;

          const totalsById = (results: DistributionResult[]) => {
            const totals = new Map<number | null, number>();
            for (const r of results) {
              for (const a of r.allocations) {
                totals.set(
                  a.investmentId,
                  (totals.get(a.investmentId) ?? 0) + a.amountCents,
                );
              }
            }
            return totals;
          };
          const wholeTotals = totalsById(whole);
          const partTotals = totalsById(parts);

          // The extra run rounds once more in each tier, so allow a cent per tier per recipient.
          // (In practice the difference is never more than 1 cent.)
          const tolerance = tiers.length;
          for (const [recipient, cents] of wholeTotals) {
            expect(
              Math.abs((partTotals.get(recipient) ?? 0) - cents),
            ).toBeLessThanOrEqual(tolerance);
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});
