import { createTRPCRouter } from '../trpc';
import { authRouter } from './auth';
import { groupRouter } from './group';

export const appRouter = createTRPCRouter({
  auth: authRouter,
  group: groupRouter,
  // signal.*, plan.*, etc. join here starting T6 — see
  // ../../trpc/routers/README.md for why they're not here yet.
});

export type AppRouter = typeof appRouter;
