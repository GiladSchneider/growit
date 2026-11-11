"use client";

import { ChevronRight } from "lucide-react";
import { Fragment, useState } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import type { TierType } from "~/lib/engine";
import { formatPercent } from "~/lib/format";
import { cn } from "~/lib/utils";
import { Avatar, Money, TierIcon, TierLabel } from "../ui-kit";

export type RecipientRow = {
  key: string;
  name: string;
  kind: "investor" | "managers";
  /** Share of the eligible investment, or null where it doesn't apply. */
  ownership: number | null;
  byTier: Partial<Record<TierType, number>>;
  totalCents: number;
  /** Shown when the row is expanded. Rows without details can't be expanded. */
  details?: React.ReactNode;
};

/**
 * One row per recipient and one column per tier, in waterfall order, plus a total column and a
 * totals footer. Used by the preview and by the history.
 */
export function RecipientTable({
  tierTypes,
  rows,
}: {
  tierTypes: TierType[];
  rows: RecipientRow[];
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (key: string) => {
    const next = new Set(open);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setOpen(next);
  };

  const showOwnership = rows.some((row) => row.ownership !== null);
  const expandable = rows.some((row) => row.details !== undefined);
  const columnCount =
    tierTypes.length + 2 + (showOwnership ? 1 : 0) + (expandable ? 1 : 0);
  const tierTotal = (type: TierType) =>
    rows.reduce((sum, row) => sum + (row.byTier[type] ?? 0), 0);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {expandable && <TableHead className="w-10" />}
          <TableHead>Recipient</TableHead>
          {showOwnership && (
            <TableHead className="text-right">Ownership</TableHead>
          )}
          {tierTypes.map((type) => (
            <TableHead key={type} className="text-right">
              <TierLabel type={type} className="justify-end" />
            </TableHead>
          ))}
          <TableHead className="text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const isOpen = open.has(row.key);
          return (
            <Fragment key={row.key}>
              <TableRow
                className={cn(
                  row.details && "cursor-pointer",
                  isOpen && "bg-muted/40",
                )}
                onClick={row.details ? () => toggle(row.key) : undefined}
              >
                {expandable && (
                  <TableCell className="pr-0">
                    {row.details && (
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-label={`Show the calculation for ${row.name}`}
                        className="text-muted-foreground hover:text-foreground flex size-6 items-center justify-center rounded-md"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle(row.key);
                        }}
                      >
                        <ChevronRight
                          className={cn(
                            "size-4 transition-transform",
                            isOpen && "rotate-90",
                          )}
                        />
                      </button>
                    )}
                  </TableCell>
                )}
                <TableCell>
                  <div className="flex items-center gap-3">
                    {row.kind === "managers" ? (
                      <TierIcon type="managers" />
                    ) : (
                      <Avatar name={row.name} />
                    )}
                    <span className="font-medium">{row.name}</span>
                  </div>
                </TableCell>
                {showOwnership && (
                  <TableCell className="text-muted-foreground text-right tabular-nums">
                    {row.ownership === null
                      ? "—"
                      : formatPercent(row.ownership)}
                  </TableCell>
                )}
                {tierTypes.map((type) => (
                  <TableCell key={type} className="text-right">
                    {row.byTier[type] === undefined ? (
                      <span className="text-muted-foreground/50">n/a</span>
                    ) : (
                      <Money cents={row.byTier[type]} zero="dash" />
                    )}
                  </TableCell>
                ))}
                <TableCell className="text-right font-semibold">
                  <Money cents={row.totalCents} />
                </TableCell>
              </TableRow>
              {row.details && isOpen && (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={columnCount}
                    className="bg-muted/30 p-0 whitespace-normal"
                  >
                    {row.details}
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
      </TableBody>
      <TableFooter>
        <TableRow>
          {expandable && <TableCell />}
          <TableCell className="font-semibold">Total</TableCell>
          {showOwnership && <TableCell />}
          {tierTypes.map((type) => (
            <TableCell key={type} className="text-right font-semibold">
              <Money cents={tierTotal(type)} />
            </TableCell>
          ))}
          <TableCell className="text-right font-semibold">
            <Money cents={rows.reduce((sum, row) => sum + row.totalCents, 0)} />
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
