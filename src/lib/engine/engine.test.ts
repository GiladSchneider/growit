import { describe, expect, it } from "vitest";

import {
  computeInvestorState,
  runDistribution,
  validateWaterfall,
  type PriorPayment,
  type Tier,
} from "./index";
import { allocateProRata } from "./money";
import { makeInvestor, toPayments } from "./test-helpers";

const ROC: Tier = { type: "roc" };
const PREF_8: Tier = { type: "pref", rateBps: 800 };
const SPLIT_80_20: Tier = { type: "split", investorBps: 8000 };

describe("worked example: ROC → 8% pref → 80/20", () => {
  const a = makeInvestor(1, 100_000, "2025-01-01");
  const tiers = [ROC, PREF_8, SPLIT_80_20];

  const first = runDistribution({
    investors: [a],
    tiers,
    priorPayments: [],
    date: "2026-01-01",
    amountCents: 50_000_00,
  });
  const second = runDistribution({
    investors: [a],
    tiers,
    priorPayments: toPayments(first),
    date: "2027-01-01",
    amountCents: 100_000_00,
  });

  it("first distribution is all return of capital", () => {
    expect(first.investors[0]!.byTier).toEqual({
      roc: 50_000_00,
      pref: 0,
      split: 0,
    });
    expect(first.managerCents).toBe(0);
    expect(first.investors[0]!.after.unreturnedCapitalCents).toBe(50_000_00);
    // A year of pref was earned but not paid, because ROC came first and used up the money.
    expect(first.investors[0]!.after.prefOwedCents).toBe(8_000_00);
  });

  it("second distribution finishes ROC, pays accumulated pref, then splits the rest", () => {
    expect(second.investors[0]!.byTier).toEqual({
      roc: 50_000_00,
      pref: 12_000_00, // $8,000 on $100k for 365 days + $4,000 on $50k for 365 days
      split: 30_400_00,
    });
    expect(second.managerCents).toBe(7_600_00);
    expect(second.tierTotals).toEqual([
      { type: "roc", amountCents: 50_000_00 },
      { type: "pref", amountCents: 12_000_00 },
      { type: "split", amountCents: 38_000_00 },
    ]);
    expect(second.undistributedCents).toBe(0);
    expect(second.maxDistributableCents).toBeNull();
  });

  it("shows the pref accrual periods", () => {
    expect(second.investors[0]!.before.accrualPeriods).toEqual([
      {
        from: "2025-01-01",
        to: "2026-01-01",
        days: 365,
        unreturnedCapitalCents: 100_000_00,
        accruedCents: "800000",
      },
      {
        from: "2026-01-01",
        to: "2027-01-01",
        days: 365,
        unreturnedCapitalCents: 50_000_00,
        accruedCents: "400000",
      },
    ]);
    expect(second.investors[0]!.after).toMatchObject({
      unreturnedCapitalCents: 0,
      prefOwedCents: 0,
      totalReceivedCents: 50_000_00 + 50_000_00 + 12_000_00 + 30_400_00,
    });
  });
});

describe("tier order", () => {
  it("pref-before-ROC and ROC-before-pref give different future accrual", () => {
    const a = makeInvestor(1, 100_000, "2025-01-01");
    const run = (tiers: Tier[]) => {
      const first = runDistribution({
        investors: [a],
        tiers,
        priorPayments: [],
        date: "2026-01-01",
        amountCents: 50_000_00,
      });
      return {
        first,
        later: computeInvestorState(a, toPayments(first), "2027-01-01", 800),
      };
    };

    const rocFirst = run([ROC, PREF_8, SPLIT_80_20]);
    const prefFirst = run([PREF_8, ROC, SPLIT_80_20]);

    // ROC first: all $50k returns capital, leaving $50k unreturned.
    expect(rocFirst.first.investors[0]!.byTier).toMatchObject({
      roc: 50_000_00,
      pref: 0,
    });
    // Pref first: $8k pref, then $42k capital, leaving $58k unreturned.
    expect(prefFirst.first.investors[0]!.byTier).toMatchObject({
      roc: 42_000_00,
      pref: 8_000_00,
    });

    // Year two accrues on different balances: 8% of $50k vs 8% of $58k.
    expect(rocFirst.later.accrualPeriods[1]!.accruedCents).toBe("400000");
    expect(prefFirst.later.accrualPeriods[1]!.accruedCents).toBe("464000");
    expect(rocFirst.later.prefOwedCents).toBe(12_000_00);
    expect(prefFirst.later.prefOwedCents).toBe(4_640_00);
  });
});

describe("pref after capital is fully returned", () => {
  it("stays owed but stops growing", () => {
    const a = makeInvestor(1, 100_000, "2025-01-01");
    const tiers = [ROC, PREF_8, SPLIT_80_20];
    const first = runDistribution({
      investors: [a],
      tiers,
      priorPayments: [],
      date: "2026-01-01",
      amountCents: 100_000_00,
    });
    expect(first.investors[0]!.byTier).toEqual({
      roc: 100_000_00,
      pref: 0,
      split: 0,
    });

    const ayearLater = computeInvestorState(
      a,
      toPayments(first),
      "2027-01-01",
      800,
    );
    expect(ayearLater.unreturnedCapitalCents).toBe(0);
    expect(ayearLater.prefOwedCents).toBe(8_000_00);
    expect(ayearLater.accrualPeriods[1]).toMatchObject({
      unreturnedCapitalCents: 0,
      accruedCents: "0",
    });

    const second = runDistribution({
      investors: [a],
      tiers,
      priorPayments: toPayments(first),
      date: "2027-01-01",
      amountCents: 10_000_00,
    });
    expect(second.investors[0]!.byTier).toEqual({
      roc: 0,
      pref: 8_000_00,
      split: 1_600_00,
    });
    expect(second.managerCents).toBe(400_00);
  });
});

describe("eligibility", () => {
  const a = makeInvestor(1, 100_000, "2025-01-01");
  const tiers = [ROC, PREF_8, SPLIT_80_20];

  it("excludes investors who invest after the distribution date, including from ownership %", () => {
    const late = makeInvestor(2, 300_000, "2026-01-02");
    const result = runDistribution({
      investors: [a, late],
      tiers,
      priorPayments: [],
      date: "2026-01-01",
      amountCents: 200_000_00,
    });
    expect(result.investors.map((r) => r.investor.id)).toEqual([1]);
    expect(result.investors[0]!.ownership).toBe(1);
    expect(result.allocations.some((alloc) => alloc.investorId === 2)).toBe(
      false,
    );
  });

  it("includes an investor who invests on the distribution date, with 0 days of pref", () => {
    const sameDay = makeInvestor(2, 100_000, "2026-01-01");
    const result = runDistribution({
      investors: [a, sameDay],
      tiers,
      priorPayments: [],
      date: "2026-01-01",
      amountCents: 300_000_00,
    });
    const [rowA, rowB] = result.investors;
    expect(rowB!.before.accrualPeriods).toEqual([]);
    expect(rowB!.before.prefOwedCents).toBe(0);
    expect(rowB!.byTier).toEqual({
      roc: 100_000_00,
      pref: 0,
      split: 36_800_00,
    });
    expect(rowA!.byTier).toEqual({
      roc: 100_000_00,
      pref: 8_000_00,
      split: 36_800_00,
    });
    expect(rowB!.ownership).toBe(0.5);
  });

  it("refuses to run when nobody has invested yet", () => {
    expect(() =>
      runDistribution({
        investors: [a],
        tiers,
        priorPayments: [],
        date: "2024-12-31",
        amountCents: 100,
      }),
    ).toThrow(/No investors/);
  });
});

describe("computeInvestorState", () => {
  const a = makeInvestor(1, 100_000, "2025-01-01");
  const payments: PriorPayment[] = [
    {
      date: "2026-01-01",
      investorId: 1,
      tierType: "roc",
      amountCents: 50_000_00,
    },
    {
      date: "2027-01-01",
      investorId: 1,
      tierType: "roc",
      amountCents: 50_000_00,
    },
    { date: "2026-01-01", investorId: 2, tierType: "roc", amountCents: 1 }, // someone else
  ];

  it("ignores payments after the as-of date and includes payments on it", () => {
    const state = computeInvestorState(a, payments, "2026-01-01", 800);
    expect(state.capitalReturnedCents).toBe(50_000_00);
    expect(state.unreturnedCapitalCents).toBe(50_000_00);
    // Pref through 2026-01-01 accrued entirely on the full $100k.
    expect(state.prefOwedCents).toBe(8_000_00);

    const before = computeInvestorState(a, payments, "2025-12-31", 800);
    expect(before.capitalReturnedCents).toBe(0);
  });

  it("accrues over 366 days across a leap year", () => {
    const b = makeInvestor(1, 100_000, "2027-06-01");
    const state = computeInvestorState(b, [], "2028-06-01", 800);
    expect(state.accrualPeriods[0]!.days).toBe(366);
    // $8,000 × 366 / 365 = $8,021.9178... → $8,021.92
    expect(state.prefOwedCents).toBe(8_021_92);
  });

  it("has no pref when there is no pref tier", () => {
    const state = computeInvestorState(a, payments, "2030-01-01", null);
    expect(state).toMatchObject({
      prefAccruedCents: "0",
      prefOwedCents: 0,
      accrualPeriods: [],
    });
  });

  it("rounds half a cent up", () => {
    // $365 for 365 days: at 0.05% that's exactly 18.25¢ (→ 18¢), at 0.10% exactly 36.5¢ (→ 37¢).
    const small = makeInvestor(1, 365, "2025-01-01");
    expect(computeInvestorState(small, [], "2026-01-01", 5).prefOwedCents).toBe(
      18,
    );
    expect(
      computeInvestorState(small, [], "2026-01-01", 10).prefOwedCents,
    ).toBe(37);
  });
});

describe("no split tier", () => {
  it("reports what couldn't be distributed and the most that can be", () => {
    const a = makeInvestor(1, 100_000, "2025-01-01");
    const result = runDistribution({
      investors: [a],
      tiers: [ROC, PREF_8],
      priorPayments: [],
      date: "2026-01-01",
      amountCents: 200_000_00,
    });
    expect(result.investors[0]!.byTier).toEqual({
      roc: 100_000_00,
      pref: 8_000_00,
      split: 0,
    });
    expect(result.undistributedCents).toBe(92_000_00);
    expect(result.maxDistributableCents).toBe(108_000_00);
  });
});

describe("pro rata by amount owed", () => {
  it("splits a short pref tier in proportion to each investor's owed pref", () => {
    const a = makeInvestor(1, 100_000, "2025-01-01"); // 365 days → owed $8,000.00
    const b = makeInvestor(2, 100_000, "2025-07-02"); // 183 days → owed $4,010.96
    const result = runDistribution({
      investors: [a, b],
      tiers: [PREF_8, ROC, SPLIT_80_20],
      priorPayments: [],
      date: "2026-01-01",
      amountCents: 6_000_00,
    });
    const [rowA, rowB] = result.investors;
    expect(rowA!.before.prefOwedCents).toBe(8_000_00);
    expect(rowB!.before.prefOwedCents).toBe(4_010_96);

    // Exact shares: A = 600,000 × 800,000 / 1,201,096 = 399,635.00003¢, B = 200,364.99997¢.
    // Rounded down that's 599,999¢; the last cent goes to B, who lost more to rounding.
    expect(rowA!.byTier.pref).toBe(399_635);
    expect(rowB!.byTier.pref).toBe(200_365);

    // Both are now owed the same fraction of what they were owed before (about half).
    expect(rowA!.after.prefOwedCents / 8_000_00).toBeCloseTo(
      rowB!.after.prefOwedCents / 4_010_96,
      4,
    );
  });
});

describe("rounding", () => {
  it("splits $100.00 three ways exactly, giving the extra cent to the earliest-created investor", () => {
    // Passed in a scrambled order on purpose: tie-breaking uses createdAt, not array order.
    const investors = [
      makeInvestor(3, 1_000, "2025-01-01", "2025-01-03T00:00:00.000Z"),
      makeInvestor(1, 1_000, "2025-01-01", "2025-01-01T00:00:00.000Z"),
      makeInvestor(2, 1_000, "2025-01-01", "2025-01-02T00:00:00.000Z"),
    ];
    const result = runDistribution({
      investors,
      tiers: [ROC, SPLIT_80_20],
      priorPayments: [],
      date: "2025-06-01",
      amountCents: 100_00,
    });
    const roc = Object.fromEntries(
      result.investors.map((r) => [r.investor.id, r.byTier.roc]),
    );
    expect(roc).toEqual({ 1: 33_34, 2: 33_33, 3: 33_33 });
  });

  it("gives managers the extra cent last in the split", () => {
    // $0.03 split 50/50 between one investor and managers: 1.5¢ each, tie → investor gets 2¢.
    const result = runDistribution({
      investors: [makeInvestor(1, 1, "2025-01-01")],
      tiers: [{ type: "split", investorBps: 5000 }],
      priorPayments: [],
      date: "2025-01-01",
      amountCents: 3,
    });
    expect(result.investors[0]!.byTier.split).toBe(2);
    expect(result.managerCents).toBe(1);
  });

  it("allocateProRata always adds up and never gives a zero-weight recipient anything", () => {
    expect(allocateProRata(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(allocateProRata(10, [0, 1, 2])).toEqual([0, 3, 7]);
    expect(allocateProRata(0, [5, 5])).toEqual([0, 0]);
    expect(() => allocateProRata(10, [0, 0])).toThrow();
  });
});

describe("determinism", () => {
  it("gives identical allocations for identical inputs", () => {
    const investors = [
      makeInvestor(1, 123_457, "2024-03-15"),
      makeInvestor(2, 98_765, "2024-09-30"),
      makeInvestor(3, 50_000, "2025-02-28"),
    ];
    const input = {
      investors,
      tiers: [PREF_8, ROC, { type: "split", investorBps: 7000 } as Tier],
      priorPayments: [],
      date: "2026-01-01",
      amountCents: 77_777_77,
    };
    expect(runDistribution(input)).toEqual(
      runDistribution(structuredClone(input)),
    );
  });
});

describe("validateWaterfall", () => {
  const messages = (tiers: Tier[]) => {
    const { errors, warnings } = validateWaterfall(tiers);
    return { errors, warnings };
  };

  it("accepts a standard waterfall with no issues", () => {
    expect(messages([ROC, PREF_8, SPLIT_80_20])).toEqual({
      errors: [],
      warnings: [],
    });
    expect(messages([PREF_8, ROC, SPLIT_80_20])).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it("requires at least one tier", () => {
    expect(messages([]).errors).toEqual([
      { tierIndex: null, message: "Add at least one tier." },
    ]);
  });

  it("allows each tier type only once", () => {
    const { errors } = messages([ROC, ROC, SPLIT_80_20]);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.tierIndex).toBe(1);
    expect(errors[0]!.message).toMatch(/already a Return of Capital/);
  });

  it("allows nothing after the split", () => {
    const { errors } = messages([ROC, SPLIT_80_20, PREF_8]);
    expect(errors).toEqual([
      {
        tierIndex: 2,
        message: expect.stringMatching(/Nothing below Profit Split/) as string,
      },
    ]);
  });

  it("checks rates are in range", () => {
    expect(
      messages([ROC, { type: "pref", rateBps: 0 }, SPLIT_80_20]).errors[0]!
        .tierIndex,
    ).toBe(1);
    expect(
      messages([ROC, { type: "pref", rateBps: 10_001 }, SPLIT_80_20]).errors,
    ).toHaveLength(1);
    expect(
      messages([ROC, { type: "pref", rateBps: 10_000 }, SPLIT_80_20]).errors,
    ).toHaveLength(0);
    expect(
      messages([ROC, { type: "split", investorBps: -1 }]).errors[0]!.tierIndex,
    ).toBe(1);
    expect(
      messages([ROC, { type: "split", investorBps: 10_001 }]).errors,
    ).toHaveLength(1);
    expect(
      messages([ROC, { type: "split", investorBps: 0 }]).errors,
    ).toHaveLength(0);
    expect(
      messages([ROC, { type: "split", investorBps: 10_000 }]).errors,
    ).toHaveLength(0);
    expect(
      messages([ROC, { type: "split", investorBps: 50.5 }]).errors,
    ).toHaveLength(1);
  });

  it("warns when there's no ROC tier", () => {
    expect(messages([PREF_8, SPLIT_80_20]).warnings).toEqual([
      {
        tierIndex: null,
        message: expect.stringMatching(
          /keeps accruing on the full investment/,
        ) as string,
      },
    ]);
    expect(messages([SPLIT_80_20]).warnings).toEqual([
      {
        tierIndex: null,
        message: expect.stringMatching(
          /capital is never returned through this waterfall\.$/,
        ) as string,
      },
    ]);
  });

  it("warns when there's no split tier", () => {
    expect(messages([ROC, PREF_8]).warnings).toEqual([
      {
        tierIndex: null,
        message: expect.stringMatching(/can't be distributed/) as string,
      },
    ]);
  });
});
