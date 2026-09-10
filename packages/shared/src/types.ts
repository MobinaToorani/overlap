/**
 * Domain types shared across the overlap engine, the tRPC API, and (via the
 * zod schemas in ./schemas) the wire contract with the Python worker.
 *
 * Source of truth for the shapes below: docs/engineering-spec.md §3-4.
 */

/**
 * Domain constants that both the server and the client have to agree on.
 * They live here rather than in either side's code because each was
 * previously defined twice — and two copies of a rule is one drift away
 * from the UI saying "3 of you" while the engine gates on 4.
 */

/** The Signal's rolling horizon: this week plus the two ahead (master doc §2.2, Rule 1). */
export const HORIZON_WEEKS = 3;
export const DAYS_PER_WEEK = 7;
export const HORIZON_DAYS = HORIZON_WEEKS * DAYS_PER_WEEK;

/**
 * A group is "live" at 3+ members with current signals (master doc §2.5 —
 * lowered from 4 by audit finding A10). Below this the group sees
 * `belowThreshold` copy instead of a grid.
 */
export const LIVE_THRESHOLD = 3;

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

/**
 * Where a pre-filled night in the Signal draft came from (A1 / X-19).
 *
 * `carried` — the prior signal covered this exact date and the person
 * confirmed it. The strongest source: it is their own answer about this
 * night, not an inference from it.
 *
 * `pattern` — no prior signal reached this date, so it is proposed from
 * the weekday they usually confirm.
 *
 * A draft night is never stored and never scores. It is a proposal the
 * person can see, change, and only then agree to by submitting — which is
 * the human act INV-1 and A2 require before anything counts as free.
 */
export const DRAFT_SOURCES = ['carried', 'pattern'] as const;
export type DraftSource = (typeof DRAFT_SOURCES)[number];

export interface DraftNight {
  date: string; // ISO date (YYYY-MM-DD)
  source: DraftSource;
}

/** What `signal.getDraft` hands the grid when no signal exists yet. */
export interface SignalDraft {
  weekStartDate: string;
  nights: DraftNight[];
  /** The signal this was derived from, so the UI can say where it came
   * from rather than pre-selecting nights with no explanation. Null when
   * there was no usable prior signal and the grid opens empty. */
  from: { weekStartDate: string; submittedAt: string } | null;
}

export interface Member {
  userId: string;
  displayName: string;
  timezone: string;
}

/**
 * What a night resolves to, which is not the same alphabet as what the
 * database stores. `lapsed` exists only after resolution: the member did
 * affirmatively tap this night, and their signal has since aged past the
 * freshness window.
 *
 * Keeping it distinct from `no_known_conflict` matters for honesty, not
 * bookkeeping. The copy for a soft night reads "no conflict on their
 * calendar, but they haven't confirmed" — which is false about someone who
 * confirmed and went stale. A2's whole thesis is that this screen never
 * misrepresents what a friend said, and misrepresenting them pessimistically
 * is still misrepresenting them.
 */
export type ResolvedNightState = NightState | 'lapsed';

/**
 * A night's state for one member after resolveSignals() has applied
 * global-vs-scoped precedence, overlapping-horizon dedup, and freshness
 * decay. See apps/web/src/server/services/signals.ts.
 */
export interface ResolvedNight {
  state: ResolvedNightState;
  vibe: Vibe;
}

/** Per-user, per-date resolved availability for a single group. */
export type ResolvedSignalMap = Map<string, Map<string, ResolvedNight>>; // userId -> date -> night

export interface NightOverlap {
  date: string;
  horizonWeek: HorizonWeek;
  confirmedCount: number;
  softCount: number;
  /** Tapped, then went stale. Never scores, but is not the same thing as
   * "never said anything" — see ResolvedNightState. */
  lapsedCount: number;
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

/**
 * The current user's own profile row (`me.get`). Deliberately carries no
 * phone number: the member list renders `displayName`, and X-12's defect
 * was a phone reaching a screen it had no reason to be on. `/me` gets the
 * phone from the auth session it already holds, not from here.
 */
export interface UserProfile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  timezone: string;
  /**
   * True while `display_name` is still the placeholder FIX-1's signup
   * trigger writes — i.e. nobody has ever named this person. Computed on
   * the server so the placeholder string stays a server/SQL detail and
   * the client never has to know what it is (T25 / X-12).
   */
  needsDisplayName: boolean;
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
