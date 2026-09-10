/**
 * Unit tests for the me router. Same honesty constraint as group.test.ts:
 * the query/update itself needs a live Postgres (covered in
 * tests/integration/liveDb.test.ts), so what's verifiable here is the zod
 * contract and the auth gate — both asserted the same way, by proving
 * ctx.db() was never reached.
 */
import { TRPCError } from '@trpc/server';
import { describe, expect, it, vi } from 'vitest';
import { appRouter } from '@/server/trpc/routers/_app';
import { createTestContext, fakeUser } from './helpers';

describe('me.get', () => {
  it('rejects an unauthenticated caller (protectedProcedure)', async () => {
    const db = vi.fn();
    const caller = appRouter.createCaller(createTestContext({ user: null, db }));

    await expect(caller.me.get()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    } satisfies Partial<TRPCError>);
    expect(db).not.toHaveBeenCalled();
  });
});

describe('me.updateProfile', () => {
  it('rejects an unauthenticated caller (protectedProcedure)', async () => {
    const db = vi.fn();
    const caller = appRouter.createCaller(createTestContext({ user: null, db }));

    await expect(caller.me.updateProfile({ displayName: 'Mobina' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(db).not.toHaveBeenCalled();
  });

  it('rejects a blank or whitespace-only name before reaching the database (zod)', async () => {
    const db = vi.fn();
    const caller = appRouter.createCaller(createTestContext({ user: fakeUser('u1'), db }));

    await expect(caller.me.updateProfile({ displayName: '' })).rejects.toThrow();
    await expect(caller.me.updateProfile({ displayName: '   ' })).rejects.toThrow();
    expect(db).not.toHaveBeenCalled();
  });

  it('rejects a name longer than a member-list row can carry (zod)', async () => {
    const db = vi.fn();
    const caller = appRouter.createCaller(createTestContext({ user: fakeUser('u1'), db }));

    await expect(caller.me.updateProfile({ displayName: 'a'.repeat(41) })).rejects.toThrow();
    expect(db).not.toHaveBeenCalled();
  });

  it('rejects a timezone Intl cannot parse, rather than letting the engine throw later', async () => {
    const db = vi.fn();
    const caller = appRouter.createCaller(createTestContext({ user: fakeUser('u1'), db }));

    await expect(
      caller.me.updateProfile({ displayName: 'Mobina', timezone: 'Mars/Olympus_Mons' }),
    ).rejects.toThrow();
    expect(db).not.toHaveBeenCalled();
  });

  it('rejects an empty patch — a mutation that changes nothing is a caller bug', async () => {
    const db = vi.fn();
    const caller = appRouter.createCaller(createTestContext({ user: fakeUser('u1'), db }));

    await expect(caller.me.updateProfile({})).rejects.toThrow();
    expect(db).not.toHaveBeenCalled();
  });
});
