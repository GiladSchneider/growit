"use client";

import { ChevronRight, Lock, Plus } from "lucide-react";
import { Fragment, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { formatCents, formatDate, formatPercent } from "~/lib/format";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";
import { Hint } from "../shared";
import {
  Avatar,
  EmptyState,
  Money,
  PageHeader,
  PageSkeleton,
  Panel,
} from "../ui-kit";
import {
  InvestmentDialog,
  type InvestmentDialogState,
  type InvestmentRow,
} from "./investment-dialog";
import { InvestmentDetails } from "./investment-details";
import { useInvestmentMutations } from "./use-investment-mutations";

const LOCKED_HINT =
  "Included in a finalized distribution, so the amount and date can't change. Void that distribution to unlock it. The name can still be edited.";

export function CapTablePage() {
  const { data } = api.investments.list.useQuery();
  const [dialog, setDialog] = useState<InvestmentDialogState>(null);
  const [deleting, setDeleting] = useState<InvestmentRow | null>(null);
  // Ids of the rows whose details are expanded (same pattern as the distribution preview).
  const [open, setOpen] = useState<Set<number>>(new Set());
  const { create, update, remove } = useInvestmentMutations();

  if (!data) return <PageSkeleton title="Cap table" />;
  const { investments, totalCents, latestDistributionDate } = data;

  const toggle = (id: number) => {
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpen(next);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cap table"
        description="One row per investment."
        actions={
          investments.length > 0 && (
            <Button onClick={() => setDialog({ mode: "add" })}>
              <Plus /> Add investment
            </Button>
          )
        }
      />

      <Panel>
        {investments.length === 0 ? (
          <EmptyState
            title="No investments yet"
            description="Add an investor's name, amount and investment date."
          >
            <Button onClick={() => setDialog({ mode: "add" })}>
              <Plus /> Add investment
            </Button>
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Investor</TableHead>
                <TableHead>Invested on</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Ownership</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {investments.map((investment) => {
                // A negative id is a row that's still being saved, so there's nothing to show yet.
                const saved = investment.id > 0;
                const isOpen = open.has(investment.id);
                return (
                  <Fragment key={investment.id}>
                    <TableRow
                      className={cn(
                        saved && "cursor-pointer",
                        isOpen && "bg-muted/40",
                      )}
                      onClick={() => saved && toggle(investment.id)}
                    >
                      <TableCell className="pr-0">
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-label={`Details for ${investment.investorName}`}
                          disabled={!saved}
                          className="text-muted-foreground hover:text-foreground flex size-6 items-center justify-center rounded-md disabled:opacity-40"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle(investment.id);
                          }}
                        >
                          <ChevronRight
                            className={cn(
                              "size-4 transition-transform",
                              isOpen && "rotate-90",
                            )}
                          />
                        </button>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar name={investment.investorName} />
                          <span className="font-medium">
                            {investment.investorName}
                          </span>
                          {investment.locked && (
                            <Hint text={LOCKED_HINT}>
                              <Badge
                                variant="outline"
                                className="text-muted-foreground gap-1"
                              >
                                <Lock /> Locked
                              </Badge>
                            </Hint>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(investment.investmentDate)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        <Money cents={investment.amountCents} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPercent(investment.ownership)}
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell
                          colSpan={5}
                          className="bg-muted/30 p-0 whitespace-normal"
                        >
                          <InvestmentDetails
                            investment={investment}
                            onEdit={() =>
                              setDialog({ mode: "edit", investment })
                            }
                            onDelete={() => setDeleting(investment)}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell />
                <TableCell className="font-semibold">Total</TableCell>
                <TableCell />
                <TableCell className="text-right font-semibold">
                  <Money cents={totalCents} />
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  100.00%
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </Panel>

      <InvestmentDialog
        state={dialog}
        onClose={() => setDialog(null)}
        onSubmit={(values) => {
          if (dialog?.mode === "edit") {
            update.mutate({ id: dialog.investment.id, ...values });
          } else {
            create.mutate(values);
          }
          setDialog(null);
        }}
        latestDistributionDate={latestDistributionDate}
      />
      <DeleteDialog
        investment={deleting}
        onClose={() => setDeleting(null)}
        onConfirm={(id) => remove.mutate({ id })}
      />
    </div>
  );
}

function DeleteDialog({
  investment,
  onClose,
  onConfirm,
}: {
  investment: InvestmentRow | null;
  onClose: () => void;
  onConfirm: (id: number) => void;
}) {
  return (
    <AlertDialog
      open={investment !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <AlertDialogContent>
        {investment && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Delete {investment.investorName}&apos;s investment?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {formatCents(investment.amountCents)} invested on{" "}
                {formatDate(investment.investmentDate)}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => onConfirm(investment.id)}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
