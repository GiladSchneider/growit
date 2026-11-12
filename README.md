# growit Distributions Engine

A small app for running investor distributions through a waterfall:

1. **Cap Table**: who invested, how much, and when. Expand an investment to see where it stands today, how its preferred return accrued, and every payment it received.
2. **Waterfall**: an ordered list of tiers (Return of Capital, Preferred Return, Profit Split) built by dragging cards.
3. **Distributions**: enter a date and an amount, see a live preview of who gets what (with the math shown), finalize it, and review the history.

Distributions can be run one after another with any dates and amounts. Each one takes into account everything paid before it: capital already returned, pref already paid, and pref that kept accruing on unreturned capital.

## Running it

Requires Node 20+ and pnpm.

```bash
pnpm i
pnpm db:push    # create the SQLite database (db.sqlite)
pnpm dev        # http://localhost:3000
```

The app starts empty. `pnpm db:seed` loads demo data (three investments, a waterfall and one distribution), and `pnpm db:reset` empties the database again (reload the page afterwards). No `.env` is needed: the database defaults to `file:./db.sqlite`.

`pnpm build && pnpm start` runs the production build, which is noticeably snappier than `pnpm dev` (requests take a few ms instead of a couple hundred).

Checks:

```bash
pnpm test        # engine unit tests, property tests and server tests
pnpm typecheck
pnpm lint
```

## Stack

Next.js (App Router) + TypeScript + tRPC + Drizzle on SQLite (libsql), scaffolded with create-t3-app. UI is Tailwind + shadcn/ui (Radix), dnd-kit for drag-to-reorder and sonner for toasts. The engine uses decimal.js for exact math. Tests use Vitest and fast-check.

## How it works

A finalized distribution is a record of money that has already been paid. **Anything that would change what was already owed or paid is locked; anything that only changes how future cash is routed stays editable.** Locks are undone by voiding distributions.

The engine (`src/lib/engine/`) is pure TypeScript: plain data in, plain data out, no database or UI.

- `computeInvestmentState` works out where an investment stands on a date: capital returned, and preferred return accrued as simple interest on unreturned capital, minus what has been paid.
- `runDistribution` sends an amount through the tiers in order. Return of Capital and Preferred Return pay what each investment is owed; Profit Split takes the rest and splits it between investors (by ownership) and managers.
- `planDistribution` (`src/lib/plan.ts`) runs the engine and lists anything that blocks finalizing. The browser runs it for the live preview; the server runs it again inside the finalize transaction, and that result is what's stored.

## Key decisions

- **Preferred return** is simple interest on unreturned capital (not compounded), counted Actual/365, and accrues through the distribution date before that distribution pays.
- **Shortfalls** in Return of Capital and Preferred Return are split pro rata by amount owed, so nobody is overpaid and everyone reaches zero together.
- **Profit split** goes to investors by ownership among those who had invested by the distribution date; managers are a single recipient.
- **Same-day investments** take part with 0 days of pref.
- **Rounding** uses the largest-remainder method: every tier adds up to the exact cent, deterministically.
- **Append-only ledger:** distributions can't be backdated. Mistakes are undone by voiding the latest distribution, which stays in the history.
- **Locks:** an investment that took part in a distribution can't change its amount or date, and the pref rate can't change once a distribution exists. Tier order and the split stay editable.
- **Money** is integer cents, **rates** are basis points (800 = 8%), and **dates** are `YYYY-MM-DD` strings.
- **Scope:** one row per investment, a single deal, no auth.

## Code map

```
src/lib/engine/            Pure engine + tests
  investment-state.ts      computeInvestmentState (pref accrual, balances)
  run-distribution.ts      runDistribution (tiers, eligibility, allocations)
  money.ts                 decimal setup, largest-remainder allocateProRata
  validate-waterfall.ts    errors and warnings
  engine.test.ts           unit tests (worked example, leap year, rounding, ...)
  engine.property.test.ts  fast-check properties
src/lib/plan.ts            planDistribution: engine + "why it can't be finalized" (browser and server)
src/server/
  db/schema.ts             investments, waterfall_tiers, distributions, distribution_allocations
  db/seed.ts               demo data, created through the API (so through the engine)
  db/reset.ts              empties the database (pnpm db:reset)
  ledger.ts                database reads, including loadPlanInputs for the planner
  api/routers/             investments, waterfall, distributions
  api/server.test.ts       router tests against a temporary SQLite file
src/app/                   routes: /cap-table, /waterfall, /distributions
src/app/_components/
  app-shell.tsx            sidebar navigation
  waterfall-draft-context  unsaved waterfall edits, shared across pages
  tier-meta.ts             one color per tier, used everywhere
  use-plan-inputs.ts       planner/engine inputs built from the client cache
  pref-accrual.tsx         period-by-period pref breakdown (preview and investment details)
  ui-kit.tsx               page header, stat cards, panels, callouts, empty states
  cap-table/               investments table with expandable details, add/edit dialog, optimistic mutations
  waterfall/               drag-and-drop flow builder + summary/save panel
  distributions/           in-browser live preview, allocation bar, "show the work", history
drizzle/                   generated SQL migration (used by the server tests)
```

## Tests

- **Engine unit tests:** the worked example, pref-before-ROC vs ROC-before-pref, pref owed after capital is returned, eligibility (after/on the date), ignoring payments after the as-of date, leap years, half-cent rounding, no split tier, pro rata by amount owed across different investment dates, three-way rounding with tie-breaks, determinism, and every validation error and warning.
- **Property tests (fast-check),** over random investments, valid waterfalls and sequences of distributions:
  - allocations always add up to the amount (with a split tier);
  - paid + undistributed = amount, and nothing beyond the max is paid (without one);
  - nobody is paid more than owed in ROC or pref, and no balance goes negative;
  - splitting a distribution into two on the same day gives the same totals within a cent per tier.
- **Server tests:** the browser-built preview matches the server's exactly, backdated finalize is refused, void only on the latest, pref changes refused while distributions exist (order/split changes allowed), locked investments can't be edited or deleted, new investments must come after the latest distribution, undistributed money blocks finalize.
