import { z } from "zod";

import { isValidDate } from "~/lib/engine";
import { MAX_CENTS } from "~/lib/parse";

export const dateInput = z.string().refine(isValidDate, "Enter a valid date.");

export const centsInput = z
  .number()
  .int("Amounts are whole cents.")
  .positive("Enter an amount greater than $0.")
  .max(MAX_CENTS, "Amounts are limited to $10 billion.");

// Range checks for rates live in validateWaterfall, so the builder and the server agree.
export const tierInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("roc") }),
  z.object({ type: z.literal("pref"), rateBps: z.number().int() }),
  z.object({ type: z.literal("split"), investorBps: z.number().int() }),
]);
