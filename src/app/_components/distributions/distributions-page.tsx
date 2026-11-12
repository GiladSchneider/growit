"use client";

import { formatCents, formatPercent } from "~/lib/format";
import { api } from "~/trpc/react";
import { MANAGER_META, TIER_META } from "../tier-meta";
import { PageHeader, PageSkeleton, StatCard, StatGrid } from "../ui-kit";
import { useWaterfallDraft } from "../waterfall-draft-context";
import { DistributionHistory } from "./history";
import { NewDistribution } from "./new-distribution";

export function DistributionsPage() {
  const distributions = api.distributions.list.useQuery().data;
  const investments = api.investments.list.useQuery().data;
  const { loaded, savedTiers, dirty } = useWaterfallDraft();

  if (!distributions || !investments || !loaded)
    return <PageSkeleton title="Distributions" />;

  // Lifetime totals from active (non-voided) distributions.
  const active = distributions.filter((d) => d.status === "finalized");
  const allocations = active.flatMap((d) => d.allocations);
  const paid = (pick: (a: (typeof allocations)[number]) => boolean) =>
    allocations.filter(pick).reduce((sum, a) => sum + a.amountCents, 0);
  const capitalReturned = paid((a) => a.tierType === "roc");

  return (
    <div className="space-y-6">
      <PageHeader title="Distributions" />

      {active.length > 0 && (
        <StatGrid>
          <StatCard
            label="Capital returned"
            value={formatCents(capitalReturned)}
            hint={`${formatPercent(capitalReturned / investments.totalCents)} of invested`}
            dot={TIER_META.roc.swatch}
          />
          <StatCard
            label="Preferred return paid"
            value={formatCents(paid((a) => a.tierType === "pref"))}
            dot={TIER_META.pref.swatch}
          />
          <StatCard
            label="Profit split to investors"
            value={formatCents(
              paid((a) => a.tierType === "split" && a.investmentId !== null),
            )}
            dot={TIER_META.split.swatch}
          />
          <StatCard
            label="Profit split to managers"
            value={formatCents(paid((a) => a.recipientType === "manager"))}
            dot={MANAGER_META.swatch}
          />
        </StatGrid>
      )}

      <NewDistribution
        investmentCount={investments.investments.length}
        hasWaterfall={savedTiers.length > 0}
        waterfallDirty={dirty}
        latestDate={investments.latestDistributionDate}
      />

      {distributions.length > 0 && (
        <DistributionHistory distributions={distributions} />
      )}
    </div>
  );
}
