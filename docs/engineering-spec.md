# Overlap — Engineering Specification

**Version:** 1.3 (post-audit; freshness rule corrected and extended to three cadence-derived stages, 2026-09-04)
**Companion to:** `overlap-master-doc.md` v0.4
**Audience:** the implementing agent (and future you)
**Purpose:** remove every decision an agent would otherwise invent

> **v1.1 changelog.** An audit of v1.0 found twelve defects. Three were blocking (no `auth.users` linkage, undefined signal-resolution precedence, nullable `ends_at`), and one would have silently disabled the retention mechanic (plan invites could starve the Sunday Signal out of the notification budget). All are fixed in place and tagged `FIX-n`. Full report in `audit-report.md`.

The master doc explains *why*. This document is the *contract*. Where the two conflict, this one wins on implementation detail and the master doc wins on intent.

---

## 0. Non-negotiable invariants

These encode audit findings A2, A3, A5, and A9. Violating any of them silently breaks the product. **Every one must have a test.**

| # | Invariant | Enforcement point |
|---|---|---|
| **INV-1** | Calendar sync may write `signal_night.state` values of `'blocked'` or `'no_known_conflict'` only. It may **never** write `'confirmed_free'`. | DB trigger + **separate DB role** + service guard + test — see FIX-4 |
| **INV-2** | Only `confirmed_free` nights count toward overlap scores and headline text. `no_known_conflict` is display-only. | Overlap engine + unit test |
| **INV-3** | Exact vibe counts are returned only when the confirmed cohort is ≥ 5. Below that, return a qualitative band. | Overlap engine, not the UI + unit test |
| **INV-4** | `vibe = 'broke'` is **never** returned in any count, band, or list, at any cohort size. It may only influence suggestion ranking. | Overlap engine + unit test |
| **INV-5** | No user receives more than 4 notifications in a rolling 7-day window. Excess is dropped, never queued. | Central dispatcher + integration test |
| **INV-6** | Every notification dispatch logs four separate events: `dispatched`, `delivered`, `opened`, `completed`. | Dispatcher + analytics test |
| **INV-7** | Calendar reads use free/busy scopes only. Event titles, descriptions, locations, and attendees are never requested or persisted. | OAuth scope config + code review |
| **INV-8** | A user has at most one signal per `week_start_date` where `group_id IS NULL` (the global signal). | DB unique index |

---

## 1. Locked technology decisions

No substitutions without an explicit decision record.

```
Runtime           Node 20 LTS
Framework         Next.js 15, App Router, TypeScript strict
Styling           Tailwind CSS v4
API               tRPC v11
ORM               Drizzle
Database          Postgres via Supabase
Cache / queue     Upstash Redis
Auth              Supabase Auth, phone OTP provider
SMS               Twilio Programmable Messaging
Web Push          web-push (VAPID)
Worker            Python 3.12, FastAPI + APScheduler, deployed to Fly.io
Media             Supabase Storage
Analytics         PostHog
Errors            Sentry
Hosting           Vercel (web), Fly.io (worker)
Package manager   pnpm
Testing           Vitest (unit), Playwright (e2e), pytest (worker)
```

**Explicitly rejected:** Prisma (Drizzle is lighter for this schema), NextAuth (Supabase Auth handles phone OTP natively), any UI component library beyond Radix primitives, GraphQL, microservices.

---

## 2. Repository structure

```
overlap/
├── apps/
│   ├── web/                          # Next.js
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── (auth)/login/
│   │   │   │   ├── (app)/
│   │   │   │   │   ├── g/[groupId]/          # group home
│   │   │   │   │   ├── g/[groupId]/plan/[planId]/
│   │   │   │   │   ├── signal/               # the weekly modal route
│   │   │   │   │   └── me/
│   │   │   │   ├── p/[slug]/                 # PUBLIC invite — no auth
│   │   │   │   ├── api/trpc/[trpc]/
│   │   │   │   └── api/og/[slug]/            # OG image generation
│   │   │   ├── components/
│   │   │   │   ├── heatmap/
│   │   │   │   ├── signal/
│   │   │   │   ├── plan/
│   │   │   │   └── ui/                       # primitives only
│   │   │   ├── server/
│   │   │   │   ├── trpc/routers/
│   │   │   │   ├── services/
│   │   │   │   │   ├── overlap.ts            # THE core engine
│   │   │   │   │   ├── notifications.ts      # central dispatcher
│   │   │   │   │   └── signals.ts
│   │   │   │   └── db/
│   │   │   │       ├── schema.ts
│   │   │   │       └── migrations/
│   │   │   └── lib/
│   │   └── tests/
│   └── worker/                       # Python
│       ├── jobs/
│       │   ├── calendar_sync.py
│       │   ├── signal_dispatch.py
│       │   ├── overlap_precompute.py
│       │   ├── occasion_scan.py
│       │   └── nudge_evaluator.py
│       ├── lib/
│       └── tests/
├── packages/
│   └── shared/                       # types + zod schemas shared web↔worker
└── docs/
    ├── overlap-master-doc.md
    └── engineering-spec.md
```

---

## 3. Database schema (Postgres DDL)

```sql
-- ENUMS
CREATE TYPE vibe_t AS ENUM (
  'down_for_anything','low_key','slammed','broke','out_of_town'
);
CREATE TYPE night_state_t AS ENUM (
  'confirmed_free','no_known_conflict','blocked'
);
CREATE TYPE plan_status_t AS ENUM ('draft','live','happened','cancelled');
CREATE TYPE rsvp_status_t AS ENUM ('going','maybe','out');
CREATE TYPE member_role_t AS ENUM ('member','admin');

-- USERS
-- FIX-1: app_user MUST be keyed to Supabase's auth.users. Without this link,
-- there is no way to resolve a session to an application row and T3 cannot work.
-- Create the row in an after-insert trigger on auth.users, or in the OTP verify
-- handler. Do NOT generate an independent uuid here.
CREATE TABLE app_user (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_e164    text UNIQUE NOT NULL,
  display_name  text NOT NULL,
  avatar_url    text,
  timezone      text NOT NULL DEFAULT 'America/Toronto',
  poke_muted_until timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- GROUPS
CREATE TABLE grp (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  avatar_url   text,
  created_by   uuid NOT NULL REFERENCES app_user(id),
  signal_dow   smallint NOT NULL DEFAULT 0,   -- 0 = Sunday
  signal_hour  smallint NOT NULL DEFAULT 19,
  -- FIX-7's STEPDOWN is deferred, not struck (ADR-0007 as amended; X-1).
  -- Its trigger condition needs per-group weekly completion history that no
  -- table holds and no ticket adds, and it could not fire inside a four-week
  -- pilot. A8 is reopened as unresolved rather than left as a paper
  -- mitigation. Nothing writes this column yet.
  -- It IS read: §4.0's freshness windows are derived from it (FIX-13), so the
  -- collision X-1 found — a fortnightly group's confirmations all expiring
  -- mid-cycle — is now impossible by construction rather than by a promise
  -- that whoever revives the stepdown will remember to fix freshness too.
  -- At the default of 1 this is exactly the flat weekly rule it replaced.
  cadence_weeks smallint NOT NULL DEFAULT 1 CHECK (cadence_weeks IN (1,2)),
  join_code    text UNIQUE NOT NULL,  -- FIX-12: >=10 chars from a 32-char
                                     -- unambiguous alphabet (no 0/O/1/I).
                                     -- Never sequential. Rate-limit join attempts.
  deleted_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE group_member (
  group_id  uuid NOT NULL REFERENCES grp(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  role      member_role_t NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

-- CALENDAR
CREATE TABLE calendar_connection (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  provider                text NOT NULL,
  refresh_token_encrypted text NOT NULL,
  sync_status             text NOT NULL DEFAULT 'active',
  last_synced_at          timestamptz,
  UNIQUE (user_id, provider)
);

-- NOTE: no title, location, or attendee columns. INV-7.
CREATE TABLE busy_block (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at   timestamptz NOT NULL,
  source    text NOT NULL DEFAULT 'calendar'
);
CREATE INDEX idx_busy_user_time ON busy_block (user_id, starts_at, ends_at);

-- SIGNALS
CREATE TABLE signal (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  group_id        uuid REFERENCES grp(id) ON DELETE CASCADE,  -- NULL = global
  week_start_date date NOT NULL,
  vibe            vibe_t NOT NULL,
  note            varchar(140),
  submitted_at    timestamptz NOT NULL DEFAULT now()
);

-- INV-8: exactly one global signal per user per week
CREATE UNIQUE INDEX uq_signal_global
  ON signal (user_id, week_start_date) WHERE group_id IS NULL;
CREATE UNIQUE INDEX uq_signal_scoped
  ON signal (user_id, group_id, week_start_date) WHERE group_id IS NOT NULL;

CREATE TABLE signal_night (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id     uuid NOT NULL REFERENCES signal(id) ON DELETE CASCADE,
  date          date NOT NULL,
  state         night_state_t NOT NULL,
  horizon_week  smallint NOT NULL CHECK (horizon_week BETWEEN 0 AND 2),
  confirmed_at  timestamptz,          -- NULL unless state='confirmed_free'
  written_by    text NOT NULL,        -- 'user' | 'sync'
  UNIQUE (signal_id, date)
);

-- INV-1 ENFORCED IN THE DATABASE. Do not remove.
CREATE OR REPLACE FUNCTION guard_confirmed_free() RETURNS trigger AS $$
BEGIN
  IF NEW.state = 'confirmed_free' AND NEW.written_by <> 'user' THEN
    RAISE EXCEPTION
      'INV-1: confirmed_free may only be written by a user action, got written_by=%',
      NEW.written_by;
  END IF;
  IF NEW.state = 'confirmed_free' AND NEW.confirmed_at IS NULL THEN
    RAISE EXCEPTION 'INV-1: confirmed_free requires confirmed_at';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_guard_confirmed_free
  BEFORE INSERT OR UPDATE ON signal_night
  FOR EACH ROW EXECUTE FUNCTION guard_confirmed_free();

-- FIX-4: HONEST LIMITATION OF THE ABOVE.
-- The trigger only checks a column the caller supplies. A sync job that passes
-- written_by='user' defeats it entirely. The trigger catches accidents, not
-- determined code. Add a real boundary: the worker connects as its own role
-- which is physically unable to write the offending value.
CREATE ROLE overlap_worker LOGIN PASSWORD :'worker_pw';
GRANT SELECT, INSERT, UPDATE ON busy_block TO overlap_worker;
GRANT SELECT ON signal, app_user, grp, group_member TO overlap_worker;

CREATE OR REPLACE FUNCTION guard_worker_role() RETURNS trigger AS $$
BEGIN
  IF current_user = 'overlap_worker' AND NEW.state = 'confirmed_free' THEN
    RAISE EXCEPTION 'INV-1: the worker role may never write confirmed_free';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_guard_worker_role
  BEFORE INSERT OR UPDATE ON signal_night
  FOR EACH ROW EXECUTE FUNCTION guard_worker_role();

-- PLANS
CREATE TABLE plan (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id          uuid NOT NULL REFERENCES grp(id) ON DELETE CASCADE,
  created_by        uuid NOT NULL REFERENCES app_user(id),
  title             text NOT NULL,
  description       text,
  starts_at         timestamptz NOT NULL,
  -- FIX-10: was nullable, which silently broke attendance_prompt (it queries
  -- plans past ends_at). Now defaulted at write time to starts_at + 4h.
  ends_at           timestamptz NOT NULL,
  location_text     text,
  is_home_hang      boolean NOT NULL DEFAULT false,  -- measures Open Question 7
  cover_asset       text,
  status            plan_status_t NOT NULL DEFAULT 'live',
  public_slug       text UNIQUE NOT NULL,
  attendance_confirmed_at timestamptz,               -- North Star input
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rsvp (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id      uuid NOT NULL REFERENCES plan(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES app_user(id),   -- NULL for guests
  guest_name   text,
  status       rsvp_status_t NOT NULL,
  plus_ones    smallint NOT NULL DEFAULT 0,
  responded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR guest_name IS NOT NULL)
);

CREATE TABLE message (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id       uuid NOT NULL REFERENCES plan(id) ON DELETE CASCADE,
  author_id     uuid NOT NULL REFERENCES app_user(id),
  body          text,
  attachment_url text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- NOTIFICATIONS (INV-5, INV-6)
CREATE TABLE notification_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  kind         text NOT NULL,     -- signal|invite|starting_soon|poke|nudge
  rank         smallint NOT NULL, -- 1..5, see master doc §7.5
  channel      text NOT NULL,     -- sms|webpush|apns|fcm
  idempotency_key text UNIQUE NOT NULL,
  dispatched_at timestamptz,
  delivered_at  timestamptz,
  opened_at     timestamptz,
  completed_at  timestamptz,
  dropped_reason text            -- 'budget_exceeded' etc.
);
CREATE INDEX idx_notif_budget ON notification_log (user_id, dispatched_at);

-- POKES (v2)
CREATE TABLE poke (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     uuid NOT NULL REFERENCES grp(id) ON DELETE CASCADE,
  sender_id    uuid NOT NULL REFERENCES app_user(id),
  recipient_id uuid NOT NULL REFERENCES app_user(id),
  context_date date,
  sent_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_poke_rate ON poke (recipient_id, sent_at);

-- v2, deferred
CREATE TABLE someday_item (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  kind       text NOT NULL,     -- 'do' | 'want'
  title      text NOT NULL,
  url        text,
  price_cents integer,
  note       text,
  claimed_by uuid REFERENCES app_user(id),  -- NEVER exposed to user_id
  created_at timestamptz NOT NULL DEFAULT now()
);
```

---

## 4. The overlap engine

The most important file in the codebase. `apps/web/src/server/services/overlap.ts`

### 4.0 Signal resolution — READ THIS FIRST (FIX-2)

**This was missing from v1.0 of this spec and is the single most important gap.** The engine consumes "the signals for a group," but that phrase is ambiguous in two ways, and an agent will resolve the ambiguity by guessing. Both rules below must be implemented in a dedicated `resolveSignals()` function that runs *before* `computeOverlap()`.

**Ambiguity A — global vs. group-scoped.** A user may have a global signal (`group_id IS NULL`) and a per-group override for this specific group, for the same week.

> **Rule: the group-scoped signal wins if one exists. Otherwise fall back to the global signal.** Never merge them, never union their nights. One signal wins wholesale.

**Ambiguity B — overlapping horizons.** Every Sunday a user creates a signal covering 21 days. Last week's signal also covered 21 days. **Fourteen of those dates are covered by both rows.** Nothing in v1.0 said which wins, so the engine would have returned duplicate or arbitrary nights per date.

> **Rule: for any given date, the night from the most recently submitted signal wins.** Deduplicate by `(user_id, date)`, ordered by `signal.submitted_at DESC`, take the first.

**Freshness.** A confirmation is only as good as the moment it was made, and it decays in **three stages** as its signal ages — whichever of its three weeks the night sat in. One *ask cycle* is `cadence_weeks × 7 days`.

```
age = now - signal.submitted_at

if age > 2 * cycle:                        # stage 3 — dropped
    omit the night entirely
elif night.state == 'confirmed_free' and age > cycle:
    treat state as 'lapsed'                # stage 2 — displays, does not score
```

| Stage | Age | State | Behaviour |
|---|---|---|---|
| Fresh | < 1 cycle | `confirmed_free` | Scores. A friend said yes and it is still current |
| Lapsed | 1–2 cycles | `lapsed` | Shown at reduced weight; excluded from `confirmedCount` |
| Dropped | ≥ 2 cycles | — | Omitted. The member reads as not having signalled |

Two properties of this that are load-bearing:

- **`lapsed` is not `no_known_conflict`.** The member *did* tap the night. Collapsing them into "never said anything" discards true information and describes them falsely — the same misrepresentation A2 exists to prevent, pointed the other way.
- **Stage 3 drops the night whatever it said,** including `blocked`. A signal two cycles old is not evidence of anything current, and a stale conflict is as much a false assertion as a stale confirmation. Silence is the honest representation of "we no longer know".

This is how progressive decay (master doc §2.3d) is actually implemented. There is no expiry job and no `expires_at` column — decay is a read-time concern, computed here.

> **Corrected 2026-09-04 (v1.2).** This rule previously applied only to `horizon_week == 0`, which contradicted master doc §2.3d ("weeks two and three persist but are marked **unconfirmed** … skip repeatedly and you fade out of the picture entirely"). The narrower rule meant an abandoned signal kept asserting hard confirmations for its weeks 1 and 2 for a full fortnight: someone who tapped a night on the 6th and never returned still showed as *confirmed free* on the 20th. A two-week-old guess presented as a friend saying yes is precisely the over-reporting audit finding **A2** exists to prevent, and it meant skipping had no consequence, defeating §2.3d's decay design. Test **RS-5** covers it.

> **Extended 2026-09-04 (v1.3), per `audit-report.md` FIX-13.** v1.2 had two stages and a flat 7-day window. Both were wrong in the same direction — not enough decay:
>
> - **Two stages cannot produce "fade out entirely".** `lapsed` is still *shown*. Without a third stage a member who signalled once in September stays on the heatmap at reduced weight until the date itself passes. That is a fade that never finishes, and §2.3d promises one that does.
> - **A flat 7 days penalises a fortnightly group for complying.** FIX-7 steps a quiet group to `cadence_weeks = 2`; a flat window would then lapse every confirmation days before that group's next ask even goes out. Coherence audit **X-1** found this coupling; deriving the window from cadence is what discharges it.
>
> There is deliberately **no grace period** on either threshold. It is tempting to add a day or two of slack so a Monday answer doesn't flicker, but it would put the weekly threshold at nine days — landing exactly on RS-3's boundary — and the flicker it avoids is a night moving to `lapsed`, a state the UI shows rather than hides.
>
> Tests **RS-6**, **RS-7**, **RS-8** cover the three stages, the cadence derivation, and the stale-`blocked` drop respectively.
>
> Note the horizon week is no longer consulted here at all. `signal_night.horizon_week` is still stored — it records which week of its own signal a night belonged to, which the analytics event `signal_completed.horizon_weeks_touched` (§11) reports on — but it no longer affects resolution.

**Required additional tests:**

| ID | Case | Expected |
|---|---|---|
| RS-1 | User has both global and group-scoped signal for the week | Group-scoped used; global ignored entirely |
| RS-2 | Two signals from consecutive weeks cover the same date differently | Most recent `submitted_at` wins; exactly one night per user per date |
| RS-3 | Week-0 `confirmed_free` from a 9-day-old signal | Downgraded to soft; excluded from `confirmedCount` |
| RS-4 | User has no signal at all | Contributes to `memberCount`, not to `confirmedCount` or `softCount` |
| RS-5 | Abandoned signal: `confirmed_free` nights in weeks 0, 1 **and** 2, submitted 14 days ago | All three downgraded to `lapsed`; `confirmedCount` 0, night still visible, no headline. The member has faded from the picture without being scolded (§2.3d) |
| RS-6 | One `confirmed_free` night, read at 10 days and again at 18 days | `lapsed` at 10 days; **absent from the map entirely** at 18. Pins both thresholds from each side |
| RS-7 | Same 12-day-old signal resolved at `cadence_weeks` 1 and 2 | Weekly → `lapsed`; fortnightly → still `confirmed_free`. A group asked half as often is not stale half as fast (X-1) |
| RS-8 | A `blocked` night from a signal 18 days old | Dropped, not retained. Decay clears stale conflicts as well as stale confirmations |

### Signature

```ts
type NightOverlap = {
  date: string;                 // ISO date
  horizonWeek: 0 | 1 | 2;
  confirmedCount: number;       // scores on this ONLY (INV-2)
  softCount: number;            // display only
  totalMembers: number;
  vibeBand: 'expansive' | 'mixed' | 'low_key' | null;
  vibeCounts: Record<string, number> | null;  // null if cohort < 5 (INV-3)
  isBestNight: boolean;
};

type GroupOverlap = {
  groupId: string;
  nights: NightOverlap[];
  headline: string | null;      // built from confirmed only
  signalledCount: number;
  memberCount: number;
  isLive: boolean;              // signalledCount >= 3
};

export function computeOverlap(input: {
  members: Member[];
  signals: SignalWithNights[];
  today: Date;
}): GroupOverlap;
```

### Algorithm

```
horizon = next 21 days from today

for each date D in horizon:
  confirmed = members whose signal_night(D).state = 'confirmed_free'
  soft      = members whose signal_night(D).state = 'no_known_conflict'

  score = |confirmed|                          # INV-2: soft never scores

  if |confirmed| >= 5:                          # INV-3
      vibeCounts = tally(confirmed.vibe) minus 'broke'   # INV-4
      vibeBand   = derive(vibeCounts)
  else:
      vibeCounts = null
      vibeBand   = derive_band(confirmed.vibe) if |confirmed| >= 2 else null

bestNight = argmax(score), ties broken by earliest date
headline  = |confirmed| >= 2
            ? "{Weekday} the {N} — {c} of {m} free{band clause}"
            : null
```

### Required unit tests

| ID | Case | Expected |
|---|---|---|
| OV-1 | All members confirmed free on one night | `confirmedCount = memberCount`, that night is best |
| OV-2 | All soft, none confirmed | `confirmedCount = 0`, no headline, night not best |
| OV-3 | 4 confirmed, one is `broke` | `vibeCounts` is null (cohort < 5); `broke` absent from any output |
| OV-4 | 6 confirmed, two are `broke` | `vibeCounts` present, `broke` key **absent** |
| OV-5 | Single member group | No headline, `isLive = false` |
| OV-6 | Sync attempts `confirmed_free` | DB throws; assert the exception |
| OV-7 | DST spring-forward boundary in horizon | 21 distinct dates, no duplicate, no gap |
| OV-8 | Members in different timezones | Night bucketing uses the group's local date, not UTC |
| OV-9 | Expired week-0 signal, weeks 1–2 present | Week 0 excluded, weeks 1–2 render as unconfirmed |
| OV-10 | Tie between two nights | Earlier date wins |

---

## 5. API surface (tRPC routers)

```ts
auth.requestOtp          ({ phone })                          → { ok }
auth.verifyOtp           ({ phone, code })                    → { session }

group.create             ({ name })                           → Group
group.joinByCode         ({ joinCode })                       → Group
group.get                ({ groupId })                        → Group & members
group.overlap            ({ groupId })                        → GroupOverlap
group.shareCard          ({ groupId })                        → { imageUrl }   // cold start, A10
group.leave              ({ groupId })                        → { ok }

signal.getCurrent        ()                                   → Signal | null
signal.submit            ({ vibe, nights[], note? })          → Signal
   // nights: { date, state: 'confirmed_free' | 'blocked' }[]
   // server sets written_by='user', confirmed_at=now()
signal.getDraft          ()                                   → prefilled nights from busy_block + prior week

plan.createFromNight     ({ groupId, date, title, startTime?, ... }) → Plan
   // FIX-6: a heatmap "night" is a DATE; plan.starts_at is a TIMESTAMPTZ.
   // Default startTime to 19:00 in the GROUP's timezone when omitted.
   // ends_at defaults to starts_at + 4h (never null — FIX-10).
   // is_home_hang defaults TRUE when location_text is empty. This is the
   // measurement for master-doc Open Question 7 and must not be skipped.
plan.get                 ({ planId })                         → Plan & rsvps
plan.getPublic           ({ slug })                           → PublicPlan     // NO AUTH
plan.rsvp                ({ slug, status, guestName? })       → Rsvp           // NO AUTH
plan.confirmAttendance   ({ planId })                         → Plan
plan.postMessage         ({ planId, body })                   → Message

poke.send                ({ groupId, recipientId, date? })    → { ok }         // v2
poke.mute                ({ weeks: 2 })                       → { ok }

calendar.connect         ({ provider })                       → { authUrl }
calendar.disconnect      ({ provider })                       → { ok }         // purges busy_block immediately

me.updateProfile         ({ displayName, timezone })          → User
me.notificationPrefs     ({ ... })                            → Prefs
```

**Public routes require no session and must be edge-cacheable:** `plan.getPublic`, `/p/[slug]`, `/api/og/[slug]`.

### 5.1 Caching the public page correctly (FIX-8)

v1.0 said "edge-cached" and "guest RSVP" without reconciling them. A cached page plus a mutation is a stale-data bug: the second guest to RSVP sees a page that doesn't include the first.

> **Split the page.** Server-render and edge-cache the *static shell* — title, date, location, cover, host. Fetch the *attendee list and RSVP state client-side* on mount, uncached. The shell is what needs sub-1s LCP; the list is small and can arrive 200ms later.

Revalidate the shell on plan edit via an on-demand `revalidateTag(slug)` call.

### 5.2 Rate limits — required before any public link is shared (FIX-9)

Every unauthenticated route is an abuse vector, and two of them cost real money. Redis-backed, keyed by IP **and** by target resource:

| Route | Limit | Why |
|---|---|---|
| `auth.requestOtp` | 3/hour per phone, 10/hour per IP | Each OTP is a paid SMS. This is a direct billing-attack vector |
| `plan.rsvp` (guest) | 5/hour per IP per slug | Otherwise anyone with a link can flood the attendee list |
| `group.joinByCode` | 10/hour per IP | Prevents brute-forcing join codes |
| `plan.getPublic` | 60/min per IP | Scraping |
| `poke.send` | 1/week per sender, 2/week per recipient | Enforced in the dispatcher, not just the UI |

**Do not defer these to "before launch."** The moment the first invite link leaves your hands, they are load-bearing.

### 5.3 Additional required procedures (FIX-11)

Missing from v1.0 and legally required under PIPEDA. Also an App Store requirement the moment you ship native shells at M6, so building them now avoids a rejection later.

```ts
me.exportData            ()                                   → { downloadUrl }
   // JSON of all rows referencing this user. Async, emailed/SMS'd when ready.
me.deleteAccount         ({ confirmPhrase })                  → { ok }
   // Hard-deletes app_user; cascades everywhere. Anonymizes authored messages
   // and plans (created_by → a tombstone user) rather than orphaning groups.
group.delete             ({ groupId })                        → { ok }
   // Admin only. Soft-delete via grp.deleted_at, hard-purge after 30 days.
```

---

## 6. Worker jobs

| Job | Schedule | Behaviour |
|---|---|---|
| `calendar_sync` | Every 6h per connected user | Google FreeBusy for next 21 days → **replace** `busy_block` for the fetched window (delete-then-insert in one transaction; there is no natural key to upsert on — X-10). **Writes `busy_block` only.** It does not write `signal_night`: that path is structurally impossible, since `signal_night.signal_id` is NOT NULL and a soft night would need a parent signal, which the non-signalling members it describes do not have. Pre-fill is a read path — `signal.getDraft` (ADR-0007, X-5) |
| `signal_dispatch` | Hourly | For each group, find members at local `signal_hour` on `signal_dow` with no signal for this `week_start_date`. Respect `cadence_weeks`. Route through the dispatcher. Idempotency key: `signal:{user_id}:{week_start_date}` |
| `overlap_precompute` | On signal write **and at 00:05 group-local daily** | Recompute and cache `overlap:{group_id}`. **FIX-5: TTL must expire at the next local midnight, not a fixed 6h.** Freshness downgrades (§4.0) are date-dependent, so a 6h TTL set at 22:00 would serve yesterday's confirmed nights well into the next day |
| `nudge_evaluator` | Daily 17:00 local | If ≥3 confirmed free on an upcoming night, no plan exists, and no poke sent this group-week → dispatch to rotating member |
| `occasion_scan` | Daily 09:00 | v2 |
| `attendance_prompt` | Hourly | For plans past `ends_at` with ≥3 going and no `attendance_confirmed_at`, send in-app (not push) "did you make it?". `ends_at` is now NOT NULL (FIX-10), defaulted to `starts_at + 4h` at write time. Fire between 9am and 9pm local only; stop asking after 72h |

---

## 7. Notification dispatcher

Single chokepoint. Nothing sends a message except through this.

```ts
async function dispatch(input: {
  userId: string;
  kind: 'signal'|'invite'|'starting_soon'|'poke'|'nudge';
  rank: 1|2|3|4|5;
  idempotencyKey: string;
  payload: NotificationPayload;
}): Promise<'sent' | 'dropped'>
```

Logic:
1. If `idempotencyKey` already in `notification_log` → return (no double-send).
2. **Budget check with a reserved slot (FIX-3).**

   > **v1.0 of this spec had a bug that would have silently disabled the retention mechanic.** It checked the 4-per-week budget *before* considering rank. A user in three active groups could receive four plan invites Thursday through Saturday, exhaust the budget, and then have their Sunday Signal dropped — the one notification the master doc says must never be crowded out. The product's core loop would fail for exactly the most engaged users, and it would fail invisibly.

   Corrected rule:
   ```
   if kind == 'signal':
       send always. Never counted against the budget, never dropped.
   else:
       count non-signal sends in the trailing 7 days
       if count >= 3:  →  drop with dropped_reason='budget_exceeded'
   ```
   Effective ceiling stays at 4 per week: 3 discretionary + 1 permanently reserved for the Signal.

3. `kind='nudge'` → check no poke exists for this group-week; if one does, drop with `dropped_reason='superseded_by_poke'`.
4. **Ranked pre-emption.** When multiple sends compete in the same window, a higher-ranked one may drop a not-yet-delivered lower-ranked one. An invite (rank 2) beats a nudge (rank 5).
5. Channel selection: SMS if no active web-push subscription, else web push. **SMS is the default, not the fallback (A3).**
6. Insert log row with `dispatched_at`. Update `delivered_at` from the provider webhook, `opened_at` from the link click, `completed_at` from the resulting action. **(INV-6)**

**Required test (must exist before Sprint 5 is done):** a user who has received 4 invites in the trailing 7 days still receives their Sunday Signal.

---

## 8. Design tokens

```css
:root {
  --bg:            #0F0F11;
  --surface:       #17171A;
  --surface-raised:#1F1F23;
  --border:        #2A2A2F;
  --text:          #F2F2F0;
  --text-muted:    #8A8A93;
  --accent:        #E4572E;   /* single action colour */

  /* Heatmap — saturation carries the data. Never colour alone (a11y). */
  --heat-0: #17171A;
  --heat-1: #1E2A2E;
  --heat-2: #244049;
  --heat-3: #2B5A66;
  --heat-4: #337A85;
  --heat-5: #3E9CA6;

  /* Soft availability renders hatched, never as a heat step */
  --soft-stroke: #3A3A42;

  /* Vibe — warm, never traffic-light semantics */
  --vibe-expansive: #E8B44A;
  --vibe-lowkey:    #7E9CC7;
  --vibe-slammed:   #8A8A93;
  --vibe-away:      #6E6E78;

  --radius: 14px;
  --font-ui: 'Inter', system-ui, sans-serif;
  --font-display: 'Instrument Serif', Georgia, serif; /* plan titles, invites */
}
```

Rules: dark mode is the default and only theme for v1. Every heat step must be paired with a numeric label. WCAG AA on all text. Motion is used in exactly two places — the heatmap reveal after signal submit, and RSVP confirmation.

---

## 9. Copy strings

Put these in `lib/copy.ts`. The voice is the funniest organized person in the group chat: dry, warm, never a brand.

```ts
export const copy = {
  signalPush:      "Signal time. How's your week looking?",
  signalPushSms:   "Overlap: signal time. How's the next few weeks looking? {link}",
  vibeLabels: {
    down_for_anything: "Down for anything",
    low_key:           "Low-key only",
    slammed:           "Slammed",
    broke:             "Broke this week",
    out_of_town:       "Out of town",
  },
  headline:        "{weekday} the {day} — {n} of {m} free",
  headlineBand:    "{weekday} the {day} — {n} of {m} free. The group is leaning {band}.",
  softHint:        "No conflict on their calendar, but they haven't confirmed.",
  belowThreshold:  "Overlap works once 3 of you are in. {n} to go.",
  noOverlap:       "Nothing lines up in the next three weeks. That's useful to know too.",
  signalledCount:  "{n} of {m} signalled",
  pokeSend:        "Nudge {name}",
  pokeReceived:    "{sender} wants you in on {weekday}.",
  pokeMuted:       "{name} is heads-down until {date}",
  nudge:           "{weekday} is wide open for {n} of you. Want to start something?",
  rsvpPrompt:      "Are you in?",
  postSignup:      "Want to see when this group is free next?",
  attendanceCheck: "Did you make it?",
  calendarConsent: "We only ever see when you're busy — never what you're doing.",
};
```

---

## 10. Environment variables

```bash
# Web
DATABASE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_MESSAGING_SERVICE_SID=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
CALENDAR_TOKEN_ENCRYPTION_KEY=      # 32-byte, for refresh token at rest
NEXT_PUBLIC_POSTHOG_KEY=
SENTRY_DSN=
NEXT_PUBLIC_APP_URL=

# Worker
DATABASE_URL=
UPSTASH_REDIS_REST_URL=
WORKER_SHARED_SECRET=               # worker → web internal calls
```

---

## 11. Analytics events

Minimum set to answer the M5 gate. PostHog.

```
signal_dispatched   { user_id, group_id, channel, week_start }
signal_delivered    { user_id, channel }
signal_opened       { user_id }
signal_completed    { user_id, seconds_to_complete, nights_confirmed, horizon_weeks_touched }
heatmap_viewed      { group_id, confirmed_count, soft_count }
plan_created        { group_id, from_heatmap: bool, days_ahead, is_home_hang }
invite_viewed       { slug, authed: bool }
rsvp_submitted      { slug, status, was_guest: bool }
attendance_confirmed{ plan_id, method }
poke_sent           { group_id, sender, recipient }
poke_converted      { recipient, minutes_to_signal }
calendar_connected  { provider }
calendar_revoked    { provider }
notification_dropped{ user_id, kind, reason }
```

**Required dashboard:** W1–W8 Signal Completion by cohort, **always plotted against Signal Delivery Rate.** A completion figure without its delivery figure is not a result.

---

## 12. Definition of done (per sprint)

> **Two gates, not one (ADR-0007, X-20).** Each box below is either
> **code-complete** (built, unit + integration tested, merged — blocks the next
> ticket) or **verified-live** (exercised against real infrastructure on a real
> device — blocks *the pilot*, not the next ticket). Sprints 1 and 2 are
> code-complete while their verified-live boxes wait on Twilio, and work
> correctly proceeds past them. The rule that keeps this honest: **no
> verified-live box may still be open when M4 (pilot start) is declared.**
> Open ones are tracked in `implementation-audit.md`'s Open Items table.

**Sprint 1 — Foundations**
- [ ] `app_user.id` references `auth.users(id)`; a verified OTP produces exactly one app_user row (FIX-1)
- [ ] Two phones can OTP-login, one creates a group, the other joins by code
- [ ] `auth.requestOtp` rate limit active before any real phone number is used (FIX-9)
- [ ] Drizzle migrations run clean from empty DB
- [ ] INV-1 trigger exists and test OV-6 passes
- [ ] CI runs lint + typecheck + unit tests on every push

**Sprint 2 — Signal + Heatmap**
- [ ] Signal submits in < 10s median on a real phone, no keyboard required
- [ ] Three-week horizon renders; weeks 1–2 pre-filled from prior signal
- [ ] All 10 overlap unit tests pass, plus the 8 signal-resolution tests RS-1..RS-8 (FIX-2, FIX-13)
- [ ] `resolveSignals()` exists as a separate function and is unit-tested independently of `computeOverlap()`
- [ ] Confirmed vs soft are visually distinguishable at a glance
- [ ] Below 3 signalled members, group shows `belowThreshold` copy, not a broken grid

**Sprint 3 — Calendar**
- [ ] Google OAuth connects using FreeBusy scope only
- [ ] Sync writes only `blocked` / `no_known_conflict`; attempting `confirmed_free` throws
- [ ] Disconnect purges `busy_block` rows immediately
- [ ] Conflict detection ≥ 90% precision on a manually verified week

**Sprint 4 — Plans + Invites**
- [ ] Plan created from a heatmap night in ≤ 3 taps
- [ ] `/p/[slug]` renders unauthenticated, LCP < 1s on throttled 4G
- [ ] OG image renders correctly in a real iMessage send
- [ ] Guest RSVP works with first name only
- [ ] `is_home_hang` captured on every plan

**Sprint 5 — Loop**
- [ ] Sunday dispatch fires correctly across two timezones
- [ ] SMS delivers end-to-end; web push delivers where subscribed
- [ ] INV-5 holds: a user with 3 discretionary sends receives no 4th
- [ ] **A user with 4 invites in the trailing week still receives their Sunday Signal (FIX-3)**
- [ ] All four notification lifecycle events log
- [ ] PostHog dashboard live and populated

---

## 13. Out of scope for v1 — do not build

Someday List · gifting · Stripe · venue suggestions · Recap cards · occasions · recurring plans · native apps · group chat outside a plan · any feed · follower graph · read receipts · location tracking · dark/light toggle · i18n · admin panel

If the agent finds itself building any of these, it has drifted. Stop and re-read this section.
