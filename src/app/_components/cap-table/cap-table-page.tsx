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
  InvestorDialog,
  type InvestorDialogState,
  type InvestorRow,
} from "./investor-dialog";
import { InvestmentDetails } from "./investment-details";
import { useInvestorMutations } from "./use-investor-mutations";

const LOCKED_HINT =
  "Included in a finalized distribution, so the amount and date can't change. Void that distribution to unlock it. The name can still be edited.";

export function CapTablePage() {
  const { data } = api.investors.list.useQuery();
  const [dialog, setDialog] = useState<InvestorDialogState>(null);
  const [deleting, setDeleting] = useState<InvestorRow | null>(null);
  // Ids of the rows whose details are expanded (same pattern as the distribution preview).
  const [open, setOpen] = useState<Set<number>>(new Set());
  const { create, update, remove } = useInvestorMutations();

  if (!data) return <PageSkeleton title="Cap table" />;
  const { investors, totalCents, latestDistributionDate } = data;

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
          investors.length > 0 && (
            <Button onClick={() => setDialog({ mode: "add" })}>
              <Plus /> Add investment
            </Button>
          )
        }
      />

      <Panel>
        {investors.length === 0 ? (
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
              {investors.map((investor) => {
                // A negative id is a row that's still being saved, so there's nothing to show yet.
                const saved = investor.id > 0;
                const isOpen = open.has(investor.id);
                return (
                  <Fragment key={investor.id}>
                    <TableRow
                      className={cn(
                        saved && "cursor-pointer",
                        isOpen && "bg-muted/40",
                      )}
                      onClick={() => saved && toggle(investor.id)}
                    >
                      <TableCell className="pr-0">
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-label={`Details for ${investor.name}`}
                          disabled={!saved}
                          className="text-muted-foreground hover:text-foreground flex size-6 items-center justify-center rounded-md disabled:opacity-40"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle(investor.id);
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
                          <Avatar name={investor.name} />
                          <span className="font-medium">{investor.name}</span>
                          {investor.locked && (
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
                        {formatDate(investor.investmentDate)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        <Money cents={investor.amountCents} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPercent(investor.ownership)}
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell
                          colSpan={5}
                          className="bg-muted/30 p-0 whitespace-normal"
                        >
                          <InvestmentDetails
                            investor={investor}
                            onEdit={() => setDialog({ mode: "edit", investor })}
                            onDelete={() => setDeleting(investor)}
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

      <InvestorDialog
        state={dialog}
        onClose={() => setDialog(null)}
        onSubmit={(values) => {
          if (dialog?.mode === "edit") {
            update.mutate({ id: dialog.investor.id, ...values });
          } else {
            create.mutate(values);
          }
          setDialog(null);
        }}
        latestDistributionDate={latestDistributionDate}
      />
      <DeleteDialog
        investor={deleting}
        onClose={() => setDeleting(null)}
        onConfirm={(id) => remove.mutate({ id })}
      />
    </div>
  );
}

function DeleteDialog({
  investor,
  onClose,
  onConfirm,
}: {
  investor: InvestorRow | null;
  onClose: () => void;
  onConfirm: (id: number) => void;
}) {
  return (
    <AlertDialog
      open={investor !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <AlertDialogContent>
        {investor && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Delete {investor.name}&apos;s investment?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {formatCents(investor.amountCents)} invested on{" "}
                {formatDate(investor.investmentDate)}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => onConfirm(investor.id)}
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
