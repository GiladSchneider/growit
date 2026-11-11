"use client";

import { ChevronRight, Undo2 } from "lucide-react";
import { Fragment, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import type { Tier, TierType } from "~/lib/engine";
import { formatBps, formatCents, formatDate } from "~/lib/format";
import { cn } from "~/lib/utils";
import { api, type RouterOutputs } from "~/trpc/react";
import { errorMessage } from "../shared";
import { TIER_META } from "../tier-meta";
import { EmptyState, Money, Panel } from "../ui-kit";
import { RecipientTable, type RecipientRow } from "./recipient-table";

type Distribution = RouterOutputs["distributions"]["list"][number];

const TIER_COLUMNS: TierType[] = ["roc", "pref", "split"];

export function DistributionHistory({
  distributions,
}: {
  distributions: Distribution[];
}) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <Panel title="History">
      {distributions.length === 0 ? (
        <EmptyState title="No distributions yet" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              {TIER_COLUMNS.map((type) => (
                <TableHead key={type} className="text-right">
                  {TIER_META[type].short}
                </TableHead>
              ))}
              <TableHead>Status</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {distributions.map((d) => {
              const voided = d.status === "voided";
              const isOpen = open === d.id;
              const tierTotal = (type: TierType) =>
                d.allocations
                  .filter((a) => a.tierType === type)
                  .reduce((sum, a) => sum + a.amountCents, 0);
              return (
                <Fragment key={d.id}>
                  <TableRow
                    className={cn(
                      "cursor-pointer",
                      isOpen && "bg-muted/40",
                      voided && "text-muted-foreground",
                    )}
                    onClick={() => setOpen(isOpen ? null : d.id)}
                  >
                    <TableCell className="pr-0">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-label={`Details for ${formatDate(d.date)}`}
                        className="text-muted-foreground flex size-6 items-center justify-center"
                      >
                        <ChevronRight
                          className={cn(
                            "size-4 transition-transform",
                            isOpen && "rotate-90",
                          )}
                        />
                      </button>
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatDate(d.date)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-semibold",
                        voided && "line-through",
                      )}
                    >
                      <Money cents={d.amountCents} />
                    </TableCell>
                    {TIER_COLUMNS.map((type) => (
                      <TableCell key={type} className="text-right">
                        {d.waterfallSnapshot.some((t) => t.type === type) ? (
                          <Money cents={tierTotal(type)} zero="dash" />
                        ) : (
                          <span className="text-muted-foreground/50">n/a</span>
                        )}
                      </TableCell>
                    ))}
                    <TableCell>
                      {voided ? (
                        <Badge
                          variant="outline"
                          className="text-muted-foreground"
                        >
                          Voided
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 ring-inset">
                          Finalized
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {d.canVoid && <VoidButton distribution={d} />}
                    </TableCell>
                  </TableRow>
                  {isOpen && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        colSpan={9}
                        className="bg-muted/30 p-5 whitespace-normal"
                      >
                        <HistoryDetails distribution={d} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}

function HistoryDetails({ distribution: d }: { distribution: Distribution }) {
  return (
    <div className="space-y-4">
      {d.status === "voided" && d.voidedAt && (
        <p className="text-muted-foreground text-sm">
          Voided {formatDate(d.voidedAt.slice(0, 10))}. These payments no longer
          count toward balances.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Waterfall:</span>
        {d.waterfallSnapshot.map((tier, i) => (
          <span
            key={tier.type}
            className="bg-card flex items-center gap-1.5 rounded-md border px-2 py-0.5"
          >
            <span
              className={cn("size-2 rounded-full", TIER_META[tier.type].swatch)}
            />
            {i + 1}. {tierChipLabel(tier)}
          </span>
        ))}
      </div>
      <div className="bg-card overflow-hidden rounded-xl border">
        <RecipientTable
          tierTypes={d.waterfallSnapshot.map((t) => t.type)}
          rows={toRows(d)}
        />
      </div>
    </div>
  );
}

function tierChipLabel(tier: Tier): string {
  switch (tier.type) {
    case "roc":
      return TIER_META.roc.label;
    case "pref":
      return `${TIER_META.pref.label} (${formatBps(tier.rateBps)})`;
    case "split":
      return `${TIER_META.split.label} (${formatBps(tier.investorBps)} investors, ${formatBps(10_000 - tier.investorBps)} managers)`;
  }
}

/** Groups the stored allocations into one row per recipient. They're stored investors first, managers last. */
function toRows(d: Distribution): RecipientRow[] {
  const rows = new Map<string, RecipientRow>();
  for (const a of d.allocations) {
    const key = a.investorId === null ? "managers" : `investor-${a.investorId}`;
    const row = rows.get(key) ?? {
      key,
      name: a.recipientName,
      kind: a.investorId === null ? "managers" : "investor",
      ownership: null,
      byTier: {},
      totalCents: 0,
    };
    row.byTier[a.tierType] = (row.byTier[a.tierType] ?? 0) + a.amountCents;
    row.totalCents += a.amountCents;
    rows.set(key, row);
  }
  return [...rows.values()];
}

function VoidButton({ distribution: d }: { distribution: Distribution }) {
  const utils = api.useUtils();
  // Voiding changes the ledger, so it waits for the server instead of being optimistic. The button
  // shows "Voiding…" until the server agrees and the fresh data has arrived; then everything
  // updates at once with the confirmation.
  const voidDistribution = api.distributions.void.useMutation({
    onSuccess: async () => {
      await utils.invalidate();
      toast.success("Distribution voided");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={voidDistribution.isPending}
        >
          <Undo2 /> {voidDistribution.isPending ? "Voiding…" : "Void"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Void distribution?</AlertDialogTitle>
          <AlertDialogDescription>
            {formatCents(d.amountCents)} on {formatDate(d.date)}. Use this only
            for a distribution entered by mistake. It stays in the history as
            voided and its payments stop counting toward balances.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => voidDistribution.mutate({ id: d.id })}
          >
            Void
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
