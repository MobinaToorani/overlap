/**
 * The four mandatory signal-resolution tests, engineering-spec.md §4.0
 * "Required additional tests" (FIX-2), plus a regression test for
 * timestamp-ordering (see the last test in this file).
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

  it('RS-3: a confirmed_free night from a 9-day-old signal is downgraded and excluded from confirmedCount', () => {
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
    // 'lapsed', not 'no_known_conflict': they tapped it, it aged out.
    expect(resolved.get('a')!.get(d)!.state).toBe('lapsed');

    const overlap = computeOverlap({
      groupId: GROUP,
      members: members(['a']),
      resolved,
      signalledUserIds: new Set(['a']),
      today: TODAY,
    });
    const night = overlap.nights.find((n) => n.date === d)!;
    expect(night.confirmedCount).toBe(0); // excluded from scoring either way
    expect(night.lapsedCount).toBe(1);
    expect(night.softCount).toBe(0); // never conflated with "said nothing"
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

  it('orders signals by instant, not by string — a "-04:00" timestamp still beats an earlier "Z" one', () => {
    // Both signals cover the same date. The one written with an offset is
    // genuinely 2 hours LATER in real time, but sorts EARLIER as a plain
    // string ('...T08:00:00-04:00' < '...T10:00:00.000Z'), so a
    // lexicographic comparison silently picks the wrong winner for Rule B.
    // Every fixture elsewhere in this file uses toISOString() output, which
    // is uniformly 'Z' — that uniformity is exactly why this class of bug
    // survives an otherwise-passing suite.
    const date = dateAt(2);
    const earlierInstantZ = makeSignal({
      userId: 'a',
      groupId: null,
      weekStartDate: dateAt(-7),
      vibe: 'slammed',
      submittedAt: '2026-09-03T10:00:00.000Z', // 10:00Z
      nights: [{ date, state: 'blocked', horizonWeek: 1 }],
    });
    const laterInstantWithOffset = makeSignal({
      userId: 'a',
      groupId: null,
      weekStartDate: dateAt(0),
      vibe: 'down_for_anything',
      submittedAt: '2026-09-03T08:00:00-04:00', // 12:00Z — later than the above
      nights: [{ date, state: 'confirmed_free', horizonWeek: 0 }],
    });

    const resolved = resolveSignals({
      signals: [earlierInstantZ, laterInstantWithOffset],
      groupId: GROUP,
      now: new Date('2026-09-03T13:00:00.000Z'), // within the freshness window of both
    });

    expect(resolved.get('a')!.get(date)).toMatchObject({
      state: 'confirmed_free', // the genuinely-more-recent signal wins
      vibe: 'down_for_anything',
    });
  });
});

describe('freshness decay across the whole horizon', () => {
  it('RS-5: an abandoned signal stops asserting hard confirmations in every week, not just week 0', () => {
    // The scenario that motivated the rule change: someone signals, taps
    // nights across all three weeks, then never signals again. Two weeks
    // later none of it should still read as a friend saying yes (A2), and
    // they should have faded from the headline (master doc §2.3d).
    const signal = makeSignal({
      userId: 'a',
      groupId: null,
      weekStartDate: '2026-09-06',
      vibe: 'down_for_anything',
      submittedAt: '2026-09-06T19:00:00.000Z',
      nights: [
        { date: '2026-09-10', state: 'confirmed_free', horizonWeek: 0 },
        { date: '2026-09-17', state: 'confirmed_free', horizonWeek: 1 },
        { date: '2026-09-24', state: 'confirmed_free', horizonWeek: 2 },
      ],
    });

    const now = new Date('2026-09-20T12:00:00.000Z'); // 14 days later
    const resolved = resolveSignals({ signals: [signal], groupId: GROUP, now });

    for (const date of ['2026-09-10', '2026-09-17', '2026-09-24']) {
      expect(resolved.get('a')!.get(date)!.state).toBe('lapsed');
    }

    const overlap = computeOverlap({
      groupId: GROUP,
      members: members(['a']),
      resolved,
      signalledUserIds: new Set(), // hasn't signalled this week
      today: now,
    });
    const night = overlap.nights.find((n) => n.date === '2026-09-24')!;
    expect(night.confirmedCount).toBe(0); // faded out of the count
    expect(night.lapsedCount).toBe(1); // still visible, and still honest about having said yes
    expect(overlap.headline).toBeNull();
  });

  it('a signal still inside the freshness window keeps its later weeks confirmed', () => {
    // The other side of the rule: freshly tapped week-1 and week-2 nights
    // are real confirmations and must still score, or the Signal's
    // three-week horizon would be pointless.
    const signal = makeSignal({
      userId: 'a',
      groupId: null,
      weekStartDate: '2026-09-06',
      vibe: 'down_for_anything',
      submittedAt: '2026-09-06T19:00:00.000Z',
      nights: [{ date: '2026-09-24', state: 'confirmed_free', horizonWeek: 2 }],
    });

    const now = new Date('2026-09-09T12:00:00.000Z'); // 3 days later
    const resolved = resolveSignals({ signals: [signal], groupId: GROUP, now });
    expect(resolved.get('a')!.get('2026-09-24')!.state).toBe('confirmed_free');
  });
});
