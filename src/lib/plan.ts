// Plans a distribution: runs the engine and lists every reason it can't be finalized.
// Pure, like the engine, so the same code runs in two places:
//   - in the browser, on cached data, for an instant live preview while the user types;
//   - on the server, inside the finalize transaction, as the authority that decides what's stored.
// The engine is deterministic, so both produce the same result from the same ledger.
import {
  allocationsToPayments,
  runDistribution,
  validateWaterfall,
  type Allocation,
  type DistributionResult,
  type Investment,
  type PriorPayment,
  type Tier,
} from "~/lib/engine";
import { formatDate, formatList, plural } from "~/lib/format";

/** A finalized distribution that hasn't been voided. */
export type ActiveDistribution = {
  id: number;
  date: string;
  amountCents: number;
};

export type PlanInputs = {
  investments: Investment[];
  /** The saved waterfall. */
  tiers: Tier[];
  activeDistributions: ActiveDistribution[];
  /** Investor payments from the active distributions. */
  priorPayments: PriorPayment[];
};

/**
 * Builds the planner's inputs from the data the browser already has (the cap table, the saved
 * waterfall and the distribution history), the same way the server reads them from the database.
 */
export function toPlanInputs(data: {
  investments: Investment[];
  tiers: Tier[];
  distributions: (ActiveDistribution & {
    status: "finalized" | "voided";
    allocations: Allocation[];
  })[];
}): PlanInputs {
  const active = data.distributions.filter((d) => d.status === "finalized");
  return {
    // Copy just the fields the engine uses, so the result has exactly the server's shape.
    investments: data.investments.map(
      ({ id, investorName, amountCents, investmentDate, createdAt }) => ({
        id,
        investorName,
        amountCents,
        investmentDate,
        createdAt,
      }),
    ),
    tiers: data.tiers,
    activeDistributions: active.map(({ id, date, amountCents }) => ({
      id,
      date,
      amountCents,
    })),
    priorPayments: active.flatMap((d) =>
      allocationsToPayments(d.date, d.allocations),
    ),
  };
}

/** A reason a distribution can't be finalized. The code lets the UI offer the right fix. */
export type Problem = {
  code:
    | "backdated"
    | "no-waterfall"
    | "invalid-waterfall"
    | "no-investments"
    | "no-eligible-investments"
    | "no-amount"
    | "undistributed";
  message: string;
};

export type DistributionPlan = {
  /** The engine's answer, or null when it can't run at all (see `problems`). */
  result: DistributionResult | null;
  /** Why this distribution can't be finalized. Empty means it can. */
  problems: Problem[];
  /** Active distributions dated after the requested date (they block it). */
  blocking: ActiveDistribution[];
  tiers: Tier[];
};

export function planDistribution(
  { investments, tiers, activeDistributions, priorPayments }: PlanInputs,
  date: string,
  amountCents: number,
): DistributionPlan {
  // Append-only ledger: a new distribution can't go before an active one.
  const blocking = activeDistributions
    .filter((d) => d.date > date)
    .sort((a, b) =>
      a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1,
    );

  const problems: Problem[] = [];
  if (blocking.length > 0) {
    problems.push({ code: "backdated", message: backdatedMessage(blocking) });
  }

  if (tiers.length === 0) {
    problems.push({
      code: "no-waterfall",
      message:
        "There's no waterfall yet. Build and save one in the Waterfall step.",
    });
  } else if (validateWaterfall(tiers).errors.length > 0) {
    problems.push({
      code: "invalid-waterfall",
      message:
        "The saved waterfall has errors. Fix them in the Waterfall step.",
    });
  }

  if (investments.length === 0) {
    problems.push({
      code: "no-investments",
      message: "There are no investments yet. Add them on the Cap table page.",
    });
  } else if (!investments.some((i) => i.investmentDate <= date)) {
    problems.push({
      code: "no-eligible-investments",
      message:
        "No investors had invested by this date. Pick a date on or after the first investment.",
    });
  }

  if (amountCents <= 0) {
    problems.push({
      code: "no-amount",
      message: "Enter an amount greater than $0.",
    });
  }

  // Only run the engine when the result would mean something.
  if (problems.length > 0) return { result: null, problems, blocking, tiers };

  const result = runDistribution({
    investments,
    tiers,
    priorPayments,
    date,
    amountCents,
  });
  if (result.undistributedCents > 0) {
    problems.push({
      code: "undistributed",
      message:
        "Part of this amount can't be paid to anyone, because the waterfall has no Profit Split tier " +
        "to take what's left after investors are paid what they're owed. Lower the amount, or add a Profit Split tier.",
    });
  }
  return { result, problems, blocking, tiers };
}

export function backdatedMessage(blocking: { date: string }[]): string {
  const one = blocking.length === 1;
  return (
    `This date is before ${one ? "a finalized distribution" : plural(blocking.length, "finalized distribution")} ` +
    `(${formatList(blocking.map((d) => formatDate(d.date)))}). ` +
    "Distributions are recorded in order because each one depends on the ones before it. " +
    (one
      ? "If it was entered by mistake, void it and then enter this one."
      : "If those were entered by mistake, void them (latest first) and then enter this one.")
  );
}
