import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { formatDate } from "~/lib/format";
import { centsInput, dateInput } from "~/server/api/inputs";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import type { Db } from "~/server/db";
import { investments } from "~/server/db/schema";
import { loadInvestments, loadLatestActiveDistribution } from "~/server/ledger";

// Cap table locking: once an investment has taken part in an active distribution (invested on or
// before its date), their amount and date shaped money that was already paid, so they're frozen.
// Names can always change. New investments must come after the latest active distribution.

function isLocked(investmentDate: string, latestDate: string | null): boolean {
  return latestDate !== null && investmentDate <= latestDate;
}

async function latestActiveDate(db: Db): Promise<string | null> {
  return (await loadLatestActiveDistribution(db))?.date ?? null;
}

function lockedError(
  action: "edit" | "delete",
  investmentDate: string,
): TRPCError {
  const what =
    action === "edit" ? "changing its amount or date" : "deleting it";
  return new TRPCError({
    code: "CONFLICT",
    message:
      `This investment was part of finalized distributions, so ${what} would change money that was already paid. ` +
      `To do this, first void every distribution dated on or after ${formatDate(investmentDate)}, latest first.` +
      (action === "edit" ? " The name can always be changed." : ""),
  });
}

function assertAfterLatest(investmentDate: string, latestDate: string | null) {
  if (latestDate !== null && investmentDate <= latestDate) {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        `The investment date must be after ${formatDate(latestDate)}, the date of the latest distribution. ` +
        "Earlier investments would change what was already paid. To add one, void the later distributions first.",
    });
  }
}

const investmentFields = z.object({
  investorName: z.string().trim().min(1, "Enter a name.").max(200),
  amountCents: centsInput,
  investmentDate: dateInput,
});

export const investmentsRouter = createTRPCRouter({
  list: publicProcedure.query(async ({ ctx }) => {
    const [rows, latestDate] = await Promise.all([
      loadInvestments(ctx.db),
      latestActiveDate(ctx.db),
    ]);
    const totalCents = rows.reduce((sum, row) => sum + row.amountCents, 0);
    return {
      investments: rows.map((row) => ({
        ...row,
        ownership: totalCents > 0 ? row.amountCents / totalCents : 0,
        locked: isLocked(row.investmentDate, latestDate),
      })),
      totalCents,
      latestDistributionDate: latestDate,
    };
  }),

  create: publicProcedure
    .input(investmentFields)
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        assertAfterLatest(input.investmentDate, await latestActiveDate(tx));
        const [row] = await tx.insert(investments).values(input).returning();
        return row!;
      });
    }),

  update: publicProcedure
    .input(investmentFields.extend({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const existing = await tx.query.investments.findFirst({
          where: eq(investments.id, input.id),
        });
        if (!existing)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Investment not found.",
          });

        const latestDate = await latestActiveDate(tx);
        const termsChanged =
          input.amountCents !== existing.amountCents ||
          input.investmentDate !== existing.investmentDate;
        if (termsChanged) {
          if (isLocked(existing.investmentDate, latestDate)) {
            throw lockedError("edit", existing.investmentDate);
          }
          assertAfterLatest(input.investmentDate, latestDate);
        }

        const [row] = await tx
          .update(investments)
          .set({
            investorName: input.investorName,
            amountCents: input.amountCents,
            investmentDate: input.investmentDate,
          })
          .where(eq(investments.id, input.id))
          .returning();
        return row!;
      });
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction(async (tx) => {
        const existing = await tx.query.investments.findFirst({
          where: eq(investments.id, input.id),
        });
        if (!existing)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Investment not found.",
          });

        const latestDate = await latestActiveDate(tx);
        if (isLocked(existing.investmentDate, latestDate)) {
          throw lockedError("delete", existing.investmentDate);
        }

        await tx.delete(investments).where(eq(investments.id, input.id));
      });
    }),
});
