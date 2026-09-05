/**
 * buildDraftNights() — prior-signal pre-fill for the Signal grid.
 *
 * Audit finding A1 moved the Signal to a rolling three-week horizon, and
 * that correction only survives if weeks two and three cost about one tap
 * each. Twenty-one individually-tapped nights is not a ten-second ritual,
 * and the ten-second budget *is* the retention mechanic (master doc §2.3b) —
 * so pre-fill is not a convenience here, it is what makes A1 affordable.
 * Coherence audit X-19 moved it into T6 for exactly that reason: a Sprint 2
 * exit criterion cannot depend on a Sprint 3 ticket.
 *
 * Two sources, in strict precedence:
 *
 *   carried — the prior signal covered this exact date. Its horizon
 *   overlaps this one by up to fourteen days, so for most of the grid we
 *   already have the person's own answer about that specific night. Reusing
 *   it is strictly better than generalising: it is what they actually said.
 *
 *   pattern — the date is new (typically the third week, which no prior
 *   signal reached). Fall back to the weekday: someone who confirmed two of
 *   the last Thursdays is offered Thursday.
 *
 * What this is NOT: an assertion. A draft night is a suggestion rendered in
 * the UI and persisted nowhere — X-5 settled that pre-fill is a read path.
 * It becomes `confirmed_free` only when a human presses submit, which is
 * the affirmative act INV-1 and A2 require. The client renders carried and
 * pattern nights visibly differently from nights tapped in this session, so
 * the person can see what is being proposed on their behalf before they
 * agree to it.
 */
import { DAYS_PER_WEEK, type DraftNight, type DraftSource } from '@overlap/shared';
import { addDays, dayOfWeek } from '@/lib/dateUtils';

/** A night from some earlier signal, as far as pre-fill cares about it. */
export interface PriorNight {
  date: string;
  state: string;
}

export function buildDraftNights(input: {
  /** The three-week horizon this draft is for — the server's week anchor. */
  weekStartDate: string;
  /** Confirmed nights from the most recent usable prior signal. */
  priorNights: PriorNight[];
  /** Today in the user's own timezone. Past nights are never proposed. */
  today: string;
  /** How many horizon weeks the grid shows. */
  horizonWeeks: number;
}): DraftNight[] {
  const { weekStartDate, priorNights, today, horizonWeeks } = input;

  // Only confirmations carry forward. A `blocked` night was a statement
  // about one specific date — proposing it again as a *conflict* on a
  // different date would invent a constraint the person never described,
  // and `no_known_conflict` was never their claim to begin with.
  const confirmed = priorNights.filter((n) => n.state === 'confirmed_free');
  if (confirmed.length === 0) return [];

  const byDate = new Set(confirmed.map((n) => n.date));

  // Weekday frequency, for dates no prior signal ever covered. A weekday is
  // only proposed if it was confirmed more often than not among the weeks
  // the prior signal actually spanned — one stray Tuesday is not a pattern.
  const weeksSpanned = new Set(confirmed.map((n) => weekIndexOf(n.date, confirmed))).size || 1;
  const perWeekday = new Map<number, number>();
  for (const night of confirmed) {
    const dow = dayOfWeek(night.date);
    perWeekday.set(dow, (perWeekday.get(dow) ?? 0) + 1);
  }
  const patternWeekdays = new Set<number>();
  for (const [dow, count] of perWeekday) {
    if (count * 2 > weeksSpanned) patternWeekdays.add(dow);
  }

  const draft: DraftNight[] = [];
  for (let i = 0; i < horizonWeeks * DAYS_PER_WEEK; i += 1) {
    const date = addDays(weekStartDate, i);

    // A night that has already passed can't be agreed to, and the grid
    // disables it anyway. Proposing it would put a selection on screen the
    // person cannot clear.
    if (date < today) continue;

    let source: DraftSource | null = null;
    if (byDate.has(date)) source = 'carried';
    else if (patternWeekdays.has(dayOfWeek(date))) source = 'pattern';
    if (source) draft.push({ date, source });
  }

  return draft;
}

/** Which seven-day block of the prior signal a date fell in, used only to
 * count how many weeks that signal actually spanned. */
function weekIndexOf(date: string, all: PriorNight[]): number {
  let earliest = all[0]?.date ?? date;
  for (const n of all) if (n.date < earliest) earliest = n.date;
  return Math.floor(daysBetween(earliest, date) / DAYS_PER_WEEK);
}

function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}
