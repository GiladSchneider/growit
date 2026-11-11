# GrowIt Distributions Engine

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

The app starts empty. No `.env` is needed: the database defaults to `file:./db.sqlite`.

`pnpm build && pnpm start` runs the production build, which is noticeably snappier than `pnpm dev` (requests take a few ms instead of a couple hundred).

`pnpm db:reset` empties the database (reload the page afterwards). Optionally, `pnpm db:seed` replaces everything with sample data (3 investors, a waterfall and one distribution about a year ago).

```bash
pnpm test        # engine unit tests, property tests and server tests
pnpm typecheck
pnpm lint
```

## Stack

Next.js (App Router) + TypeScript + tRPC + Drizzle on SQLite (libsql), scaffolded with create-t3-app (no auth). UI is Tailwind + shadcn/ui (Radix), dnd-kit for drag-to-reorder and sonner for toasts. The engine uses decimal.js for exact math. Tests use Vitest and fast-check.

## The guiding principle

> A finalized distribution is a record of money that has already been paid.
> **Anything that would change what was already owed or paid is locked. Anything that only changes how future cash is routed stays editable.**
> Locks are always undone the same way: by voiding distributions.

That one rule explains the append-only ledger, the cap table lock and the pref-terms lock described below.

## How the engine works

The engine (`src/lib/engine/`) is pure TypeScript with no database, tRPC or React imports. It takes plain data in and returns plain data out. Same inputs, same outputs.

### Conventions

- **Money** is integer **cents** everywhere (decimal.js only inside the engine).
- **Rates** are **basis points**: 800 = 8%, an 80/20 split is `investorBps: 8000`.
- **Dates** are `YYYY-MM-DD` strings. Day counts parse them as UTC, so time zones can't shift a day.

### Where an investor stands: `computeInvestorState(investor, priorPayments, asOfDate, prefRateBps)`

- Only payments **on or before** `asOfDate` count. Payments on that date are from earlier distributions that day. Anything later hasn't happened yet.
- **Unreturned capital** = investment − all return-of-capital payments so far.
- **Preferred return** is **simple interest on unreturned capital, Actual/365**:

  ```
  accrued = Σ unreturnedCapital × rate × days / 365
  ```

  The sum runs over the periods between the investment date, each day capital was returned, and `asOfDate`. A capital return lowers the balance from that day on. The integer part (`cents × bps × days`) is summed exactly and divided once, so the only rounding is the final round to cents.
- **Pref owed** = `round(accrued) − pref paid` (half-up). Unpaid pref **stays owed after capital is fully returned**; it just stops growing.
- It also returns the accrual periods, which the UI shows as "show the work".

### Running a distribution: `runDistribution({ investors, tiers, priorPayments, date, amountCents })`

1. **Eligible investors** are those with `investmentDate <= date`. Someone who invests on the distribution date is included with 0 days of pref. Later investors are left out completely, including from ownership %.
2. Each eligible investor's state is computed as of the date. Pref accrues **through** the distribution date, before this distribution pays anything.
3. Money flows through the tiers in order:
   - **Return of Capital**: each investor is owed their unreturned capital.
   - **Preferred Return**: each investor is owed their pref owed.
   - For both: if there's enough, everyone is paid in full. Otherwise what's left is split **pro rata by amount owed in that tier**.
   - **Profit Split**: takes everything left. Investors get `investorBps / 10,000` of it, shared by ownership % among eligible investors. Managers get the rest.
4. **Rounding** uses the largest-remainder method: everyone gets their exact share rounded down to the cent, then the leftover cents go one at a time to whoever lost the most. Ties go to the earliest-created investor, and managers come last. Every tier adds up exactly, and the tiers add up exactly to the amount.
5. If money is left after the last tier (only possible with no split tier), it's returned as `undistributedCents` along with `maxDistributableCents`. The server refuses to finalize that.

### Worked example (it's also the first unit test)

Waterfall: ROC → 8% pref → 80/20. Investor A invests $100,000 on 2025-01-01.

| Distribution | ROC | Pref | Split (investors / managers) |
| --- | --- | --- | --- |
| $50,000 on 2026-01-01 | $50,000 | $0 (money ran out; $8,000 stays owed) | — |
| $100,000 on 2027-01-01 | $50,000 | $12,000 = $8,000 (100k × 8% × 365/365) + $4,000 (50k × 8% × 365/365) | $30,400 / $7,600 |

## Making the UI feel instant

Every click should show a result right away; the network shouldn't be in the way. (In `next dev` each request costs about 240 ms on its own, so this is very visible.)

- **Data is loaded on the server.** The root layout prefetches the cap table, waterfall and distributions, and `HydrateClient` hands them to the client cache. The first paint already has data, and switching pages reads from the cache instead of fetching. Sidebar links are fully prefetched in production builds.
- **The live preview runs in the browser.** `planDistribution` (`src/lib/plan.ts`) is pure, like the engine, so the preview runs it on cached data as you type, with no request and no debounce. Finalize runs the *same* function again on the server inside the transaction, and the server's result is what gets stored. The engine is deterministic, so both agree; a server test builds the inputs exactly the way the browser does and checks that the two plans are identical.
- **Balances are computed in the browser too.** Expanding an investment runs `computeInvestorState` on the same cached inputs, so it opens instantly. There's no separate balances endpoint: the engine is the single source, on both sides.
- **Reversible edits are optimistic.** Adding, editing or deleting an investment and saving the waterfall update the cached data immediately. The forms check the same rules the server enforces first, so a refusal is rare; if one happens (e.g. another tab finalized a distribution), the change is rolled back and the server's message is shown.
- **Money-moving writes wait for the server.** Finalize and void change the ledger, so they aren't optimistic. Their buttons show progress the moment you click and stay busy until the server has agreed *and* the fresh data has arrived; then the confirmation, history and totals all update together, so old numbers are never shown as current.

## Business rules (enforced on the server, not just in the UI)

- **Append-only ledger.** A distribution can only be finalized on or after the latest active distribution's date. Same-day is fine; those are ordered by creation. Backdating is refused, and the error lists the distributions in the way and how to fix it. The check runs again inside the finalize transaction (SQLite `BEGIN IMMEDIATE`), so it can't race.
  - *Why:* a finalized distribution is money that was paid, so it's never recalculated. Inserting an earlier one would make every later one wrong. If the later ones really were paid, the production answer is a **true-up** on the next distribution, not rewriting history (see future work).
- **Void** is how mistakes are undone. Only the **latest** active distribution can be voided. It's marked `voided` and kept for the audit trail, and its allocations stop counting everywhere. To fix an older mistake, void back one at a time and re-enter in order. Because the engine is deterministic, re-entering gives the same results.
- **Stored, not recalculated.** Each finalized distribution stores its allocations and a snapshot of the waterfall it used.
- **Pref-terms lock.** While any active distribution exists, the pref tier can't be added, removed or have its rate changed. Pref owed is always recomputed from the full history at the current rate, so changing it would change what was owed for periods already settled. Example: at 8%, $8,000 of pref was paid for year one; switching to 10% would make year one worth $10,000 and invent $2,000 of owed pref. **Tier order and the split ratio stay editable** because they only route future cash. This is also why using one rate over the whole history is safe.
- **Cap table lock.** An investment dated on or before the latest active distribution took part in it, so its amount and date are locked and it can't be deleted. Names can always change. New investments, and new dates on unlocked ones, must be **after** the latest distribution. This matches the `<=` eligibility rule.
- **Waterfall validation** has **errors**, which block saving, and **warnings**, which are allowed but shown:
  - Errors: at least one tier; each tier type at most once; **nothing after Profit Split**, since the split takes everything and a lower tier could never be paid (ROC and pref can go in either order); pref rate 0.01–100%; split 0–100%.
  - Warnings: no ROC tier (capital is never returned, so pref keeps accruing on the full investment); no Split tier (anything beyond what's owed can't be distributed).

## Assumptions and tradeoffs

- **Simple, not compounding, pref** on unreturned capital only, as the assignment describes. Unpaid pref doesn't earn pref.
- **Actual/365.** A period that spans Feb 29 has 366 days, so a leap year pays slightly more than the nominal rate (8% → 8.0219%). Actual/365 is common in LPAs. The alternative, Actual/Actual, varies the denominator.
- **Pro rata by amount owed** within ROC and pref tiers, rather than by ownership %. It never overpays anyone, everyone hits zero at the same time ("until the condition is met for ALL investors"), and it matches common LPA language ("in proportion to their unreturned capital contributions"). Splitting by ownership % can overpay someone who's owed less and then needs a cap-and-redistribute loop.
- **Largest-remainder rounding** with deterministic tie-breaks, so totals are exact and results are reproducible.
- **Same-day investors are included** with 0 days of pref. That's the least surprising behavior when trying the app ("add an investor today, distribute today").
- **One row per investment.** Someone who invests twice appears as two rows, each with its own date and pref clock. The engine has to work per investment anyway (each one accrues pref from its own date); grouping rows by person would add an `investors` table with `investments` under it, without changing the engine.
- **Single deal.** There's no deals table. Supporting several deals would mean scoping the cap table, waterfall and distributions to a `deal_id`.
- **Drafts aren't stored.** A draft is just the live preview; only finalized distributions are saved.
- **Voided allocations keep their `investor_id` without a foreign key.** A voided distribution can unlock an investor who is then deleted, and the voided record should survive that. History then shows "Removed investor".

## Code map

```
src/lib/engine/            Pure engine + tests
  investor-state.ts        computeInvestorState (pref accrual, balances)
  run-distribution.ts      runDistribution (tiers, eligibility, allocations)
  money.ts                 decimal setup, largest-remainder allocateProRata
  validate-waterfall.ts    errors and warnings
  engine.test.ts           unit tests (worked example, leap year, rounding, ...)
  engine.property.test.ts  fast-check properties
src/lib/plan.ts            planDistribution: engine + "why it can't be finalized" (browser and server)
src/server/
  db/schema.ts             investors, waterfall_tiers, distributions, distribution_allocations
  db/seed.ts               demo data, created through the API (so through the engine)
  db/reset.ts              empties the database (pnpm db:reset)
  ledger.ts                database reads, including loadPlanInputs for the planner
  api/routers/             investors, waterfall, distributions
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
- **Property tests (fast-check),** over random investors, valid waterfalls and sequences of distributions:
  - allocations always add up to the amount (with a split tier);
  - paid + undistributed = amount, and nothing beyond the max is paid (without one);
  - nobody is paid more than owed in ROC or pref, and no balance goes negative;
  - splitting a distribution into two on the same day gives the same totals within a cent per tier.
- **Server tests:** the browser-built preview matches the server's exactly, backdated finalize is refused, void only on the latest, pref changes refused while distributions exist (order/split changes allowed), locked investors can't be edited or deleted, new investments must come after the latest distribution, undistributed money blocks finalize.

## Future work

- **Backdated insert with resimulation, limited to unpaid records.** Allow an earlier date and show which later distributions would be voided and recalculated, with old vs. new amounts. Then in one transaction: void them, insert the new one, and re-run the voided ones in order with their original dates, amounts and waterfall snapshots, linked to the originals.
- **True-up adjustments** for payments that were recorded late: carry the difference into the next distribution instead of rewriting history.
- Multiple tiers of the same type (e.g. pref hurdles at different rates), IRR hurdles, GP catch-up.
- Separate waterfalls for operating cash vs. capital events.
- Capital calls, taxes and withholding.
- Group investments by investor (an `investors` table with `investments` under it), with per-investor totals.
- Compute "today" (the default dates) in the user's time zone. It's currently the server's local date, which only matters once the app is deployed.
- Multiple deals, users and auth, and an audit log of who changed what.
