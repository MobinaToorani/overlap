/**
 * Prior-signal pre-fill (A1 / X-19), the thing that makes the three-week
 * horizon cost about one tap per week instead of twenty-one taps total.
 *
 * The tests that matter here are the ones about what pre-fill refuses to
 * propose. Proposing too much is not a cosmetic bug: every proposed night
 * that survives to submit becomes a `confirmed_free` row, so an over-eager
 * draft manufactures confirmations nobody made — the A2 failure, arriving
 * through the input rather than through calendar sync.
 */
import { describe, expect, it } from 'vitest';
import { buildDraftNights } from '@/server/services/draft';

const WEEK = '2026-09-13'; // a Sunday
const TODAY = '2026-09-13';

function draft(priorNights: { date: string; state: string }[], today = TODAY) {
  return buildDraftNights({
    weekStartDate: WEEK,
    priorNights,
    today,
    horizonWeeks: 3,
  });
}

describe('buildDraftNights', () => {
  it('carries a confirmed night forward on its own date, not as a weekday guess', () => {
    // The prior signal's horizon overlaps this one by 14 days, so for most
    // of the grid we hold the person's actual answer about that exact
    // night. Using it is strictly better than generalising from it.
    const nights = draft([
      { date: '2026-09-17', state: 'confirmed_free' }, // Thursday, in range
    ]);

    const carried = nights.find((n) => n.date === '2026-09-17');
    expect(carried).toBeDefined();
    expect(carried!.source).toBe('carried');
  });

  it('falls back to the weekday pattern for dates no prior signal reached', () => {
    // Two of two Thursdays confirmed. The third week of this horizon was
    // never covered by the prior signal, so Thursday the 1st is proposed
    // from the pattern rather than carried.
    const nights = draft([
      { date: '2026-09-10', state: 'confirmed_free' },
      { date: '2026-09-17', state: 'confirmed_free' },
    ]);

    const projected = nights.find((n) => n.date === '2026-10-01');
    expect(projected).toBeDefined();
    expect(projected!.source).toBe('pattern');
  });

  it('does not treat a single stray night as a pattern', () => {
    // One Tuesday across a two-week span is not a habit. Projecting it
    // forward would put availability on screen the person never implied,
    // and one absent-minded submit turns that into a hard confirmation.
    const nights = draft([
      { date: '2026-09-08', state: 'confirmed_free' }, // Tue — once
      { date: '2026-09-10', state: 'confirmed_free' }, // Thu
      { date: '2026-09-17', state: 'confirmed_free' }, // Thu
    ]);

    // The Thursday habit projects; the lone Tuesday does not.
    expect(nights.some((n) => n.date === '2026-10-01' && n.source === 'pattern')).toBe(true);
    expect(nights.some((n) => n.date === '2026-09-29')).toBe(false); // a Tuesday
  });

  it('never carries a night the person did not confirm', () => {
    // `blocked` was a statement about one specific date, and
    // `no_known_conflict` was never their claim at all. Neither is
    // evidence of anything for a future night.
    const nights = draft([
      { date: '2026-09-17', state: 'blocked' },
      { date: '2026-09-18', state: 'no_known_conflict' },
    ]);

    expect(nights).toEqual([]);
  });

  it('never proposes a night that has already passed', () => {
    // The grid disables past nights, so a proposal on one would render as
    // a selection the person is unable to clear.
    const nights = draft(
      [
        { date: '2026-09-14', state: 'confirmed_free' }, // Monday, now past
        { date: '2026-09-21', state: 'confirmed_free' }, // Monday, still ahead
      ],
      '2026-09-18',
    );

    expect(nights.some((n) => n.date === '2026-09-14')).toBe(false);
    expect(nights.some((n) => n.date === '2026-09-21')).toBe(true);
  });

  it('returns nothing when there is no prior signal to learn from', () => {
    expect(draft([])).toEqual([]);
  });

  it('stays inside the three-week horizon it was asked for', () => {
    // A proposal outside the horizon would be rejected by signal.submit's
    // own range check, so the draft must not offer one.
    const nights = draft([
      { date: '2026-09-10', state: 'confirmed_free' },
      { date: '2026-09-17', state: 'confirmed_free' },
    ]);

    for (const night of nights) {
      expect(night.date >= WEEK).toBe(true);
      expect(night.date <= '2026-10-03').toBe(true); // 21 days from WEEK
    }
  });
});
