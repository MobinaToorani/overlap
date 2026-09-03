import { describe, expect, it } from 'vitest';
import { addDays, dayOfMonth, horizonDates, weekdayName } from '@/server/services/dateUtils';

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
});
