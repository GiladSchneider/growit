/**
 * tRPC setup: the request context (just the database; there's no auth) and the procedure builders.
 */
import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";

import { db, type Db } from "~/server/db";

export const createTRPCContext = async (opts: {
  headers: Headers;
  db?: Db;
}) => {
  return {
    ...opts,
    // Tests pass their own temporary database.
    db: opts.db ?? db,
  };
};

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createCallerFactory = t.createCallerFactory;
export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;
