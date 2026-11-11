"use client";

import { createContext, useContext, useEffect, useState } from "react";

import type { Tier } from "~/lib/engine";
import { api } from "~/trpc/react";
import { sameTiers, toDraft, toTier, type DraftTier } from "./waterfall-draft";

type WaterfallDraft = {
  /** True once the saved waterfall has loaded. */
  loaded: boolean;
  savedTiers: Tier[];
  prefLocked: boolean;
  /** What the builder shows: the user's edits, or the saved waterfall if there are none. */
  draft: DraftTier[];
  setDraft: (draft: DraftTier[]) => void;
  /** Throws away unsaved edits and goes back to the saved waterfall. */
  revert: () => void;
  dirty: boolean;
};

const WaterfallDraftContext = createContext<WaterfallDraft | null>(null);

/**
 * Holds the waterfall being edited above the pages, so unsaved edits survive moving between steps
 * and the Distributions page can warn that its preview uses the saved waterfall.
 */
export function WaterfallDraftProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data } = api.waterfall.get.useQuery();
  // null means "no edits yet": show the saved waterfall.
  const [edits, setEdits] = useState<DraftTier[] | null>(null);

  const savedTiers = data?.tiers ?? [];
  const dirty = edits !== null && !sameTiers(edits.map(toTier), savedTiers);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return (
    <WaterfallDraftContext.Provider
      value={{
        loaded: data !== undefined,
        savedTiers,
        prefLocked: data?.prefLocked ?? false,
        draft: edits ?? savedTiers.map(toDraft),
        setDraft: setEdits,
        revert: () => setEdits(null),
        dirty,
      }}
    >
      {children}
    </WaterfallDraftContext.Provider>
  );
}

export function useWaterfallDraft(): WaterfallDraft {
  const value = useContext(WaterfallDraftContext);
  if (!value)
    throw new Error(
      "useWaterfallDraft must be used inside WaterfallDraftProvider",
    );
  return value;
}
