import { allocationsToPayments } from "./run-distribution";
import type { DistributionResult, Investment, PriorPayment } from "./types";

export function makeInvestment(
  id: number,
  amountDollars: number,
  investmentDate: string,
  createdAt = `2020-01-01T00:00:00.${String(id).padStart(3, "0")}Z`,
): Investment {
  return {
    id,
    investorName: `Investor ${id}`,
    amountCents: amountDollars * 100,
    investmentDate,
    createdAt,
  };
}

/** Turns a distribution's investor allocations into prior payments for the next run. */
export function toPayments(result: DistributionResult): PriorPayment[] {
  return allocationsToPayments(result.date, result.allocations);
}
