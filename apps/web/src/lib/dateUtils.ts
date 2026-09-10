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

/** 0 = Sunday … 6 = Saturday, matching grp.signal_dow's convention. */
export function dayOfWeek(date: string): number {
  const dayIndex = Math.floor(parseIsoDate(date) / MS_PER_DAY) % 7;
  // JS epoch (1970-01-01) was a Thursday (index 4); rebase to Sunday=0.
  return ((dayIndex + 4) % 7 + 7) % 7;
}

export function weekdayName(date: string): string {
  return WEEKDAYS[dayOfWeek(date)]!; // dayOfWeek is always 0-6 by construction
}

export function dayOfMonth(date: string): number {
  return new Date(parseIsoDate(date)).getUTCDate();
}

/**
 * What calendar date it currently is for someone in `timeZone`.
 *
 * This is the one function here that legitimately involves a timezone, and
 * it isn't a contradiction of the module rule above: that rule forbids
 * *reinterpreting an existing date string* through a timezone. This does
 * the opposite and necessary thing — turns an instant into the calendar
 * date a specific human is living in, which is the only correct way to
 * answer "which week is this user signalling for". 'en-CA' is used purely
 * because it formats as YYYY-MM-DD.
 */
export function localDateInTimeZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/**
 * The Sunday on or before `date` — a signal's `week_start_date`.
 * Sunday because grp.signal_dow defaults to 0 (engineering-spec.md §3) and
 * the ritual is the *Sunday* Signal.
 */
export function weekStartFor(date: string): string {
  return addDays(date, -dayOfWeek(date));
}

/**
 * Which week of a signal's own three-week span a night falls in — 0 is the
 * week the signal was submitted for, 1 and 2 are the two ahead.
 *
 * Note this is a different quantity from NightOverlap.horizonWeek, which is
 * weeks-from-today in the *viewer's* rolling window. Both are called
 * "horizon week" and both are correct in their own frame: this one is what
 * signal_night.horizon_week stores, and it's what makes resolveSignals'
 * freshness rule meaningful ("a week-0 night from a signal submitted more
 * than 7 days ago is stale") — that rule is about the signal's own week,
 * not the viewer's.
 */
export function horizonWeekFor(weekStartDate: string, nightDate: string): number {
  const days = (parseIsoDate(nightDate) - parseIsoDate(weekStartDate)) / MS_PER_DAY;
  return Math.floor(days / 7);
}

/**
 * The browser's own IANA zone, or null where the runtime won't say.
 *
 * Used by T25's first-run step to set `app_user.timezone` from something
 * true rather than leaving everyone on the schema's `America/Toronto`
 * default. Null (rather than a guess) when unavailable: the column already
 * has a default, and inventing a zone for someone would put their Signal
 * week — and eventually their Sunday dispatch — in the wrong place.
 */
export function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}
