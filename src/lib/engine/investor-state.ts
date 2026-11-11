import { daysBetween } from "./dates";
import { Decimal, roundHalfUp, sum } from "./money";
import type {
  AccrualPeriod,
  Investor,
  InvestorState,
  PriorPayment,
  TierType,
} from "./types";

// Pref is simple interest on unreturned capital, Actual/365:
//   accrued = Σ unreturnedCapital × (rateBps / 10,000) × days / 365
// We add up the integer part (unreturnedCapital × rateBps × days) and divide by this once at the end,
// so the only rounding is the final round to cents.
const ACCRUAL_DENOMINATOR = 10_000 * 365;

/**
 * Where one investor stands as of `asOfDate`: capital returned so far, pref accrued and still owed,
 * and how the pref was accrued (for showing the work in the UI).
 *
 * Payments dated on `asOfDate` count (they belong to earlier distributions that day). Payments
 * after it are ignored, so balances for a past date never include payments that hadn't happened yet.
 *
 * Pref accrues through `asOfDate`. For a distribution, call this with the distribution's date and
 * the payments from *before* it: pref accrues up to the distribution date, then the distribution
 * pays it.
 */
export function computeInvestorState(
  investor: Investor,
  priorPayments: PriorPayment[],
  asOfDate: string,
  prefRateBps: number | null,
): InvestorState {
  const payments = priorPayments.filter(
    (p) => p.investorId === investor.id && p.date <= asOfDate,
  );
  const paidIn = (tierType: TierType) =>
    sum(
      payments.filter((p) => p.tierType === tierType).map((p) => p.amountCents),
    );

  const capitalReturnedCents = paidIn("roc");
  const prefPaidCents = paidIn("pref");
  const splitPaidCents = paidIn("split");

  const base = {
    capitalReturnedCents,
    unreturnedCapitalCents: investor.amountCents - capitalReturnedCents,
    prefPaidCents,
    splitPaidCents,
    totalReceivedCents: capitalReturnedCents + prefPaidCents + splitPaidCents,
  };

  if (prefRateBps === null) {
    return {
      ...base,
      prefAccruedCents: "0",
      prefOwedCents: 0,
      accrualPeriods: [],
    };
  }

  const { periods, numerator } = buildAccrualPeriods(
    investor,
    payments,
    asOfDate,
    prefRateBps,
  );
  const prefAccrued = numerator.div(ACCRUAL_DENOMINATOR);

  // Paid amounts are whole cents, so this equals round(accrued - paid). It can't go negative:
  // every pref payment was at most what was owed at the time, and accrual never goes down.
  // Unpaid pref stays owed even after capital is fully returned; it just stops growing.
  const prefOwedCents = roundHalfUp(prefAccrued) - prefPaidCents;

  return {
    ...base,
    prefAccruedCents: prefAccrued.toFixed(),
    prefOwedCents,
    accrualPeriods: periods,
  };
}

/**
 * Unreturned capital only changes on days when capital is returned, so we cut the time from the
 * investment date to `asOfDate` into periods at those days. Each period accrues at its own balance.
 */
function buildAccrualPeriods(
  investor: Investor,
  payments: PriorPayment[],
  asOfDate: string,
  prefRateBps: number,
): { periods: AccrualPeriod[]; numerator: Decimal } {
  const capitalReturnedOn = new Map<string, number>();
  for (const p of payments) {
    if (p.tierType === "roc") {
      capitalReturnedOn.set(
        p.date,
        (capitalReturnedOn.get(p.date) ?? 0) + p.amountCents,
      );
    }
  }

  const periods: AccrualPeriod[] = [];
  let numerator = new Decimal(0);

  const addPeriod = (from: string, to: string, balance: number) => {
    const days = daysBetween(from, to);
    if (days <= 0) return;
    const periodNumerator = new Decimal(balance).mul(prefRateBps).mul(days);
    numerator = numerator.plus(periodNumerator);
    periods.push({
      from,
      to,
      days,
      unreturnedCapitalCents: balance,
      accruedCents: periodNumerator.div(ACCRUAL_DENOMINATOR).toFixed(),
    });
  };

  let from = investor.investmentDate;
  let balance = investor.amountCents;
  for (const date of [...capitalReturnedOn.keys()].sort()) {
    addPeriod(from, date, balance);
    // The return lowers the balance from this day on.
    balance -= capitalReturnedOn.get(date) ?? 0;
    from = date;
  }
  addPeriod(from, asOfDate, balance);

  return { periods, numerator };
}
