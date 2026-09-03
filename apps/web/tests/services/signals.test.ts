/**
 * The four mandatory signal-resolution tests, engineering-spec.md §4.0
 * "Required additional tests" (FIX-2).
 */
import { describe, expect, it } from 'vitest';
import { computeOverlap } from '@/server/services/overlap';
import { resolveSignals } from '@/server/services/signals';
import { dateAt, isoDaysAgo, makeSignal, members, TODAY } from '../helpers';

const GROUP = 'g1';

describe('resolveSignals', () => {
  it('RS-1: group-scoped signal wins over global for the same week; global is ignored entirely', () => {
    const week = dateAt(0);
    const d1 = dateAt(2);
    const d2 = dateAt(3);

    const global = makeSignal({
      userId: 'a',
      groupId: null,
      weekStartDate: week,
      vibe: 'slammed',
      // Submitted LATER than the scoped signal, to prove precedence is by
      // group-scoping, not by recency.
      submittedAt: isoDaysAgo(0),
      nights: [{ date: d1, state: 'confirmed_free', horizonWeek: 0 }],
    });
    const scoped = makeSignal({
      userId: 'a',
      groupId: GROUP,
      weekStartDate: week,
      vibe: 'down_for_anything',
      submittedAt: isoDaysAgo(1),
      nights: [{ date: d2, state: 'confirmed_free', horizonWeek: 0 }],
    });

    const resolved = resolveSignals({ signals: [global, scoped], groupId: GROUP, now: TODAY });
    const nights = resolved.get('a')!;

    expect(nights.has(d2)).toBe(true); // scoped signal's night is present
    expect(nights.has(d1)).toBe(false); // global signal's night never appears at all
    expect(nights.get(d2)!.vibe).toBe('down_for_anything'); // scoped vibe, not global
  });

  it('RS-2: two overlapping-horizon signals covering the same date → most recent submittedAt wins, one night per date', () => {
    const older = makeSignal({
      userId: 'a',
      groupId: null,
      weekStartDate: dateAt(-7),
      vibe: 'low_key',
      submittedAt: isoDaysAgo(10),
      nights: [{ date: dateAt(2), state: 'blocked', horizonWeek: 1 }],
    });
    const newer = makeSignal({
      userId: 'a',
      groupId: null,
      weekStartDate: dateAt(0),
      vibe: 'down_for_anything',
      submittedAt: isoDaysAgo(0),
      nights: [{ date: dateAt(2), state: 'confirmed_free', horizonWeek: 0 }],
    });

    const resolved = resolveSignals({ signals: [older, newer], groupId: GROUP, now: TODAY });
    const nights = resolved.get('a')!;

    expect(nights.size).toBe(1); // exactly one night for this date, not two
    expect(nights.get(dateAt(2))!.state).toBe('confirmed_free'); // the newer submission won
  });

  it('RS-3: week-0 confirmed_free from a 9-day-old signal is downgraded and excluded from confirmedCount', () => {
    const d = dateAt(1);
    const signal = makeSignal({
      userId: 'a',
      groupId: null,
      weekStartDate: dateAt(0),
      vibe: 'low_key',
      submittedAt: isoDaysAgo(9),
      nights: [{ date: d, state: 'confirmed_free', horizonWeek: 0 }],
    });

    const resolved = resolveSignals({ signals: [signal], groupId: GROUP, now: TODAY });
    expect(resolved.get('a')!.get(d)!.state).toBe('no_known_conflict'); // downgraded

    const overlap = computeOverlap({
      groupId: GROUP,
      members: members(['a']),
      resolved,
      signalledUserIds: new Set(['a']),
      today: TODAY,
    });
    const night = overlap.nights.find((n) => n.date === d)!;
    expect(night.confirmedCount).toBe(0);
    expect(night.softCount).toBe(1);
  });

  it('RS-4: a user with no signal at all contributes to memberCount but not confirmed/soft counts', () => {
    const d = dateAt(1);
    const signalled = makeSignal({
      userId: 'a',
      groupId: null,
      weekStartDate: dateAt(0),
      vibe: 'low_key',
      submittedAt: isoDaysAgo(0),
      nights: [{ date: d, state: 'confirmed_free', horizonWeek: 0 }],
    });

    // 'b' never submitted anything — resolveSignals only ever sees 'a'.
    const resolved = resolveSignals({ signals: [signalled], groupId: GROUP, now: TODAY });
    expect(resolved.has('b')).toBe(false);

    const overlap = computeOverlap({
      groupId: GROUP,
      members: members(['a', 'b']),
      resolved,
      signalledUserIds: new Set(['a']),
      today: TODAY,
    });
    const night = overlap.nights.find((n) => n.date === d)!;
    expect(night.totalMembers).toBe(2); // 'b' still counted as a member
    expect(night.confirmedCount).toBe(1); // but contributes nothing to confirmed/soft
    expect(night.softCount).toBe(0);
  });
});
