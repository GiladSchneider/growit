import { distributionsRouter } from "~/server/api/routers/distributions";
import { investmentsRouter } from "~/server/api/routers/investments";
import { waterfallRouter } from "~/server/api/routers/waterfall";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

export const appRouter = createTRPCRouter({
  investments: investmentsRouter,
  waterfall: waterfallRouter,
  distributions: distributionsRouter,
});

export type AppRouter = typeof appRouter;

/** Calls the API directly from server code (the seed script and tests use this). */
export const createCaller = createCallerFactory(appRouter);
