import { allocationsToPayments } from "./run-distribution";
import type { DistributionResult, Investor, PriorPayment } from "./types";

export function makeInvestor(
  id: number,
  amountDollars: number,
  investmentDate: string,
  createdAt = `2020-01-01T00:00:00.${String(id).padStart(3, "0")}Z`,
): Investor {
  return {
    id,
    name: `Investor ${id}`,
    amountCents: amountDollars * 100,
    investmentDate,
    createdAt,
  };
}

/** Turns a distribution's investor allocations into prior payments for the next run. */
export function toPayments(result: DistributionResult): PriorPayment[] {
  return allocationsToPayments(result.date, result.allocations);
}
