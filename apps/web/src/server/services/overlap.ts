/**
 * computeOverlap() — the most important file in the codebase
 * (engineering-spec.md §4). A pure function, zero I/O: everything it needs
 * comes in as arguments, so it's testable without a database and safe to
 * call from a worker precompute job or a request handler alike.
 *
 * Call resolveSignals() first (services/signals.ts) — this function
 * consumes already-resolved, one-night-per-user-per-date data and must
 * never see the global/scoped or overlapping-horizon ambiguity again.
 *
 * Invariants enforced HERE, not in the UI (a presentation-layer guarantee
 * is one refactor away from being lost):
 *   INV-2  only `confirmed_free` scores; `no_known_conflict` is tallied for
 *          display but never contributes to confirmedCount or bestNight.
 *   INV-3  vibeCounts is null unless the confirmed cohort is >= 5.
 *   INV-4  'broke' is stripped before any count, band, or list is built.
 *
 * Complexity. Let M = members.length, H = horizon length (21). Building the
 * per-date accumulators is a single pass over each member's resolved
 * nights — O(total resolved nights), which is at most O(M*H) and, because a
 * member's resolved-night map only contains dates they actually have data
 * for, usually much less. This is the theoretical floor: every
 * (member, night) pair that carries data must be inspected at least once to
 * know whether it should count. Deriving the 21 NightOverlap rows and the
 * best-night argmax is one further O(H) pass, tracked inline rather than as
 * a separate `.sort()` or `.reduce()` — no need to pay a log factor to find
 * a maximum.
 */
import type {
  GroupOverlap,
  Member,
  NightOverlap,
  ResolvedSignalMap,
  Vibe,
  VibeBand,
} from '@overlap/shared';
import { HIDDEN_VIBE, VIBES } from '@overlap/shared';
import { copy, fillTemplate, ordinal } from '@/lib/copy';
import { dayOfMonth, horizonDates, weekdayName } from '@/lib/dateUtils';

// NightOverlap.horizonWeek is derived as floor(idx / 7) and typed 0 | 1 | 2,
// so this must stay <= 21. The master doc's risk table contemplates
// *shrinking* the horizon to two weeks if the Signal takes too long to
// complete — that direction is safe. Growing it is not: 28 would produce a
// 3 wearing a 0 | 1 | 2 type, with no error anywhere. Widen HorizonWeek in
// packages/shared first if that ever happens.
const HORIZON_LENGTH = 21;
const CONFIRMED_COHORT_FLOOR = 5; // INV-3
const BAND_ELIGIBLE_FLOOR = 2;
const LIVE_THRESHOLD = 3;

const VISIBLE_VIBES = VIBES.filter((v) => v !== HIDDEN_VIBE);

// Which way a vibe leans for band derivation. 'broke' is deliberately
// absent — INV-4 means it must never influence what the group SEES, only
// (elsewhere, in suggestion ranking) what gets recommended.
const EXPANSIVE_VIBES = new Set<Vibe>(['down_for_anything']);
const LOW_KEY_VIBES = new Set<Vibe>(['low_key', 'slammed', 'out_of_town']);

function deriveBand(vibeCounts: Partial<Record<Vibe, number>>): VibeBand | null {
  let expansive = 0;
  let lowKey = 0;
  for (const [vibe, count] of Object.entries(vibeCounts) as [Vibe, number][]) {
    if (EXPANSIVE_VIBES.has(vibe)) expansive += count;
    else if (LOW_KEY_VIBES.has(vibe)) lowKey += count;
  }
  if (expansive === 0 && lowKey === 0) return null;
  if (expansive > lowKey) return 'expansive';
  if (lowKey > expansive) return 'low_key';
  return 'mixed';
}

function emptyVibeTally(): Record<Vibe, number> {
  return Object.fromEntries(VIBES.map((v) => [v, 0])) as Record<Vibe, number>;
}

export function computeOverlap(input: {
  groupId: string;
  members: Member[];
  resolved: ResolvedSignalMap;
  /**
   * Users who submitted a signal for the CURRENT week — drives
   * `signalledCount` ("5 of 7 signalled") and `isLive`. Deliberately a
   * separate argument rather than derived from `resolved`, because the two
   * genuinely differ in both directions: someone can submit this week's
   * Signal tapping zero free nights (signalled, but contributes nothing to
   * `resolved` worth counting), and someone's three-week-old signal can
   * still put nights in `resolved` long after they stopped signalling.
   * Deriving it here would quietly get the cold-start threshold wrong.
   * Whoever wires this up (T6/T7) owns computing it correctly.
   */
  signalledUserIds: ReadonlySet<string>;
  today: Date;
}): GroupOverlap {
  const { groupId, members, resolved, signalledUserIds, today } = input;
  const dates = horizonDates(today, HORIZON_LENGTH);
  const dateIndex = new Map(dates.map((d, i) => [d, i]));

  const confirmedMembers: Member[][] = dates.map(() => []);
  const vibeTally: Record<Vibe, number>[] = dates.map(() => emptyVibeTally());
  const softCounts: number[] = new Array(dates.length).fill(0);

  for (const member of members) {
    const nights = resolved.get(member.userId);
    if (!nights) continue;
    for (const [date, night] of nights) {
      const idx = dateIndex.get(date);
      if (idx === undefined) continue; // outside the current horizon

      if (night.state === 'confirmed_free') {
        confirmedMembers[idx]!.push(member);
        vibeTally[idx]![night.vibe] += 1;
      } else if (night.state === 'no_known_conflict') {
        softCounts[idx]! += 1;
      }
      // 'blocked' contributes to neither confirmed nor soft.
    }
  }

  // bestScore starts at 0, not -1: a night with zero confirmed members is
  // never "the best night" even when every night is tied at zero (OV-2) —
  // there has to be at least one confirmed person before a night can win.
  let bestIdx = -1;
  let bestScore = 0;

  const nights: NightOverlap[] = dates.map((date, idx) => {
    const confirmed = confirmedMembers[idx]!;
    const confirmedCount = confirmed.length;
    const score = confirmedCount; // INV-2: soft availability never scores

    if (score > bestScore) {
      bestScore = score;
      bestIdx = idx; // ascending date order → first strict max = earliest date (OV-10)
    }

    const visibleTally: Partial<Record<Vibe, number>> = {};
    for (const vibe of VISIBLE_VIBES) {
      visibleTally[vibe] = vibeTally[idx]![vibe]; // INV-4: 'broke' never enters this object
    }

    const vibeCounts = confirmedCount >= CONFIRMED_COHORT_FLOOR ? visibleTally : null; // INV-3
    const vibeBand =
      confirmedCount >= BAND_ELIGIBLE_FLOOR ? deriveBand(visibleTally) : null;

    return {
      date,
      horizonWeek: Math.floor(idx / 7) as 0 | 1 | 2,
      confirmedCount,
      softCount: softCounts[idx]!,
      totalMembers: members.length,
      vibeBand,
      vibeCounts,
      isBestNight: false, // corrected below once bestIdx is final
    };
  });

  let headline: string | null = null;
  if (bestIdx >= 0) {
    nights[bestIdx]!.isBestNight = true;
    const best = nights[bestIdx]!;
    if (best.confirmedCount >= BAND_ELIGIBLE_FLOOR) {
      const vars = {
        weekday: weekdayName(best.date),
        day: ordinal(dayOfMonth(best.date)),
        n: best.confirmedCount,
        m: members.length,
      };
      headline = best.vibeBand
        ? fillTemplate(copy.headlineBand, {
            ...vars,
            bandClause: copy.bandClauses[best.vibeBand],
          })
        : fillTemplate(copy.headline, vars);
    }
  }

  return {
    groupId,
    nights,
    headline,
    signalledCount: signalledUserIds.size,
    memberCount: members.length,
    isLive: signalledUserIds.size >= LIVE_THRESHOLD,
  };
}
