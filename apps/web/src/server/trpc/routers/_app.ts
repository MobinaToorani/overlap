import { createTRPCRouter } from '../trpc';
import { authRouter } from './auth';

export const appRouter = createTRPCRouter({
  auth: authRouter,
  // group.*, signal.*, plan.*, etc. join here starting T4 — see
  // ../../trpc/routers/README.md for why they're not here yet.
});

export type AppRouter = typeof appRouter;
