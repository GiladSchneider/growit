import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import type { Tier } from "~/lib/engine";

// Conventions: money is integer cents, rates are integer basis points (800 = 8%),
// dates are "YYYY-MM-DD" text, timestamps are ISO strings.

const createdAt = () =>
  text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString());

/** The cap table. One row per investment: someone who invests twice has two rows. */
export const investors = sqliteTable("investors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  amountCents: integer("amount_cents").notNull(),
  investmentDate: text("investment_date").notNull(),
  createdAt: createdAt(),
});

/** The single current waterfall, one row per tier. */
export const waterfallTiers = sqliteTable("waterfall_tiers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  position: integer("position").notNull(),
  type: text("type", { enum: ["roc", "pref", "split"] }).notNull(),
  /** Only for pref tiers. */
  prefRateBps: integer("pref_rate_bps"),
  /** Only for split tiers. Managers get 10,000 - investorSplitBps. */
  investorSplitBps: integer("investor_split_bps"),
});

/**
 * Finalized distributions: money that was actually paid. Never edited or deleted; a mistake is
 * fixed by voiding (status = "voided"), which keeps the record for the audit trail.
 */
export const distributions = sqliteTable("distributions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  amountCents: integer("amount_cents").notNull(),
  status: text("status", { enum: ["finalized", "voided"] }).notNull(),
  /** Copy of the tiers this distribution was run with. */
  waterfallSnapshot: text("waterfall_snapshot", { mode: "json" })
    .$type<Tier[]>()
    .notNull(),
  createdAt: createdAt(),
  voidedAt: text("voided_at"),
});

/** Who got paid what, stored at finalize time and never recalculated. */
export const distributionAllocations = sqliteTable(
  "distribution_allocations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    distributionId: integer("distribution_id")
      .notNull()
      .references(() => distributions.id),
    tierType: text("tier_type", { enum: ["roc", "pref", "split"] }).notNull(),
    recipientType: text("recipient_type", {
      enum: ["investor", "manager"],
    }).notNull(),
    /**
     * Null for the managers' share. Deliberately not a foreign key: voided distributions keep their
     * allocations for the audit trail, and an investor they unlocked may later be deleted.
     */
    investorId: integer("investor_id"),
    amountCents: integer("amount_cents").notNull(),
  },
  (t) => [index("allocations_distribution_idx").on(t.distributionId)],
);
