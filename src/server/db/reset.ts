/**
 * Empties the database, so the app starts from scratch. Run with `pnpm db:reset`, then reload
 * the page (the browser keeps its cached data until it refetches).
 */
import { db } from "~/server/db";
import { clearDatabase } from "~/server/db/clear";

clearDatabase(db)
  .then(() => console.log("Database cleared."))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
