/**
 * Resets the database to a demo state: three investors, a pref → ROC → 80/20 waterfall and one
 * distribution about a year ago. Everything goes through the API (and so the engine and all the
 * business rules), exactly as if a user had entered it.
 *
 * Run with `pnpm db:seed`.
 */
import { addDays } from "~/lib/engine";
import { createCaller } from "~/server/api/root";
import { db } from "~/server/db";
import { clearDatabase } from "~/server/db/clear";

const today = new Date().toISOString().slice(0, 10);

async function main() {
  await clearDatabase(db);

  const api = createCaller({ db, headers: new Headers() });

  await api.investors.create({
    name: "Northwind Partners",
    amountCents: 250_000_00,
    investmentDate: addDays(today, -900),
  });
  await api.investors.create({
    name: "Maple Family Trust",
    amountCents: 150_000_00,
    investmentDate: addDays(today, -700),
  });
  await api.investors.create({
    name: "Jordan Lee",
    amountCents: 100_000_00,
    investmentDate: addDays(today, -500),
  });

  await api.waterfall.save({
    tiers: [
      { type: "pref", rateBps: 800 },
      { type: "roc" },
      { type: "split", investorBps: 8000 },
    ],
  });

  await api.distributions.finalize({
    date: addDays(today, -365),
    amountCents: 60_000_00,
  });

  console.log("Seeded 3 investors, a waterfall and 1 distribution.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
