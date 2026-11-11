// Display helpers shared by the server (error messages) and the UI.

const dollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** 1234567 → "$12,345.67" */
export function formatCents(cents: number): string {
  return dollars.format(cents / 100);
}

/** "2027-03-01" → "Mar 1, 2027". Formatted in UTC so the day never shifts. */
export function formatDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** 800 → "8%", 825 → "8.25%" */
export function formatBps(bps: number): string {
  return `${bps / 100}%`;
}

/** 0.3333 → "33.33%" */
export function formatPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(2)}%`;
}

/** ["a"] → "a", ["a", "b"] → "a and b", ["a", "b", "c"] → "a, b and c" */
export function formatList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function plural(
  count: number,
  singular: string,
  pluralForm = `${singular}s`,
): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
