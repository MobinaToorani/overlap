/**
 * The ten mandatory overlap-engine tests, engineering-spec.md §4 "Required
 * unit tests". OV-1..OV-5 and OV-9..OV-10 exercise computeOverlap()
 * directly (OV-9 also drives it through resolveSignals(), since the
 * behaviour it's checking — the week-0 freshness downgrade — lives there).
 * OV-6 needs a live Postgres with the guard_confirmed_free trigger
 * installed; see the skipped test below for why it can't run here.
 */
import { describe, expect, it } from 'vitest';
import type { ResolvedSignalMap, Vibe } from '@overlap/shared';
import { computeOverlap } from '@/server/services/overlap';
import { resolveSignals } from '@/server/services/signals';
import { dateAt, makeSignal, member, members, resolvedMapFrom, TODAY } from '../helpers';

describe('computeOverlap', () => {
  it('OV-1: all members confirmed free on one night → that night is best, confirmedCount = memberCount', () => {
    const d = dateAt(3);
    const result = computeOverlap({
      groupId: 'g1',
      members: members(['a', 'b', 'c']),
      resolved: resolvedMapFrom({
        a: { [d]: { state: 'confirmed_free', vibe: 'low_key' } },
        b: { [d]: { state: 'confirmed_free', vibe: 'low_key' } },
        c: { [d]: { state: 'confirmed_free', vibe: 'low_key' } },
      }),
      signalledUserIds: new Set(['a', 'b', 'c']),
      today: TODAY,
    });

    const night = result.nights.find((n) => n.date === d)!;
    expect(night.confirmedCount).toBe(3);
    expect(night.isBestNight).toBe(true);
    expect(result.nights.filter((n) => n.isBestNight)).toHaveLength(1);
  });

  it('OV-2: all soft, none confirmed → confirmedCount = 0 everywhere, no headline, no night is best', () => {
    const d = dateAt(2);
    const result = computeOverlap({
      groupId: 'g1',
      members: members(['a', 'b']),
      resolved: resolvedMapFrom({
        a: { [d]: { state: 'no_known_conflict', vibe: 'low_key' } },
        b: { [d]: { state: 'no_known_conflict', vibe: 'low_key' } },
      }),
      signalledUserIds: new Set(['a', 'b']),
      today: TODAY,
    });

    expect(result.nights.every((n) => n.confirmedCount === 0)).toBe(true);
    expect(result.headline).toBeNull();
    expect(result.nights.some((n) => n.isBestNight)).toBe(false);
  });

  it('OV-3: 4 confirmed, one is broke → vibeCounts is null (cohort < 5)', () => {
    const d = dateAt(1);
    const result = computeOverlap({
      groupId: 'g1',
      members: members(['a', 'b', 'c', 'd']),
      resolved: resolvedMapFrom({
        a: { [d]: { state: 'confirmed_free', vibe: 'down_for_anything' } },
        b: { [d]: { state: 'confirmed_free', vibe: 'low_key' } },
        c: { [d]: { state: 'confirmed_free', vibe: 'low_key' } },
        d: { [d]: { state: 'confirmed_free', vibe: 'broke' } },
      }),
      signalledUserIds: new Set(['a', 'b', 'c', 'd']),
      today: TODAY,
    });

    const night = result.nights.find((n) => n.date === d)!;
    expect(night.confirmedCount).toBe(4);
    expect(night.vibeCounts).toBeNull();
  });

  it('OV-4: 6 confirmed, two are broke → vibeCounts present, "broke" key absent', () => {
    const d = dateAt(1);
    const result = computeOverlap({
      groupId: 'g1',
      members: members(['a', 'b', 'c', 'd', 'e', 'f']),
      resolved: resolvedMapFrom({
        a: { [d]: { state: 'confirmed_free', vibe: 'down_for_anything' } },
        b: { [d]: { state: 'confirmed_free', vibe: 'down_for_anything' } },
        c: { [d]: { state: 'confirmed_free', vibe: 'low_key' } },
        d: { [d]: { state: 'confirmed_free', vibe: 'low_key' } },
        e: { [d]: { state: 'confirmed_free', vibe: 'broke' } },
        f: { [d]: { state: 'confirmed_free', vibe: 'broke' } },
      }),
      signalledUserIds: new Set(['a', 'b', 'c', 'd', 'e', 'f']),
      today: TODAY,
    });

    const night = result.nights.find((n) => n.date === d)!;
    expect(night.confirmedCount).toBe(6);
    expect(night.vibeCounts).not.toBeNull();
    expect(night.vibeCounts).not.toHaveProperty('broke');
    expect(Object.keys(night.vibeCounts!)).not.toContain('broke');
    expect(night.vibeCounts!.down_for_anything).toBe(2);
    expect(night.vibeCounts!.low_key).toBe(2);
  });

  it('OV-5: single-member group → no headline, isLive = false', () => {
    const d = dateAt(0);
    const result = computeOverlap({
      groupId: 'g1',
      members: members(['a']),
      resolved: resolvedMapFrom({
        a: { [d]: { state: 'confirmed_free', vibe: 'low_key' } },
      }),
      signalledUserIds: new Set(['a']),
      today: TODAY,
    });

    expect(result.headline).toBeNull();
    expect(result.isLive).toBe(false);
  });

  // OV-6: "Sync attempts confirmed_free → DB throws; assert the exception."
  // computeOverlap() is a pure function with no database access — INV-1's
  // real enforcement is the guard_confirmed_free / guard_worker_role
  // triggers in src/server/db/sql/0001_guard_invariants.sql, which only
  // exist once a migration has run against a live Postgres. Per the
  // working agreement ("if you cannot test it, say so rather than claiming
  // it is handled"): this needs an integration test with a real database
  // (e.g. testcontainers, or the CI Postgres service) attempting an INSERT
  // with written_by='sync', state='confirmed_free' and asserting Postgres
  // raises. Not implemented yet — flagging rather than faking it.
  it.todo('OV-6: sync attempting confirmed_free throws (needs a live Postgres integration test)');

  it('OV-7: DST spring-forward boundary in horizon → 21 distinct dates, no duplicate, no gap', () => {
    // 2026-03-08 is the US spring-forward date; a horizon starting a week
    // earlier spans it.
    const dstAdjacentToday = new Date('2026-03-01T12:00:00.000Z');
    const result = computeOverlap({
      groupId: 'g1',
      members: members(['a']),
      resolved: resolvedMapFrom({}),
      signalledUserIds: new Set(),
      today: dstAdjacentToday,
    });

    const dates = result.nights.map((n) => n.date);
    expect(dates).toHaveLength(21);
    expect(new Set(dates).size).toBe(21); // no duplicate
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i - 1]! + 'T00:00:00Z').getTime();
      const curr = new Date(dates[i]! + 'T00:00:00Z').getTime();
      expect(curr - prev).toBe(24 * 60 * 60 * 1000); // no gap, no overlap
    }
  });

  it('OV-8: members in different timezones bucket onto the same calendar-date night', () => {
    const d = dateAt(5);
    const result = computeOverlap({
      groupId: 'g1',
      members: [member('a', 'Pacific/Auckland'), member('b', 'America/Vancouver')],
      resolved: resolvedMapFrom({
        a: { [d]: { state: 'confirmed_free', vibe: 'low_key' } },
        b: { [d]: { state: 'confirmed_free', vibe: 'low_key' } },
      }),
      signalledUserIds: new Set(['a', 'b']),
      today: TODAY,
    });

    const night = result.nights.find((n) => n.date === d)!;
    expect(night.confirmedCount).toBe(2); // bucketed together, not split by timezone
  });

  it('OV-9: expired week-0 signal, weeks 1-2 present → week 0 excluded, nothing renders confirmed', () => {
    const groupId = 'g1';
    const nineDaysAgo = new Date(TODAY.getTime() - 9 * 24 * 60 * 60 * 1000).toISOString();
    const week0Date = dateAt(1);
    const week1Date = dateAt(9);
    const week2Date = dateAt(16);

    const signal = makeSignal({
      userId: 'a',
      groupId: null,
      weekStartDate: dateAt(0),
      vibe: 'low_key',
      submittedAt: nineDaysAgo,
      nights: [
        { date: week0Date, state: 'confirmed_free', horizonWeek: 0 },
        { date: week1Date, state: 'no_known_conflict', horizonWeek: 1 },
        { date: week2Date, state: 'no_known_conflict', horizonWeek: 2 },
      ],
    });

    const resolved = resolveSignals({ signals: [signal], groupId, now: TODAY });
    const result = computeOverlap({
      groupId,
      members: members(['a']),
      resolved,
      signalledUserIds: new Set(['a']),
      today: TODAY,
    });

    for (const date of [week0Date, week1Date, week2Date]) {
      const night = result.nights.find((n) => n.date === date)!;
      expect(night.confirmedCount).toBe(0);
      expect(night.softCount).toBe(1);
    }
  });

  it('OV-10: a tie between two nights is broken by the earlier date', () => {
    const earlier = dateAt(2);
    const later = dateAt(4);
    const result = computeOverlap({
      groupId: 'g1',
      members: members(['a', 'b']),
      resolved: resolvedMapFrom({
        a: {
          [earlier]: { state: 'confirmed_free', vibe: 'low_key' },
          [later]: { state: 'confirmed_free', vibe: 'low_key' },
        },
        b: {
          [earlier]: { state: 'confirmed_free', vibe: 'low_key' },
          [later]: { state: 'confirmed_free', vibe: 'low_key' },
        },
      }),
      signalledUserIds: new Set(['a', 'b']),
      today: TODAY,
    });

    const best = result.nights.filter((n) => n.isBestNight);
    expect(best).toHaveLength(1);
    expect(best[0]!.date).toBe(earlier);
  });
});

/**
 * The headline is the single most user-visible string the engine produces —
 * the payoff that ends the ritual (master doc §2.3c). Its exact wording was
 * decided deliberately (ordinal day; a per-band clause so "mixed" isn't
 * forced through "The group is leaning ___"), so it's pinned here rather
 * than left to drift.
 */
describe('computeOverlap headline wording', () => {
  const SEPT_15 = new Date('2026-09-15T12:00:00.000Z');
  const THURSDAY_17TH = '2026-09-17';

  function headlineFor(vibes: Vibe[], memberCount = 7) {
    const resolved: ResolvedSignalMap = new Map();
    vibes.forEach((vibe, i) => {
      resolved.set(
        `u${i}`,
        new Map([[THURSDAY_17TH, { state: 'confirmed_free' as const, vibe }]]),
      );
    });
    const groupMembers = Array.from({ length: memberCount }, (_, i) => ({
      userId: `u${i}`,
      displayName: `u${i}`,
      timezone: 'America/Toronto',
    }));
    return computeOverlap({
      groupId: 'g1',
      members: groupMembers,
      resolved,
      signalledUserIds: new Set(vibes.map((_, i) => `u${i}`)),
      today: SEPT_15,
    }).headline;
  }

  it('gets the ordinal right for a 1st, not "the 1th"', () => {
    // 2026-09-01 is a Tuesday.
    const resolved: ResolvedSignalMap = new Map([
      [
        'a',
        new Map([['2026-09-01', { state: 'confirmed_free' as const, vibe: 'low_key' as const }]]),
      ],
      [
        'b',
        new Map([['2026-09-01', { state: 'confirmed_free' as const, vibe: 'low_key' as const }]]),
      ],
    ]);
    const result = computeOverlap({
      groupId: 'g1',
      members: members(['a', 'b']),
      resolved,
      signalledUserIds: new Set(['a', 'b']),
      today: new Date('2026-08-30T12:00:00.000Z'),
    });
    expect(result.headline).toContain('Tuesday the 1st');
  });

  it('reads naturally for each band, including mixed', () => {
    expect(headlineFor(['down_for_anything', 'down_for_anything'])).toBe(
      'Thursday the 17th — 2 of 7 free. The group is leaning expansive.',
    );
    expect(headlineFor(['low_key', 'slammed'])).toBe(
      'Thursday the 17th — 2 of 7 free. The group is leaning low-key.',
    );
    expect(headlineFor(['down_for_anything', 'low_key'])).toBe(
      'Thursday the 17th — 2 of 7 free. The vibe is split.',
    );
  });

  it('omits the band clause entirely when every confirmed member is broke (INV-4)', () => {
    // 'broke' can't produce a band, so the headline falls back to the plain
    // template — and says nothing that could reveal who is broke.
    expect(headlineFor(['broke', 'broke'])).toBe('Thursday the 17th — 2 of 7 free');
  });
});
