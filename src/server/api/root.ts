import { distributionsRouter } from "~/server/api/routers/distributions";
import { investorsRouter } from "~/server/api/routers/investors";
import { waterfallRouter } from "~/server/api/routers/waterfall";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

export const appRouter = createTRPCRouter({
  investors: investorsRouter,
  waterfall: waterfallRouter,
  distributions: distributionsRouter,
});

export type AppRouter = typeof appRouter;

/** Calls the API directly from server code (the seed script and tests use this). */
export const createCaller = createCallerFactory(appRouter);
