"use client";

import type { InvestorState } from "~/lib/engine";
import { formatBps, formatCents, formatDate } from "~/lib/format";
import { cn } from "~/lib/utils";

/**
 * How one investment's preferred return accrued up to `date`, period by period. Used in a
 * distribution's "show the work" and in the investment panel.
 */
export function PrefAccrualCard({
  state,
  date,
  investmentDate,
  prefRateBps,
  paidLabel = "Paid",
  className,
}: {
  state: InvestorState;
  date: string;
  investmentDate: string;
  prefRateBps: number | null;
  paidLabel?: string;
  className?: string;
}) {
  return (
    <section className={cn("bg-card rounded-lg border", className)}>
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h4 className="text-sm font-semibold">
          Preferred return to {formatDate(date)}
        </h4>
        {prefRateBps !== null && (
          <span className="rounded-md bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">
            {formatBps(prefRateBps)}
          </span>
        )}
      </header>
      {prefRateBps === null ? (
        <p className="text-muted-foreground p-4 text-sm">
          No preferred return tier.
        </p>
      ) : state.accrualPeriods.length === 0 ? (
        <p className="text-muted-foreground p-4 text-sm">
          Invested {formatDate(investmentDate)}. Nothing accrued yet.
        </p>
      ) : (
        <div className="px-4 pb-3">
          <table className="w-full text-sm tabular-nums">
            <thead className="text-muted-foreground text-[11px] tracking-wider uppercase">
              <tr>
                <th className="py-2 text-left font-semibold">Period</th>
                <th className="py-2 text-right font-semibold">Days</th>
                <th className="py-2 text-right font-semibold">
                  Unreturned capital
                </th>
                <th className="py-2 text-right font-semibold">Accrued</th>
              </tr>
            </thead>
            <tbody>
              {state.accrualPeriods.map((period) => (
                <tr key={period.from} className="border-t">
                  <td className="py-2">
                    {formatDate(period.from)}{" "}
                    <span className="text-muted-foreground">→</span>{" "}
                    {formatDate(period.to)}
                  </td>
                  <td className="py-2 text-right">{period.days}</td>
                  <td className="py-2 text-right">
                    {formatCents(period.unreturnedCapitalCents)}
                  </td>
                  <td className="py-2 text-right">
                    {formatCents(Number(period.accruedCents))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {/* Rounded accrual is exactly paid + owed, so these three lines always add up. */}
              <SummaryLine
                label="Total accrued"
                value={formatCents(state.prefPaidCents + state.prefOwedCents)}
                border
              />
              <SummaryLine
                label={paidLabel}
                value={`− ${formatCents(state.prefPaidCents)}`}
              />
              <SummaryLine
                label="Owed"
                value={formatCents(state.prefOwedCents)}
                strong
              />
            </tfoot>
          </table>
          <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
            Unreturned capital × {formatBps(prefRateBps)} × days ÷ 365. A new
            period starts each time capital is returned.
          </p>
        </div>
      )}
    </section>
  );
}

function SummaryLine({
  label,
  value,
  border,
  strong,
}: {
  label: string;
  value: string;
  border?: boolean;
  strong?: boolean;
}) {
  return (
    <tr className={border ? "border-t" : undefined}>
      <td
        colSpan={3}
        className={cn(
          "py-1.5 text-right",
          strong ? "font-semibold" : "text-muted-foreground",
        )}
      >
        {label}
      </td>
      <td className={cn("py-1.5 text-right", strong && "font-semibold")}>
        {value}
      </td>
    </tr>
  );
}
