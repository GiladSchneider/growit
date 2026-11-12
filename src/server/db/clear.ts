import type { Db } from "~/server/db";
import {
  distributionAllocations,
  distributions,
  investments,
  waterfallTiers,
} from "~/server/db/schema";

/** Deletes every row. Children before parents, because allocations reference distributions. */
export async function clearDatabase(db: Db) {
  for (const table of [
    distributionAllocations,
    distributions,
    investments,
    waterfallTiers,
  ]) {
    // eslint-disable-next-line drizzle/enforce-delete-with-where -- intentionally clearing every row
    await db.delete(table);
  }
}
