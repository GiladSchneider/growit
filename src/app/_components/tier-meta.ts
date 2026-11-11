import {
  Briefcase,
  Percent,
  RotateCcw,
  Split,
  type LucideIcon,
} from "lucide-react";

import { TIER_LABELS, type TierType } from "~/lib/engine";

// One color per tier, used everywhere a tier shows up (builder, previews, charts, history),
// so "violet = preferred return" is learned once. The profit split and the managers' share of it
// are two shades of the same green because they come from the same tier.

type Meta = {
  label: string;
  short: string;
  icon: LucideIcon;
  /** Solid swatch: legend dots and chart segments. */
  swatch: string;
  /** Tinted icon tile. */
  tile: string;
  /** Plain text color. */
  text: string;
};

export const TIER_META: Record<TierType, Meta> = {
  roc: {
    label: TIER_LABELS.roc,
    short: "Capital",
    icon: RotateCcw,
    swatch: "bg-sky-500",
    tile: "bg-sky-50 text-sky-600 ring-sky-200",
    text: "text-sky-700",
  },
  pref: {
    label: TIER_LABELS.pref,
    short: "Pref",
    icon: Percent,
    swatch: "bg-violet-500",
    tile: "bg-violet-50 text-violet-600 ring-violet-200",
    text: "text-violet-700",
  },
  split: {
    label: TIER_LABELS.split,
    short: "Split",
    icon: Split,
    swatch: "bg-emerald-500",
    tile: "bg-emerald-50 text-emerald-600 ring-emerald-200",
    text: "text-emerald-700",
  },
};

export const MANAGER_META: Meta = {
  label: "Managers",
  short: "Managers",
  icon: Briefcase,
  swatch: "bg-emerald-800",
  tile: "bg-emerald-100 text-emerald-800 ring-emerald-300",
  text: "text-emerald-800",
};
