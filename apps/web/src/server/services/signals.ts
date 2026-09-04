/**
 * resolveSignals() — engineering-spec.md §4.0 (FIX-2).
 *
 * "The signals for a group" is ambiguous in two ways, and left unresolved
 * an agent (or a future contributor) will guess. Both rules are load-bearing
 * and are implemented here, in one place, before computeOverlap() ever sees
 * a night:
 *
 *   Rule A (global vs. group-scoped) — the group-scoped signal wins if one
 *   exists for a given week; otherwise fall back to the global signal.
 *   Never merge them, never union their nights.
 *
 *   Rule B (overlapping horizons) — each signal covers 21 days, and last
 *   week's signal covers 14 of the same dates. For any date, the night from
 *   the most recently submitted signal wins. Deduplicate by (user_id, date).
 *
 *   Freshness — a `confirmed_free` night in week 0 of a signal submitted
 *   more than 7 days ago is stale and is downgraded to `no_known_conflict`
 *   at read time (there is no expiry job/column; decay is computed here).
 *
 * Complexity: let N be the total number of nights across all signals passed
 * in. Grouping by user and by week is O(N) (a handful of weeks per user —
 * effectively a small constant, never worth a log factor). The one sort is
 * over each user's *effective* signals (after Rule A collapses scoped vs.
 * global), which is at most a handful of weeks, not N — so the sort's cost
 * is dominated by the O(N) single pass over nights that follows it. Overall
 * O(N): every night is visited once, which is also the theoretical floor,
 * since resolution can't skip a night without reading its date and state.
 */
import type {
  NightState,
  ResolvedNight,
  ResolvedSignalMap,
  SignalWithNights,
} from '@overlap/shared';

const FRESHNESS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** A signal paired with its submittedAt parsed to an epoch-ms instant, so
 * ordering never depends on how the timestamp string happened to be
 * formatted. */
interface DatedSignal {
  signal: SignalWithNights;
  submittedMs: number;
}

export function resolveSignals(input: {
  signals: SignalWithNights[];
  groupId: string;
  now: Date;
}): ResolvedSignalMap {
  const { signals, groupId, now } = input;
  const nowMs = now.getTime();

  // Parse submittedAt ONCE, up front, and compare instants numerically from
  // here on. Comparing the raw ISO strings would be subtly wrong: ISO 8601
  // only sorts lexicographically when every value uses an identical
  // representation, and '2026-09-03T08:00:00-04:00' (12:00Z) sorts BEFORE
  // '2026-09-03T10:00:00.000Z' (10:00Z) as a string despite being two hours
  // later in real time. That would hand Rule B to the wrong signal and could
  // show a night as blocked that the user most recently tapped as free —
  // the exact "heatmap lies" failure A2 is about. Regression test in
  // tests/services/signals.test.ts.
  const byUser = new Map<string, DatedSignal[]>();
  for (const signal of signals) {
    if (signal.groupId !== null && signal.groupId !== groupId) continue; // another group's override
    const dated: DatedSignal = { signal, submittedMs: new Date(signal.submittedAt).getTime() };
    const bucket = byUser.get(signal.userId);
    if (bucket) bucket.push(dated);
    else byUser.set(signal.userId, [dated]);
  }

  const result: ResolvedSignalMap = new Map();

  for (const [userId, userSignals] of byUser) {
    // Rule A: per week_start_date, a scoped signal shadows the global one.
    const scopedByWeek = new Map<string, DatedSignal>();
    const globalByWeek = new Map<string, DatedSignal>();
    for (const s of userSignals) {
      const target = s.signal.groupId === null ? globalByWeek : scopedByWeek;
      const existing = target.get(s.signal.weekStartDate);
      // Two signals for the same user/group/week shouldn't exist (INV-8 for
      // global; a unique index for scoped) — if it somehow does, keep the
      // more recent one rather than throwing in a read path.
      if (!existing || existing.submittedMs < s.submittedMs) {
        target.set(s.signal.weekStartDate, s);
      }
    }
    const weeks = new Set([...scopedByWeek.keys(), ...globalByWeek.keys()]);
    const effectiveSignals = Array.from(weeks, (week) => scopedByWeek.get(week) ?? globalByWeek.get(week)!);

    // Rule B: newest submission wins per date. Sorting once and then taking
    // the first claim per date is equivalent to, but cheaper than, comparing
    // submittedAt on every (date) collision individually.
    effectiveSignals.sort((a, b) => b.submittedMs - a.submittedMs);

    const resolvedNights = new Map<string, ResolvedNight>();
    for (const { signal, submittedMs } of effectiveSignals) {
      for (const night of signal.nights) {
        if (resolvedNights.has(night.date)) continue; // a more recent signal already claimed this date

        // Freshness. A confirmation is only as good as the moment it was
        // made: once a signal is more than a week old, nothing in it still
        // counts as a hard "yes", whichever of its three weeks the night
        // sat in. This is what makes master doc §2.3d's "skip repeatedly
        // and you fade out of the picture" actually happen.
        //
        // Earlier this only downgraded horizon week 0, per an earlier
        // reading of engineering-spec.md §4.0. That left an abandoned
        // signal asserting hard confirmations for its weeks 1 and 2 for a
        // full fortnight — a two-week-old guess presented as a friend
        // saying yes, which is exactly the over-reporting audit finding A2
        // exists to prevent. Both documents now describe the rule below.
        let state: NightState = night.state;
        if (state === 'confirmed_free' && nowMs - submittedMs > FRESHNESS_WINDOW_MS) {
          state = 'no_known_conflict';
        }
        resolvedNights.set(night.date, { state, vibe: signal.vibe });
      }
    }

    result.set(userId, resolvedNights);
  }

  return result;
}
