"use client";

import { useMemo } from "react";

import { toPlanInputs, type PlanInputs } from "~/lib/plan";
import { api } from "~/trpc/react";

/**
 * The planner's inputs, built from data that's already in the client cache, so the live preview
 * needs no request at all.
 */
export function usePlanInputs(): PlanInputs | null {
  const investments = api.investments.list.useQuery().data;
  const waterfall = api.waterfall.get.useQuery().data;
  const distributions = api.distributions.list.useQuery().data;

  return useMemo(
    () =>
      investments && waterfall && distributions
        ? toPlanInputs({
            investments: investments.investments,
            tiers: waterfall.tiers,
            distributions,
          })
        : null,
    [investments, waterfall, distributions],
  );
}
