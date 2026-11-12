// The distributions engine: pure functions, plain data in and out. No database, tRPC or React.
export * from "./types";
export { addDays, daysBetween, isValidDate } from "./dates";
export { computeInvestmentState } from "./investment-state";
export {
  allocationsToPayments,
  prefRateOf,
  runDistribution,
  type RunDistributionInput,
} from "./run-distribution";
export {
  TIER_LABELS,
  validateWaterfall,
  type WaterfallIssue,
  type WaterfallValidation,
} from "./validate-waterfall";
