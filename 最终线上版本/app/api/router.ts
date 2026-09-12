import { createRouter, publicQuery } from "./middleware";
import { responseRouter } from "./responseRouter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  responses: responseRouter,
});

export type AppRouter = typeof appRouter;
