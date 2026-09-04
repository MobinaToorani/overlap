/**
 * Unit tests for the group router. Unlike auth.ts (a couple of Supabase
 * SDK calls, trivially fakeable), group.ts's real logic is Drizzle
 * queries: joins, a transaction, onConflictDoNothing. Faithfully faking
 * that query builder chain would mean re-implementing enough of Drizzle to
 * risk the fake passing while the real SQL is wrong — worse than no test.
 *
 * So these tests cover exactly what's honestly verifiable without a live
 * database: zod validation (rejected before ctx.db() is ever called) and
 * the rate-limit gate on joinByCode (FIX-9/§5.2), asserting the same
 * thing — db() not reached. The actual query logic (join-code collision
 * retry, the membership-then-roster ordering in group.get, re-join
 * idempotency) needs a live Postgres. Tracked in docs/backlog.md's T4
 * entry alongside the same gap already flagged for OV-6 and the
 * migrations — not a new kind of gap, the same one.
 */
import { TRPCError } from '@trpc/server';
import { describe, expect, it, vi } from 'vitest';
import { appRouter } from '@/server/trpc/routers/_app';
import { createTestContext, fakeUser } from './helpers';

describe('group.create', () => {
  it('rejects an empty name before ever reaching the database (zod)', async () => {
    const db = vi.fn();
    const caller = appRouter.createCaller(createTestContext({ user: fakeUser('u1'), db }));

    await expect(caller.group.create({ name: '' })).rejects.toThrow();
    expect(db).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated caller (protectedProcedure)', async () => {
    const db = vi.fn();
    const caller = appRouter.createCaller(createTestContext({ user: null, db }));

    await expect(caller.group.create({ name: 'Book Club' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    } satisfies Partial<TRPCError>);
    expect(db).not.toHaveBeenCalled();
  });
});

describe('group.joinByCode', () => {
  it('rejects with TOO_MANY_REQUESTS and never touches the database when the IP limit is tripped', async () => {
    const db = vi.fn();
    const caller = appRouter.createCaller(
      createTestContext({
        user: fakeUser('u1'),
        db,
        groupJoinByIp: { check: async () => ({ allowed: false }) },
      }),
    );

    await expect(caller.group.joinByCode({ joinCode: '23456789ABCD' })).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    });
    expect(db).not.toHaveBeenCalled();
  });

  it('rejects a malformed join code before ever reaching the database (zod)', async () => {
    const db = vi.fn();
    const caller = appRouter.createCaller(createTestContext({ user: fakeUser('u1'), db }));

    await expect(caller.group.joinByCode({ joinCode: 'too-short' })).rejects.toThrow();
    expect(db).not.toHaveBeenCalled();
  });
});

describe('group.get / group.listMine', () => {
  it('reject an unauthenticated caller before touching the database', async () => {
    const db = vi.fn();
    const caller = appRouter.createCaller(createTestContext({ user: null, db }));

    await expect(
      caller.group.get({ groupId: '11111111-1111-1111-1111-111111111111' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(caller.group.listMine()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(db).not.toHaveBeenCalled();
  });

  it('group.get rejects a non-UUID groupId before ever reaching the database (zod)', async () => {
    const db = vi.fn();
    const caller = appRouter.createCaller(createTestContext({ user: fakeUser('u1'), db }));

    await expect(caller.group.get({ groupId: 'not-a-uuid' })).rejects.toThrow();
    expect(db).not.toHaveBeenCalled();
  });
});
