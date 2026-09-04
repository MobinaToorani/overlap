import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayOfMonth,
  dayOfWeek,
  horizonDates,
  horizonWeekFor,
  localDateInTimeZone,
  weekStartFor,
  weekdayName,
} from '@/lib/dateUtils';

describe('dateUtils', () => {
  it('horizonDates is stable regardless of the time-of-day component', () => {
    const morning = new Date('2026-09-03T02:00:00.000Z');
    const evening = new Date('2026-09-03T23:00:00.000Z');
    expect(horizonDates(morning, 21)).toEqual(horizonDates(evening, 21));
  });

  it('addDays never skips or repeats a calendar date across a month boundary', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01'); // 2026 is not a leap year
  });

  it('weekdayName matches a known reference date', () => {
    // 2026-09-03 is a Thursday.
    expect(weekdayName('2026-09-03')).toBe('Thursday');
  });

  it('dayOfMonth reads the day component only', () => {
    expect(dayOfMonth('2026-09-17')).toBe(17);
  });

  it('dayOfWeek uses Sunday=0, matching grp.signal_dow', () => {
    expect(dayOfWeek('2026-09-06')).toBe(0); // a Sunday
    expect(dayOfWeek('2026-09-03')).toBe(4); // a Thursday
  });
});

describe('localDateInTimeZone', () => {
  it('resolves the same instant to different calendar dates either side of the dateline', () => {
    // 03:00 UTC on the 4th is still the 3rd in Toronto (UTC-4) but already
    // midday on the 4th in Tokyo — the whole reason week_start_date has to
    // be computed per user rather than from the server's own clock.
    const instant = new Date('2026-09-04T03:00:00.000Z');
    expect(localDateInTimeZone(instant, 'America/Toronto')).toBe('2026-09-03');
    expect(localDateInTimeZone(instant, 'Asia/Tokyo')).toBe('2026-09-04');
  });
});

describe('weekStartFor', () => {
  it('returns the date itself when it is already a Sunday', () => {
    expect(weekStartFor('2026-09-06')).toBe('2026-09-06');
  });

  it('walks back to the preceding Sunday', () => {
    expect(weekStartFor('2026-09-03')).toBe('2026-08-30'); // Thursday → prior Sunday
    expect(weekStartFor('2026-09-12')).toBe('2026-09-06'); // Saturday → that week's Sunday
  });

  it('crosses a month boundary correctly', () => {
    expect(weekStartFor('2026-09-01')).toBe('2026-08-30');
  });
});

describe('horizonWeekFor', () => {
  it('buckets a signal\'s own three weeks as 0, 1, 2', () => {
    const weekStart = '2026-09-06'; // a Sunday
    expect(horizonWeekFor(weekStart, '2026-09-06')).toBe(0); // same day
    expect(horizonWeekFor(weekStart, '2026-09-12')).toBe(0); // end of week 0
    expect(horizonWeekFor(weekStart, '2026-09-13')).toBe(1); // start of week 1
    expect(horizonWeekFor(weekStart, '2026-09-19')).toBe(1);
    expect(horizonWeekFor(weekStart, '2026-09-20')).toBe(2);
    expect(horizonWeekFor(weekStart, '2026-09-26')).toBe(2); // last night in range
  });

  it('returns out-of-range values for dates outside the three weeks, so callers can reject them', () => {
    const weekStart = '2026-09-06';
    expect(horizonWeekFor(weekStart, '2026-09-27')).toBe(3); // past the horizon
    expect(horizonWeekFor(weekStart, '2026-09-05')).toBe(-1); // before the week started
  });
});
