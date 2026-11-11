// Database reads and business rules shared by the routers. "Active" distributions are finalized
// ones that haven't been voided; only they count as money paid.
import { and, asc, eq } from "drizzle-orm";

import type { Investor, PriorPayment, Tier } from "~/lib/engine";
import type { PlanInputs } from "~/lib/plan";
import type { Db } from "~/server/db";
import {
  distributionAllocations,
  distributions,
  investors,
  waterfallTiers,
} from "~/server/db/schema";

export async function loadInvestors(db: Db): Promise<Investor[]> {
  return db
    .select()
    .from(investors)
    .orderBy(asc(investors.investmentDate), asc(investors.id));
}

export async function loadTiers(db: Db): Promise<Tier[]> {
  const rows = await db
    .select()
    .from(waterfallTiers)
    .orderBy(asc(waterfallTiers.position));
  return rows.map((row): Tier => {
    switch (row.type) {
      case "roc":
        return { type: "roc" };
      case "pref":
        return { type: "pref", rateBps: row.prefRateBps ?? 0 };
      case "split":
        return { type: "split", investorBps: row.investorSplitBps ?? 0 };
    }
  });
}

/** Active distributions in ledger order: by date, then by creation (ids only go up). */
export async function loadActiveDistributions(db: Db) {
  return db
    .select()
    .from(distributions)
    .where(eq(distributions.status, "finalized"))
    .orderBy(asc(distributions.date), asc(distributions.id));
}

export async function loadLatestActiveDistribution(db: Db) {
  const active = await loadActiveDistributions(db);
  return active.at(-1) ?? null;
}

/** Every payment to an investor from an active distribution. */
export async function loadPriorPayments(db: Db): Promise<PriorPayment[]> {
  const rows = await db
    .select({
      date: distributions.date,
      investorId: distributionAllocations.investorId,
      tierType: distributionAllocations.tierType,
      amountCents: distributionAllocations.amountCents,
    })
    .from(distributionAllocations)
    .innerJoin(
      distributions,
      eq(distributionAllocations.distributionId, distributions.id),
    )
    .where(
      and(
        eq(distributions.status, "finalized"),
        eq(distributionAllocations.recipientType, "investor"),
      ),
    );
  return rows.flatMap((row) =>
    row.investorId === null ? [] : [{ ...row, investorId: row.investorId }],
  );
}

/** Everything the planner needs, read from the database. */
export async function loadPlanInputs(db: Db): Promise<PlanInputs> {
  const [allInvestors, tiers, active, priorPayments] = await Promise.all([
    loadInvestors(db),
    loadTiers(db),
    loadActiveDistributions(db),
    loadPriorPayments(db),
  ]);
  return {
    investors: allInvestors,
    tiers,
    activeDistributions: active.map(({ id, date, amountCents }) => ({
      id,
      date,
      amountCents,
    })),
    priorPayments,
  };
}
