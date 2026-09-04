/**
 * Domain types shared across the overlap engine, the tRPC API, and (via the
 * zod schemas in ./schemas) the wire contract with the Python worker.
 *
 * Source of truth for the shapes below: docs/engineering-spec.md §3-4.
 */

export const VIBES = [
  'down_for_anything',
  'low_key',
  'slammed',
  'broke',
  'out_of_town',
] as const;
export type Vibe = (typeof VIBES)[number];

/** INV-4: 'broke' must never appear in a returned count, band, or list. */
export const HIDDEN_VIBE: Vibe = 'broke';

export const NIGHT_STATES = ['confirmed_free', 'no_known_conflict', 'blocked'] as const;
export type NightState = (typeof NIGHT_STATES)[number];

export const VIBE_BANDS = ['expansive', 'mixed', 'low_key'] as const;
export type VibeBand = (typeof VIBE_BANDS)[number];

export type HorizonWeek = 0 | 1 | 2;

export type WrittenBy = 'user' | 'sync';

/** A single night as written by a signal (raw, pre-resolution). */
export interface SignalNight {
  date: string; // ISO date (YYYY-MM-DD)
  state: NightState;
  horizonWeek: HorizonWeek;
  writtenBy: WrittenBy;
}

/** One submitted signal (global if groupId is null) plus its nights. */
export interface SignalWithNights {
  id: string;
  userId: string;
  groupId: string | null;
  weekStartDate: string; // ISO date
  vibe: Vibe;
  submittedAt: string; // ISO datetime
  nights: SignalNight[];
}

export interface Member {
  userId: string;
  displayName: string;
  timezone: string;
}

/**
 * A night's state for one member after resolveSignals() has applied
 * global-vs-scoped precedence, overlapping-horizon dedup, and the week-0
 * freshness downgrade. See packages/shared/src/overlap/resolveSignals.ts.
 */
export interface ResolvedNight {
  state: NightState;
  vibe: Vibe;
}

/** Per-user, per-date resolved availability for a single group. */
export type ResolvedSignalMap = Map<string, Map<string, ResolvedNight>>; // userId -> date -> night

export interface NightOverlap {
  date: string;
  horizonWeek: HorizonWeek;
  confirmedCount: number;
  softCount: number;
  totalMembers: number;
  vibeBand: VibeBand | null;
  vibeCounts: Partial<Record<Vibe, number>> | null; // null if cohort < 5 (INV-3)
  isBestNight: boolean;
}

export interface GroupOverlap {
  groupId: string;
  nights: NightOverlap[];
  headline: string | null;
  signalledCount: number;
  memberCount: number;
  isLive: boolean; // signalledCount >= 3
}

export type GroupMemberRole = 'member' | 'admin';

/**
 * createdAt/joinedAt are real `Date` objects, not ISO strings — tRPC's
 * superjson transformer preserves Date through the wire, and these fields
 * come straight off Drizzle's `timestamptz` columns (which postgres-js
 * already returns as Date). Unlike SignalNight.date (a calendar date with
 * no time component, always a plain string), these are instants.
 */
export interface Group {
  id: string;
  name: string;
  avatarUrl: string | null;
  joinCode: string;
  createdAt: Date;
}

export interface GroupMember {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  role: GroupMemberRole;
  joinedAt: Date;
}

export interface GroupWithMembers extends Group {
  members: GroupMember[];
}

/** A row from group.listMine — deliberately lighter than GroupWithMembers;
 * a group switcher needs a name and a way to link to it, not a member list
 * per group. */
export interface GroupSummary {
  id: string;
  name: string;
  avatarUrl: string | null;
}
