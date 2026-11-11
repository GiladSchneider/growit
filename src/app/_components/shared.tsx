"use client";

import { TRPCClientError } from "@trpc/client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { centsToInputText, parseMoneyToCents } from "~/lib/parse";
import { cn } from "~/lib/utils";

/** The best message to show for a failed request: the first validation message, else the server's. */
export function errorMessage(error: unknown): string {
  if (error instanceof TRPCClientError) {
    const data = error.data as
      | {
          zodError?: {
            fieldErrors: Record<string, string[]>;
            formErrors: string[];
          } | null;
        }
      | undefined;
    const zodError = data?.zodError;
    const first = zodError
      ? [
          ...zodError.formErrors,
          ...Object.values(zodError.fieldErrors).flat(),
        ][0]
      : undefined;
    return first ?? error.message;
  }
  return error instanceof Error ? error.message : "Something went wrong.";
}

const fieldClasses =
  "border-input bg-background w-full min-w-0 rounded-lg border shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/15 tabular-nums";

/**
 * A dollar amount. The parent keeps the raw text; the input shows a "$" and tidies the number
 * (adds commas and cents) when you leave the field.
 */
export function MoneyInput({
  value,
  onChange,
  className,
  invalid,
  size = "md",
  ...props
}: {
  value: string;
  onChange: (text: string) => void;
  invalid?: boolean;
  size?: "md" | "lg";
} & Omit<React.ComponentProps<"input">, "value" | "onChange" | "size">) {
  return (
    <div className={cn("relative", className)}>
      <span
        className={cn(
          "text-muted-foreground pointer-events-none absolute top-1/2 -translate-y-1/2",
          size === "lg" ? "left-3.5 text-base" : "left-3 text-sm",
        )}
      >
        $
      </span>
      <input
        {...props}
        inputMode="decimal"
        autoComplete="off"
        className={cn(
          fieldClasses,
          size === "lg"
            ? "h-11 pr-3.5 pl-7 text-lg font-semibold"
            : "h-9 pr-3 pl-6 text-sm",
        )}
        aria-invalid={invalid}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          const cents = parseMoneyToCents(value);
          if (cents !== null) onChange(centsToInputText(cents));
        }}
      />
    </div>
  );
}

/** A percentage box with a "%" suffix. Holds raw text; parsing happens in the caller. */
export function PercentInput({
  value,
  onChange,
  className,
  invalid,
  ...props
}: {
  value: string;
  onChange: (text: string) => void;
  invalid?: boolean;
} & Omit<React.ComponentProps<"input">, "value" | "onChange">) {
  return (
    <div className={cn("relative", className)}>
      <input
        {...props}
        inputMode="decimal"
        autoComplete="off"
        className={cn(
          fieldClasses,
          "h-9 pr-7 pl-3 text-right text-sm font-medium",
        )}
        aria-invalid={invalid}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm">
        %
      </span>
    </div>
  );
}

export function TextInput({
  className,
  invalid,
  ...props
}: { invalid?: boolean } & React.ComponentProps<"input">) {
  return (
    <input
      {...props}
      aria-invalid={invalid}
      className={cn(fieldClasses, "h-9 px-3 text-sm", className)}
    />
  );
}

/** Wraps something (often a disabled button) in a tooltip. Disabled buttons don't fire pointer events, so we wrap them in a span. */
export function Hint({
  text,
  children,
  className,
}: {
  text: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  if (!text) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className={cn("inline-flex", className)}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs leading-relaxed">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

export function FieldError({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return <p className="text-destructive text-sm">{children}</p>;
}
