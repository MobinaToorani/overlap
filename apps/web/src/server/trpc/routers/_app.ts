import { createTRPCRouter } from '../trpc';
import { authRouter } from './auth';
import { groupRouter } from './group';
import { meRouter } from './me';
import { signalRouter } from './signal';

export const appRouter = createTRPCRouter({
  auth: authRouter,
  group: groupRouter,
  me: meRouter,
  signal: signalRouter,
  // plan.* joins here starting T11 — see
  // ../../trpc/routers/README.md for why it's not here yet.
});

export type AppRouter = typeof appRouter;
