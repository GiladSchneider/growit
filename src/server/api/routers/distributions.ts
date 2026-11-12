import { TRPCError } from "@trpc/server";
import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { formatDate } from "~/lib/format";
import { centsInput, dateInput } from "~/server/api/inputs";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {
  distributionAllocations,
  distributions,
  investments,
} from "~/server/db/schema";
import { planDistribution } from "~/lib/plan";
import { loadLatestActiveDistribution, loadPlanInputs } from "~/server/ledger";

export const distributionsRouter = createTRPCRouter({
  /** Every distribution, newest first, voided ones included (they're the audit trail). */
  list: publicProcedure.query(async ({ ctx }) => {
    const [rows, allocations, investmentRows, latest] = await Promise.all([
      ctx.db
        .select()
        .from(distributions)
        .orderBy(desc(distributions.date), desc(distributions.id)),
      ctx.db
        .select()
        .from(distributionAllocations)
        .orderBy(asc(distributionAllocations.id)),
      ctx.db
        .select({ id: investments.id, investorName: investments.investorName })
        .from(investments),
      loadLatestActiveDistribution(ctx.db),
    ]);
    const names = new Map(investmentRows.map((i) => [i.id, i.investorName]));

    return rows.map((row) => ({
      ...row,
      allocations: allocations
        .filter((a) => a.distributionId === row.id)
        .map((a) => ({
          ...a,
          recipientName:
            a.investmentId === null
              ? "Managers"
              : (names.get(a.investmentId) ?? "Removed investment"),
        })),
      // Only the latest active distribution can be voided.
      canVoid: row.id === latest?.id,
    }));
  }),

  finalize: publicProcedure
    .input(z.object({ date: dateInput, amountCents: centsInput }))
    .mutation(async ({ ctx, input }) => {
      // The browser already previewed this with the same planner, but the ledger may have changed
      // since (another tab, another user). Re-plan inside the transaction; this result is what's stored.
      return ctx.db.transaction(async (tx) => {
        const plan = planDistribution(
          await loadPlanInputs(tx),
          input.date,
          input.amountCents,
        );
        if (plan.problems.length > 0 || plan.result === null) {
          throw new TRPCError({
            code: "CONFLICT",
            message: plan.problems.map((p) => p.message).join(" "),
          });
        }

        const [row] = await tx
          .insert(distributions)
          .values({
            date: input.date,
            amountCents: input.amountCents,
            status: "finalized",
            waterfallSnapshot: plan.tiers,
          })
          .returning();
        await tx.insert(distributionAllocations).values(
          plan.result.allocations.map((allocation) => ({
            ...allocation,
            distributionId: row!.id,
          })),
        );
        return { id: row!.id };
      });
    }),

  /**
   * Void means "this record was entered in error". The record stays, marked voided, and its
   * allocations stop counting. Only the latest active distribution can be voided, because every
   * later distribution was calculated on top of the earlier ones.
   */
  void: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction(async (tx) => {
        const target = await tx.query.distributions.findFirst({
          where: eq(distributions.id, input.id),
        });
        if (!target)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Distribution not found.",
          });
        if (target.status === "voided") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This distribution is already voided.",
          });
        }

        const latest = await loadLatestActiveDistribution(tx);
        if (latest?.id !== target.id) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              `Only the most recent distribution (${formatDate(latest!.date)}) can be voided. ` +
              "Distributions are undone latest first, because each one was calculated on top of the ones before it.",
          });
        }

        await tx
          .update(distributions)
          .set({ status: "voided", voidedAt: new Date().toISOString() })
          .where(eq(distributions.id, target.id));
      });
    }),
});
