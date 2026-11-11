"use client";

import type { DistributionResult } from "~/lib/engine";
import { formatCents } from "~/lib/format";
import { cn } from "~/lib/utils";
import { MANAGER_META, TIER_META } from "../tier-meta";

type Segment = { key: string; label: string; cents: number; swatch: string };

/**
 * A stacked bar showing where the money goes: one segment per tier in waterfall order, the
 * managers' share of the split, and anything left undistributed.
 */
export function AllocationBreakdown({
  result,
}: {
  result: DistributionResult;
}) {
  const segments: Segment[] = result.tierTotals.flatMap(
    ({ type, amountCents }) =>
      type === "split"
        ? [
            {
              key: "split",
              label: "Profit split · investors",
              cents: amountCents - result.managerCents,
              swatch: TIER_META.split.swatch,
            },
            {
              key: "managers",
              label: "Profit split · managers",
              cents: result.managerCents,
              swatch: MANAGER_META.swatch,
            },
          ]
        : [
            {
              key: type,
              label: TIER_META[type].label,
              cents: amountCents,
              swatch: TIER_META[type].swatch,
            },
          ],
  );
  if (result.undistributedCents > 0) {
    segments.push({
      key: "undistributed",
      label: "Undistributed",
      cents: result.undistributedCents,
      swatch:
        "bg-[repeating-linear-gradient(45deg,var(--color-amber-300),var(--color-amber-300)_4px,var(--color-amber-100)_4px,var(--color-amber-100)_8px)]",
    });
  }

  const share = (cents: number) =>
    result.amountCents > 0 ? cents / result.amountCents : 0;

  return (
    <div className="space-y-4">
      <div className="bg-muted flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
        {segments
          .filter((s) => s.cents > 0)
          .map((s) => (
            <div
              key={s.key}
              className={cn(
                "h-full first:rounded-l-full last:rounded-r-full",
                s.swatch,
              )}
              style={{ width: `${share(s.cents) * 100}%` }}
              title={`${s.label}: ${formatCents(s.cents)}`}
            />
          ))}
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {segments.map((s) => (
          <div key={s.key}>
            <dt className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <span className={cn("size-2 shrink-0 rounded-full", s.swatch)} />
              {s.label}
            </dt>
            <dd className="mt-0.5 flex items-baseline gap-1.5">
              <span className="font-semibold tabular-nums">
                {formatCents(s.cents)}
              </span>
              <span className="text-muted-foreground text-xs tabular-nums">
                {Math.round(share(s.cents) * 1000) / 10}%
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
