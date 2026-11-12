"use client";

import { Lock, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { addDays, isValidDate } from "~/lib/engine";
import { formatDate, formatList } from "~/lib/format";
import {
  MAX_CENTS,
  centsToInputText,
  parseMoneyToCents,
  todayLocal,
} from "~/lib/parse";
import { api, type RouterOutputs } from "~/trpc/react";
import { MoneyInput, TextInput } from "../shared";
import { Callout, DateField } from "../ui-kit";

export type InvestmentRow =
  RouterOutputs["investments"]["list"]["investments"][number];
export type InvestmentDialogState =
  { mode: "add" } | { mode: "edit"; investment: InvestmentRow } | null;
export type InvestmentFields = {
  investorName: string;
  amountCents: number;
  investmentDate: string;
};

/**
 * Add or edit one investment. The form checks everything the server checks, then hands the values
 * to `onSubmit` and closes right away; the page saves them optimistically.
 * Remounts on every open so the form always starts fresh.
 */
export function InvestmentDialog({
  state,
  onClose,
  onSubmit,
  latestDistributionDate,
}: {
  state: InvestmentDialogState;
  onClose: () => void;
  onSubmit: (values: InvestmentFields) => void;
  latestDistributionDate: string | null;
}) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="gap-5 p-6 sm:max-w-md">
        {state && (
          <InvestmentForm
            key={state.mode === "edit" ? state.investment.id : "new"}
            state={state}
            onCancel={onClose}
            onSubmit={onSubmit}
            latestDistributionDate={latestDistributionDate}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type FieldErrors = Partial<Record<"name" | "amount" | "date", string>>;

function InvestmentForm({
  state,
  onCancel,
  onSubmit,
  latestDistributionDate,
}: {
  state: NonNullable<InvestmentDialogState>;
  onCancel: () => void;
  onSubmit: (values: InvestmentFields) => void;
  latestDistributionDate: string | null;
}) {
  const editing = state.mode === "edit" ? state.investment : null;
  const locked = editing?.locked ?? false;

  const [name, setName] = useState(editing?.investorName ?? "");
  const [amount, setAmount] = useState(
    editing ? centsToInputText(editing.amountCents) : "",
  );
  const [date, setDate] = useState(() => {
    if (editing) return editing.investmentDate;
    // New investments must come after the latest distribution, so default to a date that's allowed.
    const today = todayLocal();
    return latestDistributionDate && latestDistributionDate >= today
      ? addDays(latestDistributionDate, 1)
      : today;
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // Finalized distributions dated on or after the chosen date. An investment dated then would have
  // shared in them, which would change money already paid, so it isn't allowed (the server enforces
  // the same rule). Checked as the date changes, so the explanation shows up right away.
  const distributions = api.distributions.list.useQuery().data ?? [];
  const blocking =
    locked || !isValidDate(date)
      ? []
      : distributions
          .filter((d) => d.status === "finalized" && d.date >= date)
          .sort((a, b) => a.date.localeCompare(b.date));

  const submit = () => {
    const amountCents = parseMoneyToCents(amount);
    const errors: FieldErrors = {};
    if (!name.trim()) errors.name = "Enter the investor's name.";
    if (amountCents === null || amountCents <= 0) {
      errors.amount = "Enter an amount greater than $0, like 100,000.";
    } else if (amountCents > MAX_CENTS) {
      // Same limit the server enforces (see MAX_CENTS).
      errors.amount = "Amounts are limited to $10 billion.";
    }
    if (!isValidDate(date)) {
      errors.date = "Pick the date the money was invested.";
    }
    setFieldErrors(errors);
    // A blocked date is explained in the callout below the fields.
    if (Object.keys(errors).length > 0 || blocking.length > 0) return;
    if (amountCents === null) return;

    onSubmit({ investorName: name.trim(), amountCents, investmentDate: date });
  };

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <DialogHeader>
        <DialogTitle className="text-lg font-semibold">
          {editing ? "Edit investment" : "Add investment"}
        </DialogTitle>
        {/* Radix wants a description for screen readers; editing doesn't need a visible one. */}
        <DialogDescription className={editing ? "sr-only" : undefined}>
          {editing
            ? "Edit the investment."
            : "Someone who invests twice gets a separate row for each investment."}
        </DialogDescription>
      </DialogHeader>

      {locked && (
        <Callout tone="info" icon={Lock}>
          Amount and date are locked because this investment is included in a
          finalized distribution. Void it to make changes.
        </Callout>
      )}

      <label className="grid gap-1.5">
        <span className="text-sm font-medium">Investor name</span>
        <TextInput
          autoFocus
          placeholder="e.g. Jane Smith"
          value={name}
          invalid={!!fieldErrors.name}
          onChange={(e) => setName(e.target.value)}
        />
        {fieldErrors.name && (
          <span className="text-destructive text-xs">{fieldErrors.name}</span>
        )}
      </label>

      <div className="grid items-start gap-4 sm:grid-cols-2">
        <label className="grid content-start gap-1.5">
          <span className="text-sm font-medium">Amount invested</span>
          <MoneyInput
            placeholder="100,000.00"
            value={amount}
            onChange={setAmount}
            disabled={locked}
            invalid={!!fieldErrors.amount}
          />
          {fieldErrors.amount && (
            <span className="text-destructive text-xs">
              {fieldErrors.amount}
            </span>
          )}
        </label>
        <div className="grid content-start gap-1.5">
          <DateField
            label="Investment date"
            value={date}
            onChange={setDate}
            disabled={locked}
            invalid={blocking.length > 0}
            hint={
              !locked && latestDistributionDate && blocking.length === 0
                ? `Must be after ${formatDate(latestDistributionDate)}`
                : undefined
            }
          />
          {fieldErrors.date && (
            <span className="text-destructive text-xs">{fieldErrors.date}</span>
          )}
        </div>
      </div>

      {blocking.length > 0 && (
        <Callout
          tone="warning"
          icon={TriangleAlert}
          title={
            blocking.length === 1
              ? "A distribution was already paid on or after this date"
              : `${blocking.length} distributions were already paid on or after this date`
          }
        >
          An investment dated {formatDate(date)} would have shared in the{" "}
          {formatList(blocking.map((d) => formatDate(d.date)))}{" "}
          {blocking.length === 1 ? "distribution" : "distributions"}, which
          would change money that&apos;s already been paid. Choose a date after{" "}
          {formatDate(blocking[blocking.length - 1]!.date)}, or void{" "}
          {blocking.length === 1
            ? "that distribution"
            : "those distributions (latest first)"}{" "}
          on the Distributions page and then add this investment.
        </Callout>
      )}

      <DialogFooter className="-mx-6 -mb-6 px-6 py-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">
          {editing ? "Save changes" : "Add investment"}
        </Button>
      </DialogFooter>
    </form>
  );
}
