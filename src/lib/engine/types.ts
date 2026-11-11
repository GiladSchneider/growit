export type TierType = "roc" | "pref" | "split";

export type Investor = {
  id: number;
  name: string;
  amountCents: number;
  /** YYYY-MM-DD */
  investmentDate: string;
  /** ISO timestamp. Only used to break rounding ties deterministically. */
  createdAt: string;
};

export type Tier =
  | { type: "roc" }
  | { type: "pref"; rateBps: number }
  | { type: "split"; investorBps: number };

/** One past payment to one investor, taken from the allocations of active distributions. */
export type PriorPayment = {
  date: string;
  investorId: number;
  tierType: TierType;
  amountCents: number;
};

/** A stretch of time during which unreturned capital was constant, so pref accrued at a steady pace. */
export type AccrualPeriod = {
  from: string;
  to: string;
  days: number;
  unreturnedCapitalCents: number;
  /** Exact pref accrued in this period, in cents, as a decimal string (may have fractions of a cent). */
  accruedCents: string;
};

export type InvestorState = {
  capitalReturnedCents: number;
  unreturnedCapitalCents: number;
  /** Exact pref accrued to date, in cents, as a decimal string. */
  prefAccruedCents: string;
  prefPaidCents: number;
  prefOwedCents: number;
  splitPaidCents: number;
  totalReceivedCents: number;
  accrualPeriods: AccrualPeriod[];
};

export type Allocation = {
  tierType: TierType;
  recipientType: "investor" | "manager";
  investorId: number | null;
  amountCents: number;
};

export type InvestorResult = {
  investor: Investor;
  /** Share of the eligible investors' total investment (0 to 1). Used by the profit split. */
  ownership: number;
  byTier: Record<TierType, number>;
  totalCents: number;
  before: InvestorState;
  after: InvestorState;
};

export type DistributionResult = {
  date: string;
  amountCents: number;
  /** One entry per tier, in waterfall order. */
  tierTotals: { type: TierType; amountCents: number }[];
  /** Eligible investors only, in tie-break order (createdAt, then id). */
  investors: InvestorResult[];
  managerCents: number;
  /** Flat list of every payment, ready to store. */
  allocations: Allocation[];
  /** Money no tier could take. Only possible when there is no split tier. */
  undistributedCents: number;
  /** The most this waterfall can pay out on this date, or null if a split tier takes any amount. */
  maxDistributableCents: number | null;
};
