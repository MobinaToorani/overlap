/**
 * Calendar-date helpers for the overlap engine.
 *
 * Every function here treats an ISO date string (YYYY-MM-DD) as an opaque
 * calendar day and does all arithmetic in UTC — never via `new Date(str)`
 * plus local getDate()/getDay(), which silently shifts by a day depending
 * on the host's timezone and would fail OV-7 (DST boundary: 21 distinct
 * dates, no duplicate, no gap) and OV-8 (bucketing must not depend on which
 * timezone the *server* happens to run in). A signal_night.date is already
 * a date, decided once when the user tapped it — this module must not
 * reinterpret it through any timezone.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toUtcMidnight(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function parseIsoDate(date: string): number {
  const parts = date.split('-');
  // Number(undefined) is NaN, which propagates loudly into an Invalid Date
  // rather than needing a non-null assertion — callers are expected to pass
  // a well-formed YYYY-MM-DD string (see module doc comment).
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  return Date.UTC(y, m - 1, d);
}

function formatIsoDate(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** The N sequential calendar dates starting at `today`, inclusive. */
export function horizonDates(today: Date, length: number): string[] {
  const start = toUtcMidnight(today);
  return Array.from({ length }, (_, i) => formatIsoDate(start + i * MS_PER_DAY));
}

export function addDays(date: string, days: number): string {
  return formatIsoDate(parseIsoDate(date) + days * MS_PER_DAY);
}

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export function weekdayName(date: string): string {
  const dayIndex = Math.floor(parseIsoDate(date) / MS_PER_DAY) % 7;
  // JS epoch (1970-01-01) was a Thursday (index 4); rebase to Sunday=0.
  const idx = ((dayIndex + 4) % 7 + 7) % 7;
  return WEEKDAYS[idx]!; // idx is always 0-6 by construction above
}

export function dayOfMonth(date: string): number {
  return new Date(parseIsoDate(date)).getUTCDate();
}
