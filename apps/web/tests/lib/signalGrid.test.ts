import { describe, expect, it } from 'vitest';
import { buildWeeks, countWeeksTouched } from '@/lib/signalGrid';
import { horizonWeekFor } from '@/lib/dateUtils';

const WEEK_START = '2026-09-06'; // a Sunday

describe('buildWeeks', () => {
  it('produces three rows of seven consecutive dates starting at the week start', () => {
    const weeks = buildWeeks(WEEK_START);

    expect(weeks).toHaveLength(3);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0]![0]).toBe(WEEK_START);
    expect(weeks[2]![6]).toBe('2026-09-26'); // 20 days after the start

    const flat = weeks.flat();
    expect(new Set(flat).size).toBe(21); // no duplicates, no gaps
  });

  it('agrees with the server\'s horizonWeekFor for every date it offers', () => {
    // The grid must only ever offer dates signal.submit accepts. If these
    // two ever disagree, a user taps a night and the submission is rejected
    // as "outside the three-week horizon" — so pin the agreement down here
    // rather than discovering it from a failed submit.
    buildWeeks(WEEK_START).forEach((week, weekIndex) => {
      for (const date of week) {
        expect(horizonWeekFor(WEEK_START, date)).toBe(weekIndex);
      }
    });
  });
});

describe('countWeeksTouched', () => {
  it('counts distinct weeks, not nights', () => {
    const weeks = buildWeeks(WEEK_START);
    const twoNightsSameWeek = new Set([weeks[0]![1]!, weeks[0]![3]!]);
    expect(countWeeksTouched(WEEK_START, twoNightsSameWeek)).toBe(1);

    const spanningAll = new Set([weeks[0]![0]!, weeks[1]![2]!, weeks[2]![6]!]);
    expect(countWeeksTouched(WEEK_START, spanningAll)).toBe(3);
  });

  it('is zero for no selection, and ignores dates outside the horizon', () => {
    expect(countWeeksTouched(WEEK_START, new Set())).toBe(0);
    expect(countWeeksTouched(WEEK_START, new Set(['2026-10-15']))).toBe(0);
  });

  it('is zero when the week anchor has not loaded yet', () => {
    expect(countWeeksTouched(undefined, new Set(['2026-09-07']))).toBe(0);
  });
});
