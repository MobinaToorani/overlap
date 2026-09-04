/** --heat-0 … --heat-5 in engineering-spec.md §8. */
export const MAX_HEAT_STEP = 5;

/**
 * Confirmed count → heat step, by absolute count rather than as a fraction
 * of the group.
 *
 * The spec says only "darker = more people confirmed free" and stops
 * there, so this is a decision: 5+ confirmed saturates regardless of group
 * size. Absolute matches how the product talks everywhere else ("5 of 7
 * free"), and 5 is already the number the privacy floor uses (INV-3). The
 * tradeoff is that a twelve-person group saturates sooner than a
 * proportional scale would — worth revisiting once real groups exist and
 * there is something to look at.
 *
 * Extracted from the component so the clamp is actually tested: a step
 * outside 0-5 would reference a `--heat-N` custom property that doesn't
 * exist, and the cell would silently render with no background at all.
 */
export function heatStep(confirmedCount: number): number {
  if (!Number.isFinite(confirmedCount) || confirmedCount <= 0) return 0;
  return Math.min(Math.floor(confirmedCount), MAX_HEAT_STEP);
}
