import { createClient, type Client, type ResultSet } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

import { env } from "~/env";
import * as schema from "./schema";

/** A database or a transaction. Server helpers accept either so they can run inside a transaction. */
export type Db = BaseSQLiteDatabase<"async", ResultSet, typeof schema>;

export function createDb(url: string) {
  return drizzle(createClient({ url }), { schema });
}

/**
 * Cache the database connection in development. This avoids creating a new connection on every HMR
 * update.
 */
const globalForDb = globalThis as unknown as {
  client: Client | undefined;
};

export const client =
  globalForDb.client ?? createClient({ url: env.DATABASE_URL });
if (env.NODE_ENV !== "production") globalForDb.client = client;

export const db = drizzle(client, { schema });
