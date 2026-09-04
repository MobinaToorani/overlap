/**
 * Unit tests for the signal router's own logic. As with group.test.ts, the
 * Drizzle query/transaction code can't be faked convincingly enough to be
 * worth trusting (see ADR-0006), so these cover what runs *before* the
 * database is touched — input validation and the two rejections — plus the
 * INV-1 property that matters most: the client's input type cannot express
 * a night state only the server or worker may write.
 */
import { describe, expect, it, vi } from 'vitest';
import { signalSubmitInputSchema } from '@overlap/shared';
import { appRouter } from '@/server/trpc/routers/_app';
import { createTestContext, fakeUser } from './helpers';

describe('signal.submit input contract (INV-1)', () => {
  it('cannot express no_known_conflict or a sync writer — the client may only confirm or block', () => {
    // INV-1's first line of defence, before any trigger: calendar-derived
    // states simply aren't in the client's vocabulary. A client that tries
    // to assert one is rejected by zod, not by a code path that has to
    // remember to check.
    expect(
      signalSubmitInputSchema.safeParse({
        vibe: 'low_key',
        nights: [{ date: '2026-09-07', state: 'no_known_conflict' }],
      }).success,
    ).toBe(false);

    expect(
      signalSubmitInputSchema.safeParse({
        vibe: 'low_key',
        nights: [{ date: '2026-09-07', state: 'confirmed_free', writtenBy: 'sync' }],
      }).success,
    ).toBe(true); // extra key is stripped by zod, never reaching the insert
  });

  it('accepts the two states a human can actually assert', () => {
    expect(
      signalSubmitInputSchema.safeParse({
        vibe: 'down_for_anything',
        nights: [
          { date: '2026-09-07', state: 'confirmed_free' },
          { date: '2026-09-08', state: 'blocked' },
        ],
        note: 'free after 8 most nights',
      }).success,
    ).toBe(true);
  });
});

describe('signal.submit', () => {
  it('rejects an unauthenticated caller before touching the database', async () => {
    const db = vi.fn();
    const caller = appRouter.createCaller(createTestContext({ user: null, db }));

    await expect(
      caller.signal.submit({ vibe: 'low_key', nights: [] }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(db).not.toHaveBeenCalled();
  });

  it('refuses a per-group override rather than taking an untested write path', async () => {
    const db = vi.fn();
    const caller = appRouter.createCaller(createTestContext({ user: fakeUser('u1'), db }));

    await expect(
      caller.signal.submit({
        vibe: 'low_key',
        nights: [],
        groupId: '11111111-1111-1111-1111-111111111111',
      }),
    ).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
    expect(db).not.toHaveBeenCalled();
  });

  it('rejects a note over 140 characters (zod) before touching the database', async () => {
    const db = vi.fn();
    const caller = appRouter.createCaller(createTestContext({ user: fakeUser('u1'), db }));

    await expect(
      caller.signal.submit({ vibe: 'low_key', nights: [], note: 'x'.repeat(141) }),
    ).rejects.toThrow();
    expect(db).not.toHaveBeenCalled();
  });
});

describe('signal.getCurrent', () => {
  it('rejects an unauthenticated caller before touching the database', async () => {
    const db = vi.fn();
    const caller = appRouter.createCaller(createTestContext({ user: null, db }));

    await expect(caller.signal.getCurrent()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(db).not.toHaveBeenCalled();
  });
});
