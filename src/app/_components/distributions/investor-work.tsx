"use client";

import { ArrowRight } from "lucide-react";

import type { InvestorResult, TierType } from "~/lib/engine";
import { formatCents } from "~/lib/format";
import { cn } from "~/lib/utils";
import { PrefAccrualCard } from "../pref-accrual";
import { TIER_META } from "../tier-meta";

/** "Show the work" for one investor in a preview: how their pref accrued and how their balances move. */
export function InvestorWork({
  row,
  date,
  prefRateBps,
  tierTypes,
}: {
  row: InvestorResult;
  date: string;
  prefRateBps: number | null;
  tierTypes: TierType[];
}) {
  const { before, after } = row;

  return (
    <div className="grid gap-4 p-5 lg:grid-cols-5">
      <PrefAccrualCard
        className="lg:col-span-3"
        state={before}
        date={date}
        investmentDate={row.investor.investmentDate}
        prefRateBps={prefRateBps}
        paidLabel="Paid in earlier distributions"
      />

      <section className="bg-card rounded-lg border lg:col-span-2">
        <header className="border-b px-4 py-3">
          <h4 className="text-sm font-semibold">This distribution</h4>
        </header>
        <div className="space-y-2 px-4 py-3 text-sm">
          {tierTypes.map((type) => (
            <div key={type} className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span
                  className={cn("size-2 rounded-full", TIER_META[type].swatch)}
                />
                {TIER_META[type].label}
              </span>
              <span className="tabular-nums">
                {formatCents(row.byTier[type])}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between border-t pt-2 font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatCents(row.totalCents)}</span>
          </div>
        </div>
        <header className="border-y px-4 py-3">
          <h4 className="text-sm font-semibold">Balances</h4>
        </header>
        <div className="space-y-2.5 px-4 py-3 text-sm">
          <BalanceLine
            label="Unreturned capital"
            before={before.unreturnedCapitalCents}
            after={after.unreturnedCapitalCents}
          />
          <BalanceLine
            label="Pref owed"
            before={before.prefOwedCents}
            after={after.prefOwedCents}
          />
          <BalanceLine
            label="Received to date"
            before={before.totalReceivedCents}
            after={after.totalReceivedCents}
          />
        </div>
      </section>
    </div>
  );
}

function BalanceLine({
  label,
  before,
  after,
}: {
  label: string;
  before: number;
  after: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2 tabular-nums">
        <span className={cn(before !== after && "text-muted-foreground")}>
          {formatCents(before)}
        </span>
        {before !== after && (
          <>
            <ArrowRight className="text-muted-foreground size-3.5" />
            <span className="font-semibold">{formatCents(after)}</span>
          </>
        )}
      </span>
    </div>
  );
}
