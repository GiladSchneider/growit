// Dates are plain "YYYY-MM-DD" strings everywhere. We only turn them into numbers to count days,
// and we parse them as UTC so time zones and daylight saving can never shift a day.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toUtcMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

/** Number of days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}

/** True for real calendar dates in YYYY-MM-DD form (rejects things like 2025-02-30). */
export function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const ms = toUtcMs(date);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === date;
}

/** Adds (or subtracts) whole days. */
export function addDays(date: string, days: number): string {
  return new Date(toUtcMs(date) + days * MS_PER_DAY).toISOString().slice(0, 10);
}
