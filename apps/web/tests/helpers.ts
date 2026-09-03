import type {
  Member,
  NightState,
  ResolvedSignalMap,
  SignalWithNights,
  Vibe,
} from '@overlap/shared';
import { addDays, horizonDates } from '@/server/services/dateUtils';

/** Fixed "now" so every test is deterministic regardless of when it runs. */
export const TODAY = new Date('2026-09-03T12:00:00.000Z');
export const TODAY_ISO = horizonDates(TODAY, 1)[0]!;

export function dateAt(offsetDays: number): string {
  return addDays(TODAY_ISO, offsetDays);
}

export function isoDaysAgo(days: number): string {
  return new Date(TODAY.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function member(id: string, timezone = 'America/Toronto'): Member {
  return { userId: id, displayName: id, timezone };
}

export function members(ids: string[]): Member[] {
  return ids.map((id) => member(id));
}

/** Build a ResolvedSignalMap directly, bypassing resolveSignals(), so
 * computeOverlap() tests exercise only computeOverlap's own logic. */
export function resolvedMapFrom(
  entries: Record<string, Record<string, { state: NightState; vibe: Vibe }>>,
): ResolvedSignalMap {
  const map: ResolvedSignalMap = new Map();
  for (const [userId, nights] of Object.entries(entries)) {
    map.set(userId, new Map(Object.entries(nights)));
  }
  return map;
}

let signalCounter = 0;

export function makeSignal(input: {
  userId: string;
  groupId: string | null;
  weekStartDate: string;
  vibe: Vibe;
  submittedAt: string;
  nights: Array<{ date: string; state: NightState; horizonWeek: 0 | 1 | 2 }>;
}): SignalWithNights {
  signalCounter += 1;
  return {
    id: `sig-${signalCounter}`,
    userId: input.userId,
    groupId: input.groupId,
    weekStartDate: input.weekStartDate,
    vibe: input.vibe,
    submittedAt: input.submittedAt,
    nights: input.nights.map((n) => ({ ...n, writtenBy: 'user' })),
  };
}
