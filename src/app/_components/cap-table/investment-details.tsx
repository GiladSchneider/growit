"use client";

import { Pencil, Trash2 } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  computeInvestorState,
  prefRateOf,
  type InvestorState,
  type TierType,
} from "~/lib/engine";
import { formatCents, formatDate } from "~/lib/format";
import { todayLocal } from "~/lib/parse";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";
import { PrefAccrualCard } from "../pref-accrual";
import { Hint } from "../shared";
import { TIER_META } from "../tier-meta";
import { Money } from "../ui-kit";
import { usePlanInputs } from "../use-plan-inputs";
import type { InvestorRow } from "./investor-dialog";

const LOCKED_HINT =
  "Included in a finalized distribution, so it can't be deleted and its amount and date can't change. Void that distribution to unlock it.";

/**
 * Everything about one investment, shown when its cap table row is expanded: where it stands
 * today, how its preferred return accrued, and every payment it received.
 */
export function InvestmentDetails({
  investor,
  onEdit,
  onDelete,
}: {
  investor: InvestorRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const inputs = usePlanInputs();
  const distributions = api.distributions.list.useQuery().data ?? [];
  const today = todayLocal();

  // The same function and inputs the server uses, run here on data that's already cached.
  const prefRateBps = inputs ? prefRateOf(inputs.tiers) : null;
  const state =
    inputs && investor.investmentDate <= today
      ? computeInvestorState(investor, inputs.priorPayments, today, prefRateBps)
      : null;

  // Every distribution this investment took part in, newest first (the list is already in that order).
  const payments = distributions.flatMap((d) => {
    const mine = d.allocations.filter((a) => a.investorId === investor.id);
    if (mine.length === 0) return [];
    const paidIn = (type: TierType) =>
      mine
        .filter((a) => a.tierType === type)
        .reduce((sum, a) => sum + a.amountCents, 0);
    return [
      {
        id: d.id,
        date: d.date,
        voided: d.status === "voided",
        roc: paidIn("roc"),
        pref: paidIn("pref"),
        split: paidIn("split"),
        total: mine.reduce((sum, a) => sum + a.amountCents, 0),
      },
    ];
  });

  return (
    <div className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="text-sm font-semibold">
          {state
            ? "Balance today"
            : `Starts ${formatDate(investor.investmentDate)}, so there's no balance yet`}
        </h4>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil /> {investor.locked ? "Rename" : "Edit"}
          </Button>
          <Hint text={investor.locked ? LOCKED_HINT : null}>
            <Button
              variant="outline"
              size="sm"
              disabled={investor.locked}
              onClick={onDelete}
            >
              <Trash2 /> Delete
            </Button>
          </Hint>
        </div>
      </div>

      {state && (
        <div className="grid items-start gap-4 lg:grid-cols-5">
          <Figures
            className="lg:col-span-2"
            state={state}
            invested={investor.amountCents}
          />
          <PrefAccrualCard
            className="lg:col-span-3"
            state={state}
            date={today}
            investmentDate={investor.investmentDate}
            prefRateBps={prefRateBps}
          />
        </div>
      )}

      <section className="bg-card overflow-x-auto rounded-lg border">
        <header className="border-b px-4 py-3">
          <h4 className="text-sm font-semibold">Payments</h4>
        </header>
        {payments.length === 0 ? (
          <p className="text-muted-foreground p-4 text-sm">
            No distributions yet.
          </p>
        ) : (
          <table className="w-full text-sm tabular-nums">
            <thead className="text-muted-foreground text-[11px] tracking-wider uppercase">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">Date</th>
                <th className="px-4 py-2 text-right font-semibold">
                  {TIER_META.roc.short}
                </th>
                <th className="px-4 py-2 text-right font-semibold">
                  {TIER_META.pref.short}
                </th>
                <th className="px-4 py-2 text-right font-semibold">
                  {TIER_META.split.short}
                </th>
                <th className="px-4 py-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr
                  key={p.id}
                  className={cn(
                    "border-t",
                    p.voided && "text-muted-foreground",
                  )}
                >
                  <td className="px-4 py-2 whitespace-nowrap">
                    <span className={cn(p.voided && "line-through")}>
                      {formatDate(p.date)}
                    </span>
                    {p.voided && <span className="ml-2 text-xs">Voided</span>}
                  </td>
                  {[p.roc, p.pref, p.split].map((cents, i) => (
                    <td
                      key={i}
                      className={cn(
                        "px-4 py-2 text-right",
                        p.voided && "line-through",
                      )}
                    >
                      <Money cents={cents} zero="dash" />
                    </td>
                  ))}
                  <td
                    className={cn(
                      "px-4 py-2 text-right font-medium",
                      p.voided && "line-through",
                    )}
                  >
                    <Money cents={p.total} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

/** The balance figures as label/value pairs, with each tier's color where it applies. */
function Figures({
  state,
  invested,
  className,
}: {
  state: InvestorState;
  invested: number;
  className?: string;
}) {
  const figures: {
    label: string;
    cents: number;
    dot?: string;
    strong?: boolean;
  }[] = [
    { label: "Invested", cents: invested },
    {
      label: "Capital returned",
      cents: state.capitalReturnedCents,
      dot: TIER_META.roc.swatch,
    },
    { label: "Unreturned capital", cents: state.unreturnedCapitalCents },
    {
      label: "Pref paid",
      cents: state.prefPaidCents,
      dot: TIER_META.pref.swatch,
    },
    {
      label: "Pref owed",
      cents: state.prefOwedCents,
      dot: TIER_META.pref.swatch,
    },
    {
      label: "Profit split received",
      cents: state.splitPaidCents,
      dot: TIER_META.split.swatch,
    },
    { label: "Total received", cents: state.totalReceivedCents, strong: true },
  ];
  return (
    <dl
      className={cn(
        "bg-card space-y-2.5 rounded-lg border px-4 py-3 text-sm",
        className,
      )}
    >
      {figures.map((f) => (
        <div
          key={f.label}
          className={cn(
            "flex items-center justify-between gap-3",
            f.strong && "border-t pt-2.5",
          )}
        >
          <dt className="text-muted-foreground flex items-center gap-1.5">
            {f.dot && <span className={cn("size-2 rounded-full", f.dot)} />}
            {f.label}
          </dt>
          <dd className={cn("tabular-nums", f.strong && "font-semibold")}>
            {formatCents(f.cents)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
