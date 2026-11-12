import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, it } from "vitest";

import { computeInvestmentState } from "~/lib/engine";
import { planDistribution, toPlanInputs } from "~/lib/plan";
import { createCaller } from "~/server/api/root";
import { createDb } from "~/server/db";
import { loadPlanInputs } from "~/server/ledger";

// Each test gets a fresh SQLite file with the real schema and talks to the real routers.
async function createTestApi() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "growit-test-"));
  const db = createDb(`file:${path.join(dir, "test.sqlite")}`);
  await migrate(db, {
    migrationsFolder: path.resolve(import.meta.dirname, "../../../drizzle"),
  });
  return { db, api: createCaller({ db, headers: new Headers() }) };
}

type TestApi = Awaited<ReturnType<typeof createTestApi>>;
let api: TestApi["api"];
let db: TestApi["db"];

/** What finalize would do, planned on the server exactly as finalize plans it. */
async function serverPlan(date: string, amountCents: number) {
  return planDistribution(await loadPlanInputs(db), date, amountCents);
}

const STANDARD_WATERFALL = [
  { type: "pref" as const, rateBps: 800 },
  { type: "roc" as const },
  { type: "split" as const, investorBps: 8000 },
];

beforeEach(async () => {
  ({ api, db } = await createTestApi());
  await api.investments.create({
    investorName: "A",
    amountCents: 100_000_00,
    investmentDate: "2025-01-01",
  });
  await api.waterfall.save({ tiers: STANDARD_WATERFALL });
});

describe("append-only ledger", () => {
  it("finalizes in order and refuses a backdated date, listing what's in the way", async () => {
    await api.distributions.finalize({
      date: "2026-03-01",
      amountCents: 10_000_00,
    });
    await api.distributions.finalize({
      date: "2026-06-01",
      amountCents: 10_000_00,
    });
    // Same date as the latest is fine.
    await api.distributions.finalize({
      date: "2026-06-01",
      amountCents: 1_000_00,
    });

    await expect(
      api.distributions.finalize({ date: "2026-01-01", amountCents: 1_000_00 }),
    ).rejects.toThrow(
      /before 3 finalized distributions \(Mar 1, 2026, Jun 1, 2026 and Jun 1, 2026\)/,
    );

    const preview = await serverPlan("2026-04-01", 1_000_00);
    expect(preview.blocking.map((d) => d.date)).toEqual([
      "2026-06-01",
      "2026-06-01",
    ]);
    expect(preview.result).toBeNull();
  });

  it("refuses to finalize when money would be left undistributed", async () => {
    await api.waterfall.save({ tiers: [{ type: "roc" }] });
    await expect(
      api.distributions.finalize({
        date: "2026-01-01",
        amountCents: 200_000_00,
      }),
    ).rejects.toThrow(/can't be paid to anyone/);
  });

  it("stores the allocations and the waterfall snapshot", async () => {
    await api.distributions.finalize({
      date: "2026-01-01",
      amountCents: 50_000_00,
    });
    const [distribution] = await api.distributions.list();
    expect(distribution!.waterfallSnapshot).toEqual(STANDARD_WATERFALL);
    const paidToA = distribution!.allocations
      .filter((a) => a.investmentId !== null)
      .map((a) => [a.tierType, a.amountCents]);
    expect(paidToA).toEqual([
      ["pref", 8_000_00],
      ["roc", 42_000_00],
      ["split", 0],
    ]);
  });
});

describe("void", () => {
  it("is only allowed on the latest active distribution", async () => {
    const first = await api.distributions.finalize({
      date: "2026-01-01",
      amountCents: 10_000_00,
    });
    const second = await api.distributions.finalize({
      date: "2026-06-01",
      amountCents: 10_000_00,
    });

    await expect(api.distributions.void({ id: first.id })).rejects.toThrow(
      /Only the most recent/,
    );

    await api.distributions.void({ id: second.id });
    await expect(api.distributions.void({ id: second.id })).rejects.toThrow(
      /already voided/,
    );
    // Now the first one is the latest active, so it can be voided.
    await api.distributions.void({ id: first.id });

    const list = await api.distributions.list();
    expect(list.map((d) => d.status)).toEqual(["voided", "voided"]);
  });

  it("stops counting voided payments", async () => {
    const first = await api.distributions.finalize({
      date: "2026-01-01",
      amountCents: 10_000_00,
    });
    await api.distributions.void({ id: first.id });
    const { investments, priorPayments } = await loadPlanInputs(db);
    const state = computeInvestmentState(
      investments[0]!,
      priorPayments,
      "2026-01-01",
      800,
    );
    expect(state.totalReceivedCents).toBe(0);
    expect(state.prefOwedCents).toBe(8_000_00);
  });
});

describe("waterfall locking", () => {
  it("refuses pref changes while active distributions exist, but allows order and split changes", async () => {
    const first = await api.distributions.finalize({
      date: "2026-01-01",
      amountCents: 10_000_00,
    });

    const changedRate = [
      { type: "pref" as const, rateBps: 1000 },
      { type: "roc" as const },
      { type: "split" as const, investorBps: 8000 },
    ];
    await expect(api.waterfall.save({ tiers: changedRate })).rejects.toThrow(
      /preferred return can't be/,
    );
    await expect(
      api.waterfall.save({
        tiers: [{ type: "roc" }, { type: "split", investorBps: 8000 }],
      }),
    ).rejects.toThrow(/preferred return can't be/);

    // Reordering and a new split ratio only affect future cash.
    await api.waterfall.save({
      tiers: [
        { type: "roc" },
        { type: "pref", rateBps: 800 },
        { type: "split", investorBps: 7000 },
      ],
    });
    expect((await api.waterfall.get()).prefLocked).toBe(true);

    // Voiding unlocks it.
    await api.distributions.void({ id: first.id });
    await api.waterfall.save({ tiers: changedRate });
    expect((await api.waterfall.get()).prefLocked).toBe(false);
  });

  it("refuses an invalid waterfall", async () => {
    await expect(
      api.waterfall.save({
        tiers: [{ type: "split", investorBps: 8000 }, { type: "roc" }],
      }),
    ).rejects.toThrow(/Nothing below Profit Split/);
  });
});

describe("cap table locking", () => {
  it("locks investments that took part in an active distribution", async () => {
    await api.distributions.finalize({
      date: "2026-01-01",
      amountCents: 10_000_00,
    });
    const { investments } = await api.investments.list();
    const a = investments[0]!;
    expect(a.locked).toBe(true);

    await expect(
      api.investments.update({ ...a, amountCents: 1 }),
    ).rejects.toThrow(/void every distribution dated on or after Jan 1, 2025/);
    await expect(
      api.investments.update({ ...a, investmentDate: "2025-02-01" }),
    ).rejects.toThrow(/was part of finalized distributions/);
    await expect(api.investments.delete({ id: a.id })).rejects.toThrow(
      /deleting it/,
    );

    // Names can always change.
    await api.investments.update({ ...a, investorName: "A (renamed)" });
    expect((await api.investments.list()).investments[0]!.investorName).toBe(
      "A (renamed)",
    );
  });

  it("only accepts new investments dated after the latest distribution", async () => {
    await api.distributions.finalize({
      date: "2026-01-01",
      amountCents: 10_000_00,
    });
    await expect(
      api.investments.create({
        investorName: "B",
        amountCents: 1_000_00,
        investmentDate: "2026-01-01",
      }),
    ).rejects.toThrow(/must be after Jan 1, 2026/);

    const b = await api.investments.create({
      investorName: "B",
      amountCents: 1_000_00,
      investmentDate: "2026-01-02",
    });
    // Unlocked investments can be edited, but still not moved to on/before the latest distribution.
    await api.investments.update({ ...b, amountCents: 2_000_00 });
    await expect(
      api.investments.update({ ...b, investmentDate: "2025-12-01" }),
    ).rejects.toThrow(/must be after/);
    await api.investments.delete({ id: b.id });
  });
});

describe("browser preview", () => {
  it("matches the server exactly when built from the data the browser has", async () => {
    await api.investments.create({
      investorName: "B",
      amountCents: 50_000_00,
      investmentDate: "2025-06-01",
    });
    await api.distributions.finalize({
      date: "2026-01-01",
      amountCents: 30_000_00,
    });
    const voided = await api.distributions.finalize({
      date: "2026-06-01",
      amountCents: 5_000_00,
    });
    await api.distributions.void({ id: voided.id });

    // What the browser does: plan from its cached queries.
    const inputs = toPlanInputs({
      investments: (await api.investments.list()).investments,
      tiers: (await api.waterfall.get()).tiers,
      distributions: await api.distributions.list(),
    });
    for (const [date, amountCents] of [
      ["2027-01-01", 77_777_77],
      ["2025-12-01", 1_000_00],
    ] as const) {
      expect(planDistribution(inputs, date, amountCents)).toEqual(
        await serverPlan(date, amountCents),
      );
    }
  });
});
