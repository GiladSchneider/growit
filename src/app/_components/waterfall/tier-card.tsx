"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CircleAlert, GripVertical, Lock, X } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { bpsToPercentText, parsePercentToBps } from "~/lib/parse";
import { cn } from "~/lib/utils";
import { TIER_DESCRIPTIONS } from "~/lib/waterfall-text";
import { Hint, PercentInput } from "../shared";
import { TIER_META } from "../tier-meta";
import { TierNumber } from "../ui-kit";
import type { DraftTier } from "../waterfall-draft";

export const PREF_LOCKED_HINT =
  "Locked because distributions have been finalized with this rate. Void them to change it.";

/** One draggable tier. The drag handle is the only part that starts a drag. */
export function TierCard({
  index,
  tier,
  locked,
  errors,
  onChange,
  onRemove,
}: {
  index: number;
  tier: DraftTier;
  locked: boolean;
  errors: string[];
  onChange: (tier: DraftTier) => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tier.type });
  const meta = TIER_META[tier.type];

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "bg-card relative rounded-xl border shadow-xs transition-shadow",
        isDragging && "ring-ring/30 z-20 shadow-lg ring-2",
        errors.length > 0 && "border-red-300",
      )}
    >
      <div className="flex items-start gap-3 p-4">
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          type="button"
          aria-label={`Drag to reorder ${meta.label}`}
          className="text-muted-foreground/50 hover:text-foreground mt-0.5 cursor-grab touch-none rounded active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>

        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 font-semibold">
            <TierNumber type={tier.type} index={index} />
            {meta.label}
            {locked && (
              <Hint text={PREF_LOCKED_HINT}>
                <Badge
                  variant="outline"
                  className="text-muted-foreground gap-1 font-normal"
                >
                  <Lock /> Locked
                </Badge>
              </Hint>
            )}
          </h3>
          <p className="text-muted-foreground mt-1 text-sm">
            {TIER_DESCRIPTIONS[tier.type]}
          </p>

          {tier.type === "pref" && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label htmlFor="pref-rate" className="text-sm font-medium">
                Annual rate
              </label>
              <Hint text={locked ? PREF_LOCKED_HINT : null}>
                <PercentInput
                  id="pref-rate"
                  className="w-24"
                  value={tier.rate}
                  disabled={locked}
                  invalid={!isPercentInRange(tier.rate, 1)}
                  onChange={(rate) => onChange({ ...tier, rate })}
                />
              </Hint>
            </div>
          )}

          {tier.type === "split" && (
            <SplitControls tier={tier} onChange={onChange} />
          )}

          {errors.map((error) => (
            <p
              key={error}
              className="mt-3 flex items-start gap-1.5 text-sm text-red-600"
            >
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          ))}
        </div>

        <Hint text={locked ? PREF_LOCKED_HINT : null}>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            onClick={onRemove}
            disabled={locked}
            aria-label={`Remove ${meta.label}`}
          >
            <X />
          </Button>
        </Hint>
      </div>
    </li>
  );
}

/**
 * Investors / managers split: two linked boxes plus a slider. Editing either box fills in the
 * other so they always add up to 100%.
 */
function SplitControls({
  tier,
  onChange,
}: {
  tier: Extract<DraftTier, { type: "split" }>;
  onChange: (tier: DraftTier) => void;
}) {
  const investorBps = parsePercentToBps(tier.investors);
  const sliderValue = Number.isNaN(investorBps)
    ? 0
    : Math.min(100, investorBps / 100);

  const setInvestors = (investors: string) =>
    onChange({ ...tier, investors, managers: complement(investors) });
  const setManagers = (managers: string) =>
    onChange({ ...tier, managers, investors: complement(managers) });

  return (
    <div className="mt-4 grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <span className="size-2 rounded-full bg-emerald-500" />
          Investors
          <PercentInput
            className="w-24"
            value={tier.investors}
            invalid={!isPercentInRange(tier.investors, 0)}
            onChange={setInvestors}
          />
        </label>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={sliderValue}
          onChange={(e) => setInvestors(e.target.value)}
          aria-label="Investor share"
          className="min-w-32 flex-1 accent-emerald-600"
        />
        <label className="flex items-center gap-2 text-sm font-medium">
          <span className="size-2 rounded-full bg-emerald-800" />
          Managers
          <PercentInput
            className="w-24"
            value={tier.managers}
            invalid={!isPercentInRange(tier.managers, 0)}
            onChange={setManagers}
          />
        </label>
      </div>
    </div>
  );
}

/** Highlights a percentage box red. (The error message itself comes from validateWaterfall.) */
function isPercentInRange(text: string, minBps: number): boolean {
  const bps = parsePercentToBps(text);
  return bps >= minBps && bps <= 10_000;
}

/** "80" → "20". Leaves the other box empty while the typed value isn't a valid percentage. */
function complement(percentText: string): string {
  const bps = parsePercentToBps(percentText);
  return bps >= 0 && bps <= 10_000 ? bpsToPercentText(10_000 - bps) : "";
}
