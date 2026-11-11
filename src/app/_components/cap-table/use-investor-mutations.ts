"use client";

import { toast } from "sonner";

import { api, type RouterOutputs } from "~/trpc/react";
import { errorMessage } from "../shared";

type CapTable = RouterOutputs["investors"]["list"];
type Row = CapTable["investors"][number];

/**
 * Cap table edits are optimistic: the cached table changes the moment you click, and the server
 * confirms in the background. If the server refuses (rare, because the form checks the same rules
 * first), the change is rolled back and the error is shown. Afterwards the real data is refetched.
 */
export function useInvestorMutations() {
  const utils = api.useUtils();

  /** Applies a local change to the cached cap table and returns the previous version for rollback. */
  const applyLocally = async (change: (rows: Row[]) => Row[]) => {
    await utils.investors.list.cancel(); // so an in-flight fetch can't overwrite the change
    const previous = utils.investors.list.getData();
    if (previous) {
      utils.investors.list.setData(
        undefined,
        withRows(previous, change(previous.investors)),
      );
    }
    return { previous };
  };
  const rollback = (error: unknown, previous: CapTable | undefined) => {
    utils.investors.list.setData(undefined, previous);
    toast.error(errorMessage(error));
  };
  const refresh = () => utils.invalidate();

  const create = api.investors.create.useMutation({
    onMutate: (values) =>
      applyLocally((rows) => [
        ...rows,
        // A placeholder until the server returns the real row (negative id = not saved yet).
        {
          ...values,
          id: -Date.now(),
          createdAt: new Date().toISOString(),
          ownership: 0,
          locked: false,
        },
      ]),
    onError: (error, _values, context) => rollback(error, context?.previous),
    onSettled: refresh,
  });

  const update = api.investors.update.useMutation({
    onMutate: ({ id, ...values }) =>
      applyLocally((rows) =>
        rows.map((row) => (row.id === id ? { ...row, ...values } : row)),
      ),
    onError: (error, _values, context) => rollback(error, context?.previous),
    onSettled: refresh,
  });

  const remove = api.investors.delete.useMutation({
    onMutate: ({ id }) =>
      applyLocally((rows) => rows.filter((row) => row.id !== id)),
    onError: (error, _values, context) => rollback(error, context?.previous),
    onSettled: refresh,
  });

  return { create, update, remove };
}

/** Recomputes what the server derives from the rows: order, total and ownership %. */
function withRows(table: CapTable, rows: Row[]): CapTable {
  const totalCents = rows.reduce((sum, row) => sum + row.amountCents, 0);
  const sorted = [...rows].sort(serverOrder);
  return {
    ...table,
    totalCents,
    investors: sorted.map((row) => ({
      ...row,
      ownership: totalCents > 0 ? row.amountCents / totalCents : 0,
    })),
  };
}

/**
 * The order the server returns: by investment date, then by creation (ids only go up). A
 * placeholder (negative id) is the newest row, so it goes after every saved row on its date,
 * which is exactly where the real row lands once it's saved. Without this it would jump.
 */
function serverOrder(a: Row, b: Row): number {
  if (a.investmentDate !== b.investmentDate) {
    return a.investmentDate < b.investmentDate ? -1 : 1;
  }
  const aPending = a.id < 0;
  const bPending = b.id < 0;
  if (aPending !== bPending) return aPending ? 1 : -1;
  // Placeholder ids are -Date.now(), so comparing absolute values keeps creation order.
  return Math.abs(a.id) - Math.abs(b.id);
}
