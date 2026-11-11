import DecimalJs from "decimal.js";

// Our own copy of Decimal so we don't change decimal.js's global settings. 40 significant digits
// is far more than we need: the biggest numbers we build are cents × basis points × days (~1e22),
// which stay exact integers at this precision.
export const Decimal = DecimalJs.clone({ precision: 40 });
export type Decimal = DecimalJs;

/** Rounds to whole cents, with halves going up. */
export function roundHalfUp(cents: Decimal): number {
  return cents.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/**
 * Splits `totalCents` between recipients in proportion to `weights`, in whole cents, so the parts
 * always add up to exactly `totalCents`. Uses the largest-remainder method:
 *
 * 1. Give everyone their exact share rounded down to the cent.
 * 2. Hand out the leftover cents one at a time to whoever lost the most in step 1.
 *
 * Callers pass recipients in tie-break order: when two recipients lost exactly the same amount,
 * the one that comes first gets the cent.
 *
 * Weights must be non-negative integers (cents or cents × bps) and must not all be zero.
 */
export function allocateProRata(
  totalCents: number,
  weights: DecimalJs.Value[],
): number[] {
  const totalWeight = weights.reduce<Decimal>(
    (acc, w) => acc.plus(w),
    new Decimal(0),
  );
  if (totalWeight.isZero()) {
    throw new Error("Cannot split money between recipients with zero weight");
  }

  // exact share = totalCents × weight / totalWeight. Both parts below are exact integer math:
  // `cents` is the share rounded down and `remainder` is what was lost (scaled by totalWeight).
  const shares = weights.map((weight, index) => {
    const scaled = new Decimal(totalCents).mul(weight);
    return {
      index,
      cents: scaled.divToInt(totalWeight).toNumber(),
      remainder: scaled.mod(totalWeight),
    };
  });

  const leftover = totalCents - sum(shares.map((s) => s.cents));

  // Largest remainder first. Equal remainders keep the caller's order. Each recipient loses less
  // than one cent in step 1, so `leftover` is always smaller than the number of recipients.
  const byRemainder = [...shares].sort(
    (a, b) => b.remainder.comparedTo(a.remainder) || a.index - b.index,
  );
  for (let i = 0; i < leftover; i++) {
    byRemainder[i]!.cents += 1;
  }

  return shares.map((s) => s.cents);
}
