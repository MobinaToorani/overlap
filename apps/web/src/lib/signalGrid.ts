import { addDays } from './dateUtils';

export const HORIZON_WEEKS = 3; // this week + the two ahead (master doc §2.2, Rule 1)
export const DAYS_PER_WEEK = 7;

/**
 * The three week-aligned rows of seven dates the Signal grid offers,
 * anchored to the server's week_start_date so the grid can only ever offer
 * dates signal.submit will accept.
 *
 * Extracted from the page component so the week alignment is actually
 * testable — an off-by-one here would silently offer a date outside the
 * horizon (rejected on submit) or hide a valid one, and neither would be
 * obvious by looking at the grid.
 */
export function buildWeeks(weekStartDate: string): string[][] {
  return Array.from({ length: HORIZON_WEEKS }, (_, week) =>
    Array.from({ length: DAYS_PER_WEEK }, (_, day) =>
      addDays(weekStartDate, week * DAYS_PER_WEEK + day),
    ),
  );
}

/** engineering-spec.md §11's `horizon_weeks_touched`: how many of the three
 * weeks got at least one tap. */
export function countWeeksTouched(
  weekStartDate: string | undefined,
  selected: ReadonlySet<string>,
): number {
  if (!weekStartDate) return 0;
  const weeks = buildWeeks(weekStartDate);
  const touched = new Set<number>();
  for (const date of selected) {
    const index = weeks.findIndex((week) => week.includes(date));
    if (index >= 0) touched.add(index);
  }
  return touched.size;
}
