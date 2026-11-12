"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CircleAlert, Lock, Plus, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { validateWaterfall, type Tier, type TierType } from "~/lib/engine";
import { cn } from "~/lib/utils";
import { TIER_DESCRIPTIONS, describeTier } from "~/lib/waterfall-text";
import { api } from "~/trpc/react";
import { errorMessage } from "../shared";
import { TIER_META } from "../tier-meta";
import {
  Callout,
  EmptyState,
  PageHeader,
  PageSkeleton,
  Panel,
  TierNumber,
} from "../ui-kit";
import { toDraft, toTier, type DraftTier } from "../waterfall-draft";
import { useWaterfallDraft } from "../waterfall-draft-context";
import { TierCard } from "./tier-card";

const TIER_TYPES: TierType[] = ["roc", "pref", "split"];

const NEW_TIERS: Record<TierType, DraftTier> = {
  roc: { type: "roc" },
  pref: { type: "pref", rate: "8" },
  split: { type: "split", investors: "80", managers: "20" },
};

export function WaterfallPage() {
  const { loaded, draft, setDraft, revert, dirty, savedTiers, prefLocked } =
    useWaterfallDraft();
  const utils = api.useUtils();
  // Optimistic: the saved waterfall changes the moment you click Save, and the server confirms in
  // the background. The builder checks the same rules first, so a refusal is rare; if it happens,
  // the old waterfall comes back and your edits are restored so nothing is lost.
  const save = api.waterfall.save.useMutation({
    onMutate: async ({ tiers }) => {
      await utils.waterfall.get.cancel();
      const previous = utils.waterfall.get.getData();
      if (previous)
        utils.waterfall.get.setData(undefined, { ...previous, tiers });
      revert(); // drops the edits, which now match the saved waterfall exactly
      toast.success("Waterfall saved");
      return { previous };
    },
    onError: (error, { tiers }, context) => {
      utils.waterfall.get.setData(undefined, context?.previous);
      setDraft(tiers.map(toDraft));
      toast.error(errorMessage(error));
    },
    onSettled: () => utils.invalidate(),
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  if (!loaded) return <PageSkeleton title="Waterfall" />;

  const tiers = draft.map(toTier);
  const { errors, warnings } = validateWaterfall(tiers);
  const used = new Set(draft.map((tier) => tier.type));
  // Nothing to summarize or save until there are tiers (or the user just removed them all).
  const showSummary = draft.length > 0 || dirty;
  const canAdd = (type: TierType) =>
    !used.has(type) && !(type === "pref" && prefLocked);

  // New tiers always go at the bottom. If that's below the split, validation flags it and the
  // user drags it into place.
  const addTier = (type: TierType) => setDraft([...draft, NEW_TIERS[type]]);

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = draft.findIndex((tier) => tier.type === active.id);
    const to = draft.findIndex((tier) => tier.type === over.id);
    setDraft(arrayMove(draft, from, to));
  };

  // The same menu opens from the dashed row under the tiers and from a button in the empty state.
  const addMenu = (trigger: React.ReactNode) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[22rem] p-1.5">
        {TIER_TYPES.map((type) => (
          <DropdownMenuItem
            key={type}
            disabled={!canAdd(type)}
            onSelect={() => addTier(type)}
            className="items-start gap-2.5 p-2.5"
          >
            <span
              className={cn(
                "mt-1.5 size-2 shrink-0 rounded-full",
                TIER_META[type].swatch,
              )}
            />
            <div>
              <p className="font-medium">{TIER_META[type].label}</p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                {used.has(type)
                  ? "Already in the waterfall"
                  : type === "pref" && prefLocked
                    ? "Locked by finalized distributions"
                    : TIER_DESCRIPTIONS[type]}
              </p>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Waterfall"
        description="Tiers are paid top to bottom. Each tier is paid in full to every investor before the next one receives anything."
      />

      {prefLocked && (
        <Callout tone="info" icon={Lock}>
          The preferred return is locked because distributions have been
          finalized with it. Void them to change it. Tier order and the split
          can still be edited.
        </Callout>
      )}

      <div
        className={cn(
          "grid items-start gap-6",
          showSummary && "lg:grid-cols-[minmax(0,1fr)_300px]",
        )}
      >
        {draft.length === 0 ? (
          <Panel>
            <EmptyState
              title="No tiers yet"
              description="A common setup is return of capital, then an 8% preferred return, then an 80/20 split."
            >
              <Button
                onClick={() =>
                  setDraft(
                    // Respect the pref lock if distributions already exist without a pref tier.
                    [NEW_TIERS.roc, NEW_TIERS.pref, NEW_TIERS.split].filter(
                      (tier) => !(tier.type === "pref" && prefLocked),
                    ),
                  )
                }
              >
                Use common setup
              </Button>
              {addMenu(
                <Button variant="outline">
                  <Plus /> Add tier
                </Button>,
              )}
            </EmptyState>
          </Panel>
        ) : (
          <div className="space-y-3">
            <DndContext
              id="waterfall-tiers"
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={draft.map((t) => t.type)}
                strategy={verticalListSortingStrategy}
              >
                <ol className="space-y-3">
                  {draft.map((tier, index) => (
                    <TierCard
                      key={tier.type}
                      index={index}
                      tier={tier}
                      locked={tier.type === "pref" && prefLocked}
                      errors={errors
                        .filter((e) => e.tierIndex === index)
                        .map((e) => e.message)}
                      onChange={(next) =>
                        setDraft(draft.map((t, i) => (i === index ? next : t)))
                      }
                      onRemove={() =>
                        setDraft(draft.filter((_, i) => i !== index))
                      }
                    />
                  ))}
                </ol>
              </SortableContext>
            </DndContext>
            {TIER_TYPES.some(canAdd) &&
              addMenu(
                <button
                  type="button"
                  className="text-muted-foreground hover:border-foreground/30 hover:text-foreground flex w-full items-center justify-center gap-2 rounded-xl border border-dashed py-3 text-sm font-medium transition-colors"
                >
                  <Plus className="size-4" /> Add tier
                </button>,
              )}
          </div>
        )}

        {showSummary && (
          <SummaryPanel
            tiers={tiers}
            errorsByTier={(index) => errors.some((e) => e.tierIndex === index)}
            errorCount={errors.length}
            warnings={warnings.map((w) => w.message)}
            dirty={dirty}
            hasSaved={savedTiers.length > 0}
            onSave={() => save.mutate({ tiers })}
            onRevert={revert}
          />
        )}
      </div>
    </div>
  );
}

/** Recap of the order, validation status and the save controls. Sticks to the side on wide screens. */
function SummaryPanel({
  tiers,
  errorsByTier,
  errorCount,
  warnings,
  dirty,
  hasSaved,
  onSave,
  onRevert,
}: {
  tiers: Tier[];
  errorsByTier: (index: number) => boolean;
  errorCount: number;
  warnings: string[];
  dirty: boolean;
  hasSaved: boolean;
  onSave: () => void;
  onRevert: () => void;
}) {
  return (
    <Panel className="lg:sticky lg:top-8" title="Summary">
      <div className="space-y-4 p-5">
        {tiers.length === 0 ? (
          <p className="text-muted-foreground text-sm">No tiers.</p>
        ) : (
          <ol className="space-y-3">
            {tiers.map((tier, index) => (
              <li key={tier.type} className="flex gap-3 text-sm">
                <TierNumber type={tier.type} index={index} />
                <span
                  className={cn(
                    "leading-snug",
                    errorsByTier(index) && "text-destructive",
                  )}
                >
                  {errorsByTier(index)
                    ? `${TIER_META[tier.type].label}: needs attention`
                    : describeTier(tier)}
                </span>
              </li>
            ))}
          </ol>
        )}

        {errorCount > 0 && tiers.length > 0 && (
          <p className="text-destructive flex items-center gap-2 text-sm font-medium">
            <CircleAlert className="size-4" />
            {errorCount === 1
              ? "1 issue to fix"
              : `${errorCount} issues to fix`}
          </p>
        )}

        {warnings.map((warning) => (
          <p
            key={warning}
            className="flex gap-2 text-xs leading-relaxed text-amber-700"
          >
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            {warning}
          </p>
        ))}
      </div>

      <div className="bg-muted/40 space-y-2 border-t p-4">
        <div className="flex gap-2">
          <Button
            className="flex-1"
            onClick={onSave}
            disabled={!dirty || errorCount > 0}
          >
            Save
          </Button>
          {dirty && (
            <Button variant="outline" onClick={onRevert}>
              Revert
            </Button>
          )}
        </div>
        <p
          className={cn(
            "text-xs",
            dirty ? "text-amber-700" : "text-muted-foreground",
          )}
        >
          {dirty ? "Unsaved changes" : hasSaved ? "Saved" : "Not saved"}
        </p>
      </div>
    </Panel>
  );
}
