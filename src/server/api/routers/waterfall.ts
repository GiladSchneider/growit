import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { prefRateOf, validateWaterfall } from "~/lib/engine";
import { tierInput } from "~/server/api/inputs";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { waterfallTiers } from "~/server/db/schema";
import { loadLatestActiveDistribution, loadTiers } from "~/server/ledger";

// Pref-terms lock: pref owed is always computed from the full history with the current rate, so
// changing the rate (or adding/removing the tier) would change what was owed for periods that were
// already settled. E.g. at 8%, $8,000 of pref was paid for year one; switching to 10% would make
// year one worth $10,000 and invent $2,000 of owed pref. Tier order and the split ratio only
// change how future cash is routed, so they stay editable.
export const PREF_LOCKED_MESSAGE =
  "The preferred return can't be added, removed or changed while there are finalized distributions, " +
  "because it determines what investors were already owed. Tier order and the profit split can still be changed. " +
  "To change the preferred return, void the distributions first.";

export const waterfallRouter = createTRPCRouter({
  get: publicProcedure.query(async ({ ctx }) => {
    const [tiers, latest] = await Promise.all([
      loadTiers(ctx.db),
      loadLatestActiveDistribution(ctx.db),
    ]);
    return { tiers, prefLocked: latest !== null };
  }),

  save: publicProcedure
    .input(z.object({ tiers: z.array(tierInput).max(10) }))
    .mutation(async ({ ctx, input }) => {
      const { errors } = validateWaterfall(input.tiers);
      if (errors.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: errors.map((e) => e.message).join(" "),
        });
      }

      await ctx.db.transaction(async (tx) => {
        const [current, latest] = await Promise.all([
          loadTiers(tx),
          loadLatestActiveDistribution(tx),
        ]);
        if (
          latest !== null &&
          prefRateOf(current) !== prefRateOf(input.tiers)
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: PREF_LOCKED_MESSAGE,
          });
        }

        // There's a single waterfall, so saving replaces every tier.
        await tx.delete(waterfallTiers);
        await tx.insert(waterfallTiers).values(
          input.tiers.map((tier, position) => ({
            position,
            type: tier.type,
            prefRateBps: tier.type === "pref" ? tier.rateBps : null,
            investorSplitBps: tier.type === "split" ? tier.investorBps : null,
          })),
        );
      });
    }),
});
