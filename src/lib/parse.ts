/** $10 billion. Keeps every sum we compute well inside JavaScript's safe-integer range. */
export const MAX_CENTS = 10_000_000_000_00;

// Turning what people type into the app's units. Money becomes integer cents and percentages
// become basis points. Both are parsed from the text without floating-point math.

/** "1,234.5" or "$1234.50" → 123450. Returns null if it isn't a valid amount. */
export function parseMoneyToCents(text: string): number | null {
  const cleaned = text.replace(/[$,\s]/g, "");
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!match) return null;
  const [, whole = "0", fraction = ""] = match;
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

/** 123450 → "1,234.50" (for putting back into an input). */
export function centsToInputText(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** "8" → 800, "8.25" → 825. Returns NaN if it isn't a number with at most two decimals. */
export function parsePercentToBps(text: string): number {
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(text.trim());
  if (!match) return NaN;
  const [, whole = "0", fraction = ""] = match;
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

/** 825 → "8.25" */
export function bpsToPercentText(bps: number): string {
  return Number.isNaN(bps) ? "" : String(bps / 100);
}

/** Today's date in the user's time zone, as YYYY-MM-DD. */
export function todayLocal(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
