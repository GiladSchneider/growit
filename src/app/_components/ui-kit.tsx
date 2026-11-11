"use client";

// Small presentational building blocks shared by every page.

import { type LucideIcon } from "lucide-react";

import { Skeleton } from "~/components/ui/skeleton";
import type { TierType } from "~/lib/engine";
import { formatCents } from "~/lib/format";
import { cn } from "~/lib/utils";
import { MANAGER_META, TIER_META } from "./tier-meta";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="text-muted-foreground mt-1 text-sm">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  dot,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  /** Swatch class of the tier this number belongs to, if any. */
  dot?: string;
}) {
  return (
    <div className="bg-card rounded-xl border p-4 shadow-xs">
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
        {dot && <span className={cn("size-2 rounded-full", dot)} />}
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      {hint && <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>}
    </div>
  );
}

/** A white card with an optional header row. */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "bg-card overflow-hidden rounded-xl border shadow-xs",
        className,
      )}
    >
      {(title ?? actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
          <div>
            {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
            {description && (
              <p className="text-muted-foreground mt-0.5 text-sm">
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function EmptyState({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center px-6 py-12 text-center",
        className,
      )}
    >
      <h3 className="text-sm font-semibold">{title}</h3>
      {description && (
        <p className="text-muted-foreground mt-1 max-w-sm text-sm">
          {description}
        </p>
      )}
      {children && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {children}
        </div>
      )}
    </div>
  );
}

/** Dollar amount from cents. Zeros can render as a quiet dash to keep tables readable. */
export function Money({
  cents,
  zero = "amount",
  className,
}: {
  cents: number;
  zero?: "amount" | "dash";
  className?: string;
}) {
  if (cents === 0 && zero === "dash") {
    return <span className="text-muted-foreground/60">—</span>;
  }
  return (
    <span className={cn("tabular-nums", className)}>{formatCents(cents)}</span>
  );
}

/** Colored icon tile for a tier (or the managers). */
export function TierIcon({
  type,
  size = "md",
}: {
  type: TierType | "managers";
  size?: "sm" | "md" | "lg";
}) {
  const meta = type === "managers" ? MANAGER_META : TIER_META[type];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center ring-1 ring-inset",
        meta.tile,
        size === "sm" && "size-6 rounded-md [&_svg]:size-3",
        size === "md" && "size-8 rounded-lg [&_svg]:size-4",
        size === "lg" && "size-10 rounded-xl [&_svg]:size-5",
      )}
    >
      <Icon />
    </span>
  );
}

/** A tier's position in the waterfall, in the tier's color. */
export function TierNumber({ type, index }: { type: TierType; index: number }) {
  return (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white",
        TIER_META[type].swatch,
      )}
    >
      {index + 1}
    </span>
  );
}

/** A tier's name with its color dot, for table headers and legends. */
export function TierLabel({
  type,
  className,
}: {
  type: TierType | "managers";
  className?: string;
}) {
  const meta = type === "managers" ? MANAGER_META : TIER_META[type];
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className={cn("size-2 shrink-0 rounded-full", meta.swatch)} />
      {meta.label}
    </span>
  );
}

/** Initials in a circle, with a stable color per name. */
export function Avatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
  const palette = [
    "bg-sky-100 text-sky-700",
    "bg-violet-100 text-violet-700",
    "bg-amber-100 text-amber-800",
    "bg-rose-100 text-rose-700",
    "bg-teal-100 text-teal-700",
    "bg-indigo-100 text-indigo-700",
  ];
  const hash = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        palette[hash % palette.length],
        className,
      )}
    >
      {initials || "?"}
    </span>
  );
}

/** Colored callouts for notes, warnings and errors. */
export function Callout({
  tone,
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  tone: "info" | "warning" | "danger" | "success";
  icon: LucideIcon;
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const tones = {
    info: "border-border bg-muted/50 text-foreground [&_.callout-icon]:text-muted-foreground",
    warning:
      "border-amber-200 bg-amber-50 text-amber-950 [&_.callout-icon]:text-amber-600",
    danger:
      "border-red-200 bg-red-50 text-red-950 [&_.callout-icon]:text-red-600",
    success:
      "border-emerald-200 bg-emerald-50 text-emerald-950 [&_.callout-icon]:text-emerald-600",
  };
  return (
    <div
      role={tone === "danger" ? "alert" : undefined}
      className={cn(
        "flex gap-3 rounded-xl border p-3.5 text-sm",
        tones[tone],
        className,
      )}
    >
      <Icon className="callout-icon mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1 leading-relaxed">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="opacity-90">{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

/** Shown only while a page's data is loading. The title renders right away. */
export function PageSkeleton({ title }: { title: string }) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

export function DateField({
  label,
  value,
  onChange,
  hint,
  disabled,
  invalid,
  className,
}: {
  label: string;
  value: string;
  onChange: (date: string) => void;
  hint?: React.ReactNode;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
}) {
  return (
    <label className={cn("grid content-start gap-1.5", className)}>
      <span className="text-sm font-medium">{label}</span>
      <input
        type="date"
        value={value}
        disabled={disabled}
        aria-invalid={invalid}
        onChange={(e) => onChange(e.target.value)}
        className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/40 aria-invalid:border-destructive aria-invalid:ring-destructive/15 h-9 rounded-lg border px-3 text-sm tabular-nums shadow-xs outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:ring-3"
      />
      {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
    </label>
  );
}
