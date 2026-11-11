"use client";

import { CircleAlert, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
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
import { Button } from "~/components/ui/button";
import {
  isValidDate,
  prefRateOf,
  type DistributionResult,
  type Tier,
} from "~/lib/engine";
import { formatCents, formatDate, plural } from "~/lib/format";
import {
  MAX_CENTS,
  centsToInputText,
  parseMoneyToCents,
  todayLocal,
} from "~/lib/parse";
import { planDistribution, type DistributionPlan } from "~/lib/plan";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";
import { Hint, MoneyInput, errorMessage } from "../shared";
import { MANAGER_META, TIER_META } from "../tier-meta";
import { Callout, DateField, EmptyState, Panel } from "../ui-kit";
import { AllocationBreakdown } from "./allocation-breakdown";
import { InvestorWork } from "./investor-work";
import { RecipientTable, type RecipientRow } from "./recipient-table";
import { usePlanInputs } from "../use-plan-inputs";

export function NewDistribution({
  investorCount,
  hasWaterfall,
  waterfallDirty,
  latestDate,
}: {
  investorCount: number;
  hasWaterfall: boolean;
  waterfallDirty: boolean;
  latestDate: string | null;
}) {
  if (investorCount === 0 || !hasWaterfall) {
    return (
      <Panel title="New distribution">
        <EmptyState
          title={
            investorCount === 0 && !hasWaterfall
              ? "Add investors and save a waterfall first"
              : investorCount === 0
                ? "Add investors first"
                : "Save a waterfall first"
          }
        >
          {investorCount === 0 && (
            <Button variant="outline" asChild>
              <Link href="/cap-table">Go to cap table</Link>
            </Button>
          )}
          {!hasWaterfall && (
            <Button variant="outline" asChild>
              <Link href="/waterfall">Go to waterfall</Link>
            </Button>
          )}
        </EmptyState>
      </Panel>
    );
  }
  return (
    <DistributionForm
      investorCount={investorCount}
      waterfallDirty={waterfallDirty}
      latestDate={latestDate}
    />
  );
}

function DistributionForm({
  investorCount,
  waterfallDirty,
  latestDate,
}: {
  investorCount: number;
  waterfallDirty: boolean;
  latestDate: string | null;
}) {
  const utils = api.useUtils();
  const inputs = usePlanInputs();
  // Default to today, or to the latest distribution's date if that's later (so the default is never blocked).
  const [date, setDate] = useState(() => {
    const today = todayLocal();
    return latestDate && latestDate > today ? latestDate : today;
  });
  const [amountText, setAmountText] = useState("");
  const amountCents = parseMoneyToCents(amountText);
  const amountError =
    amountText.trim() === ""
      ? null
      : amountCents === null
        ? "Enter an amount like 50,000 or 50,000.00."
        : amountCents > MAX_CENTS
          ? "Amounts are limited to $10 billion."
          : null;

  // The same planner the server runs when finalizing, run here on cached data so the preview
  // updates on every keystroke without a request.
  const plan = useMemo(
    () =>
      inputs && isValidDate(date) && amountCents && !amountError
        ? planDistribution(inputs, date, amountCents)
        : null,
    [inputs, date, amountCents, amountError],
  );

  // Finalizing records money as paid, so it waits for the server (which re-runs the planner inside
  // a transaction) instead of being optimistic. The button shows progress right away.
  const finalize = api.distributions.finalize.useMutation({
    onSuccess: async () => {
      // Refetch before confirming. The button stays on "Finalizing…" meanwhile, so the history,
      // totals and the next preview never show the ledger without this distribution.
      await utils.invalidate();
      toast.success("Distribution finalized", {
        description: `${formatCents(amountCents ?? 0)} · ${formatDate(date)}`,
      });
      setAmountText("");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const problems = plan?.problems ?? [];
  const blockedReason = !plan
    ? "Enter an amount first."
    : problems.length > 0
      ? "Resolve the issues above first."
      : null;

  return (
    <Panel title="New distribution">
      <div className="flex flex-wrap items-start gap-4 border-b px-5 py-5">
        <DateField
          label="Date"
          value={date}
          onChange={setDate}
          className="w-44"
          hint={
            latestDate ? `On or after ${formatDate(latestDate)}` : undefined
          }
        />
        <label className="grid w-64 gap-1.5">
          <span className="text-sm font-medium">Amount</span>
          <MoneyInput
            size="lg"
            placeholder="0.00"
            value={amountText}
            onChange={setAmountText}
            invalid={amountError !== null}
            autoFocus
          />
          {amountError && (
            <span className="text-destructive text-xs">{amountError}</span>
          )}
        </label>
      </div>

      <div className="space-y-5 p-5">
        {waterfallDirty && (
          <Callout
            tone="warning"
            icon={TriangleAlert}
            action={
              <Button variant="outline" size="sm" asChild>
                <Link href="/waterfall">Open waterfall</Link>
              </Button>
            }
          >
            The waterfall has unsaved changes. This preview uses the saved
            version.
          </Callout>
        )}

        {plan ? (
          <PlanView
            plan={plan}
            excludedCount={
              plan.result ? investorCount - plan.result.investors.length : 0
            }
            onUseMax={(cents) => setAmountText(centsToInputText(cents))}
          />
        ) : (
          <p className="text-muted-foreground rounded-xl border border-dashed py-10 text-center text-sm">
            Enter an amount to preview the payout.
          </p>
        )}
      </div>

      <footer className="bg-muted/40 flex justify-end border-t px-5 py-4">
        <FinalizeButton
          disabledReason={blockedReason}
          pending={finalize.isPending}
          result={plan?.result ?? null}
          tiers={plan?.tiers ?? []}
          onConfirm={() =>
            amountCents !== null && finalize.mutate({ date, amountCents })
          }
        />
      </footer>
    </Panel>
  );
}

function PlanView({
  plan,
  excludedCount,
  onUseMax,
}: {
  plan: DistributionPlan;
  excludedCount: number;
  onUseMax: (cents: number) => void;
}) {
  const blockingProblems = plan.problems.filter(
    (p) => p.code !== "undistributed",
  );
  const { result } = plan;

  return (
    <div className="space-y-5">
      {blockingProblems.length > 0 && (
        <Callout tone="danger" icon={CircleAlert} title="Can't finalize">
          <ul className="space-y-2">
            {blockingProblems.map((problem) => (
              <li key={problem.code}>
                {problem.message}
                {problem.code === "backdated" && (
                  <ul className="mt-2 space-y-1">
                    {plan.blocking.map((d) => (
                      <li
                        key={d.id}
                        className="flex items-center gap-2 font-medium"
                      >
                        <span className="size-1.5 rounded-full bg-red-400" />
                        {formatDate(d.date)} · {formatCents(d.amountCents)}
                      </li>
                    ))}
                  </ul>
                )}
                {(problem.code === "no-waterfall" ||
                  problem.code === "invalid-waterfall") && (
                  <Link
                    href="/waterfall"
                    className="ml-1 font-medium underline underline-offset-2"
                  >
                    Open waterfall
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Callout>
      )}

      {result && (
        <>
          {result.undistributedCents > 0 &&
            result.maxDistributableCents !== null && (
              <Callout
                tone="warning"
                icon={TriangleAlert}
                title={`${formatCents(result.undistributedCents)} can't be distributed`}
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={result.maxDistributableCents === 0}
                    onClick={() => onUseMax(result.maxDistributableCents ?? 0)}
                  >
                    Use max · {formatCents(result.maxDistributableCents)}
                  </Button>
                }
              >
                Without a profit split tier, at most{" "}
                {formatCents(result.maxDistributableCents)} can be paid on this
                date.
              </Callout>
            )}

          <AllocationBreakdown result={result} />

          <div className="overflow-hidden rounded-xl border">
            <PreviewTable result={result} tiers={plan.tiers} />
          </div>
          <p className="text-muted-foreground text-xs">
            Select an investor to see the calculation.
            {excludedCount > 0 &&
              ` ${plural(excludedCount, "investment")} made after ${formatDate(result.date)} ${excludedCount === 1 ? "is" : "are"} excluded.`}
          </p>
        </>
      )}
    </div>
  );
}

function PreviewTable({
  result,
  tiers,
}: {
  result: DistributionResult;
  tiers: Tier[];
}) {
  const prefRateBps = prefRateOf(tiers);
  const tierTypes = tiers.map((t) => t.type);

  const rows: RecipientRow[] = result.investors.map((row) => ({
    key: `investor-${row.investor.id}`,
    name: row.investor.name,
    kind: "investor",
    ownership: row.ownership,
    byTier: row.byTier,
    totalCents: row.totalCents,
    details: (
      <InvestorWork
        row={row}
        date={result.date}
        prefRateBps={prefRateBps}
        tierTypes={tierTypes}
      />
    ),
  }));
  if (tierTypes.includes("split")) {
    rows.push({
      key: "managers",
      name: "Managers",
      kind: "managers",
      ownership: null,
      byTier: { split: result.managerCents },
      totalCents: result.managerCents,
    });
  }
  return <RecipientTable tierTypes={tierTypes} rows={rows} />;
}

function FinalizeButton({
  disabledReason,
  pending,
  result,
  tiers,
  onConfirm,
}: {
  disabledReason: string | null;
  pending: boolean;
  result: DistributionResult | null;
  tiers: Tier[];
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <Hint text={disabledReason}>
        <AlertDialogTrigger asChild>
          <Button disabled={disabledReason !== null || pending}>
            {pending ? "Finalizing…" : "Finalize"}
          </Button>
        </AlertDialogTrigger>
      </Hint>
      {result && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalize distribution?</AlertDialogTitle>
            <AlertDialogDescription>
              The payments below will be recorded. To undo, void it while
              it&apos;s still the latest distribution.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="bg-muted/50 space-y-2 rounded-lg border p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date</span>
              <span className="font-medium">{formatDate(result.date)}</span>
            </div>
            {tiers.map(({ type }) => {
              const total =
                result.tierTotals.find((t) => t.type === type)?.amountCents ??
                0;
              return (
                <div key={type}>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <span
                        className={cn(
                          "size-2 rounded-full",
                          TIER_META[type].swatch,
                        )}
                      />
                      {TIER_META[type].label}
                    </span>
                    <span className="tabular-nums">{formatCents(total)}</span>
                  </div>
                  {type === "split" && result.managerCents > 0 && (
                    <p className="text-muted-foreground pl-4 text-xs">
                      of which {formatCents(result.managerCents)} to the{" "}
                      {MANAGER_META.label.toLowerCase()}
                    </p>
                  )}
                </div>
              );
            })}
            <div className="flex justify-between border-t pt-2 font-semibold">
              <span>Total</span>
              <span className="tabular-nums">
                {formatCents(result.amountCents)}
              </span>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm}>Finalize</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
