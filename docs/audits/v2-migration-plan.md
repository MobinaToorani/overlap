# v2 Migration Plan

**Phase 0 deliverable. No code was changed to produce this.**
**Date:** 2026-09-18
**Subject:** `docs/engineering-spec-v2.md` (664 lines) against the repo at `b4b6b60`.
**Method:** every claim below was checked against the file, and the database claims against the live Supabase instance named by `DATABASE_URL`. Line numbers are from the files as they stand today.

The audit is section by section. Nine items could not be settled by reading and are collected at the end; **five of them block a phase**, and two of those are the first thing I would want answered.

---

## The state of the database, first, because it decides how destructive Phase 1 may be

Queried live, read-only, 2026-09-18:

| Table | Rows |
|---|---|
| `app_user` | **1** |
| `grp`, `group_member`, `signal`, `signal_night`, `plan`, `rsvp`, `message`, `notification_log`, `poke`, `someday_item`, `busy_block`, `calendar_connection` | **0** |

`SELECT state, count(*) FROM signal_night GROUP BY 1` returns nothing. There are **no `no_known_conflict` rows to migrate**, no plans, no RSVPs. Every destructive change v2 asks for — narrowing `night_state_t`, dropping `someday_item`, replacing `notification_log`, narrowing `plan_status_t` — costs nothing but that one `app_user` row.

Also confirmed, and it matters for INV-1: **`SELECT rolname FROM pg_roles WHERE rolname = 'overlap_worker'` returns nothing.** The role has never been created, because `migrate.ts:36-51` skips it when `OVERLAP_WORKER_DB_PASSWORD` is unset and only warns. `implementation-audit.md` (IMP-7) and the backlog both carry this as open; it is still open.

---

## §0 Invariants

**Satisfied.** INV-2, INV-3, INV-4 are enforced in `apps/web/src/server/services/overlap.ts` — `CONFIRMED_COHORT_FLOOR` at line 47, `BAND_FLOOR` at 57, `VISIBLE_VIBES` at 59 stripping `broke` before either branch. Tests OV-3, OV-4 and the headline-wording tests cover them. INV-8 is two partial unique indexes (`schema.ts:170-176`), proven live.

**Contradicts.**
- v2 §0's preamble says `verify:invariants` "fails CI if any of **the eight** is missing", and the table beneath it lists **nine** (INV-9 is new — the send-path import rule). Open question 6.
- INV-1's enforcement changes shape. Today it is a dynamic trigger on a `written_by` value (`sql/0001_guard_invariants.sql:6-22`) plus a second trigger on `current_user` (54-65). v2 §3.2 makes `written_by` a static `CHECK (written_by = 'user')` and switches the role test to `session_user`. `session_user` is the better choice — `current_user` changes under `SECURITY DEFINER`, `session_user` does not — but the combination has a hole. Open question 2.
- INV-6 changes the budget from 4 to **3 discretionary**, and v1.5's INV-5 (the old budget rule) becomes v2's INV-6 while v2's INV-5 is a new "signal is never dropped" rule. The numbers move under the names.

**Missing.** INV-5, INV-6, INV-9 have no test and no enforcement point in the repo at all — the dispatcher does not exist. `traceability.md:INV-5/INV-6` is already honest about this. `pnpm verify:invariants` does not exist; no test in the suite is named `INV-n:` in the form v2 requires, though four in `liveDb.test.ts` come close (`INV-1: …`, `INV-8: …`).

---

## §1 Technology

**Satisfied.** Next.js 15.5.25, tRPC v11.18, Drizzle 0.36.4, Tailwind v4, Vitest 2.1.8, pnpm workspaces (`pnpm-workspace.yaml`), TypeScript strict.

**Contradicts.**
- `.nvmrc` pins **20**; root `package.json` `engines.node` says `>=20.9.0`. v2 says Node 22 LTS.
- `apps/web/package.json` depends on `@upstash/ratelimit` and `@upstash/redis`. v2 removes Redis.
- `packages/shared/package.json`'s description still reads "shared between the Next.js app and **the Python worker's HTTP contract**". v2 has no Python and no HTTP between the two (§10: "make no HTTP calls to each other").

**Missing.** `pg-boss` is not a dependency. No `apps/worker` package exists — `apps/worker/` contains exactly one file, `README.md`. **There is no Python to delete**; the "delete the Python worker" step is a README and two empty directories, not a port.

**Note on the test tier.** §1 says integration tests run "against a Postgres **testcontainer**". Today tier 3 (`apps/web/tests/integration/liveDb.test.ts`) runs against live Supabase via `DATABASE_URL` and skips when unset; CI skips all 11. Moving to testcontainers is a new dependency and a CI change. Open question 8.

---

## §2 Repository

**Satisfied.** `apps/web` matches the tree closely: `app/(auth)/login/`, `app/(app)/g/[groupId]/`, `app/(app)/signal/`, `app/(app)/me/`, `server/trpc/routers/`, `server/db/`, `lib/`.

**Missing.** `packages/core` does not exist. `app/p/[slug]/`, `app/api/og/[slug]/`, `app/api/webhooks/twilio/status/`, `app/api/webhooks/google/revoke/`, `app/n/[token]/`, `components/plan/` — none exist.

**Contradicts — and this is the one place the task brief is wrong.** The brief says of `services/overlap.ts` and `services/signals.ts`: *"they are already pure."* Half true, and the half that is false shapes Phase 2:

- `services/signals.ts` is genuinely clean. Its only imports are types from `@overlap/shared` (lines 33-38). It can move as-is.
- `services/overlap.ts` imports **`@/lib/copy`** (line 38) and **`@/lib/dateUtils`** (line 39). Both are `apps/web` paths, which §2's rule forbids in `packages/core`.
- `services/draft.ts:32` imports `@/lib/dateUtils` too.

`dateUtils` is easy — v2 §2 already gives it a home at `packages/core/src/time/`. `copy` is not: `computeOverlap` builds `headline` (overlap.ts:171-189) out of `copy.headline`, `copy.headlineBand` and `copy.bandClauses`, while §9 requires those strings to live in `lib/copy.ts` and `verify:docs` is to assert they are there **verbatim**. Open question 3.

---

## §3 Data model

### §3.1 Calendar authority

**Missing entirely.** `grp` has no `timezone` column (`schema.ts:73-95`). `app_user.timezone` exists (line 68) and defaults to `'America/Toronto'` — v2 wants `'UTC'`. Everything currently derives dates from `app_user.timezone` or from the server's clock: `dateUtils.ts:85 localDateInTimeZone`, and `horizonDates(today, …)` in `overlap.ts:103` takes a `Date` with no zone at all.

`grp.timezone` was already decided — ADR-0007 X-7 accepted it and `traceability.md` carries it — and never built. v2 is the second document to ask for it.

### §3.2 DDL — table by table

| v2 table | State today | Work |
|---|---|---|
| `app_user` | `schema.ts:61-71` | `phone_e164` is `NOT NULL`; v2 needs NULL for the tombstone. Add `deleted_at`. Default timezone `UTC`. Add the tombstone row in a migration. |
| `grp` | `schema.ts:73-95` | **Add `timezone`** (NOT NULL, no default — every existing row needs a value). **Drop `cadence_weeks`** and its `cadence_weeks_check`. Add the `signal_dow`/`signal_hour` CHECKs, which v2 states and the current schema omits. `created_by` needs `ON DELETE RESTRICT`; today it is bare (`schema.ts:77-79`). |
| `group_member` | `schema.ts:97-112` | Matches. |
| `calendar_connection` | `schema.ts:114-132` | `refresh_token_encrypted` is `text`; v2 says `bytea`. `sync_status` is `text`; v2 wants the `sync_status_t` enum. Add `last_error`. Add the `provider IN ('google')` CHECK. |
| `busy_block` | `schema.ts:135-153` | Drop `source` (no producer in v2). Add `synced_at`. Add `CHECK (ends_at > starts_at)`. Index narrows to `(user_id, starts_at)`. |
| `signal` | `schema.ts:155-177` | Add `idx_signal_user_submitted` — v2 §4.1 resolution reads by `submitted_at`, and there is no index for it. Both partial uniques already correct. |
| `signal_night` | `schema.ts:179-202` | **Largest change.** Drop `id` (PK becomes `(signal_id, date)`), drop `horizon_week` + its CHECK, **drop `confirmed_at`**, add `prefilled`, add `CHECK (written_by = 'user')`. Narrow `night_state_t` to two values. |
| `plan` | `schema.ts:204-225` | Drop `'draft'` from `plan_status_t` (zero rows). `created_by` → `ON DELETE RESTRICT`. `is_home_hang` default removed; v2 computes it at write time. Add `CHECK (ends_at > starts_at)`, `idx_plan_group_starts`. |
| `rsvp` | `schema.ts:227-246` | **Add `guest_token`.** Replace the loose `rsvp_user_or_guest_check` (line 241-244) with v2's stricter XOR form. Add `uq_rsvp_user` and `uq_rsvp_guest`. This is X-8, accepted in ADR-0007 and tracked in `traceability.md:108` as ⬜ "before T13" — still unbuilt, and v2 folds it in. |
| `message` | `schema.ts:248-259` | Add the length CHECK and the body-or-attachment CHECK. `author_id` → RESTRICT. |
| `push_subscription` | **absent** | New. |
| `notification` | **absent**; `notification_log` at `schema.ts:262-282` | Replace. Zero rows, so a drop-and-create is honest. Eleven columns are new (`status`, `reason`, `not_before`, `click_token`, `payload`, `attempts`, `provider_ref`, …). |
| `rate_limit_hit` + `rate_limit_check()` | **absent** | New. |
| `poke` | `schema.ts:284-303` | Index renames `idx_poke_rate` → `idx_poke_recipient`. `sender_id` → RESTRICT. |
| `someday_item` | `schema.ts:307-319` | **Delete.** Zero rows. |

**A defect in §3.2 as written:** the `GRANT` block sits immediately after `signal_night` and names `plan`, `rsvp` and `notification`, all of which are created **later in the same listing**. Transcribed in document order it fails. Recorded under "Decisions I made".

### §3.3 Status machines
**Missing.** No status machine exists as a function anywhere. `plan.status` has no transitions in code (no `plan` router at all); `sync_status` is a bare `text` column nothing writes.

### §3.4 Deletion
**Missing.** `me.deleteAccount` does not exist. Step 4 ("DELETE FROM auth.users via the service role") needs `SUPABASE_SERVICE_ROLE_KEY`. The `ON DELETE RESTRICT` clauses that make step 1 fail loudly are absent from `plan.created_by`, `message.author_id`, `poke.sender_id`, `grp.created_by` today — all four are plain references.

### §3.5 Group deletion
**Partially satisfied.** `grp.deleted_at` exists (`schema.ts:91`). Nothing filters on it — `group.listMine` and `group.get` do not. No hard-delete job.

### §3.6 Data access
**Satisfied in practice, undocumented as a decision.** `implementation-audit.md` records RLS being probed empirically: on for all 13 tables, zero policies, deny-all, verified against the live project with the anon key. All data already goes through tRPC on the service-role connection. v2 wants this stated as ADR-0010 and backed by a lint rule.
**Missing.** No lint rule against `supabase.from(`. Current client Supabase usage is auth-only (`lib/supabase/server.ts`, `lib/supabase/middleware.ts`) so the rule would pass today — which is the right moment to add it.

---

## §4 The engine

### §4.1 One resolution rule
**Contradicts, deliberately.** `services/signals.ts:111-125` implements Rule A — scoped shadows global *per week*, before any time comparison. v2 deletes Rule A: scoped and global compete on `submitted_at` alone. The `scopedByWeek` / `globalByWeek` maps and the `effectiveSignals` collapse (lines 112-125) all go; what remains is the sort at line 130 and the first-claim-wins loop at 133-135, which is already v2's rule.

The header comment (lines 9-11) and RS-1 both assert Rule A explicitly. Both are wrong under v2 and must be rewritten, not patched.

**Note.** v2 §4.1 says the input is signals "submitted in the last 14 days". Nothing in `resolveSignals` filters by that today; it relies on the caller's query. v2 §4.2 says the same ("mostly enforced by the query and asserted by the resolver"). Fine, but it means the resolver must still drop ≥14d nights itself — `signals.ts:164` already does.

### §4.2 Freshness
**Contradicts.** `freshnessThresholds(cadenceWeeks)` (`signals.ts:62-68`) derives both windows from `cadence_weeks`. v2 drops the column and flattens to 7/14. The function collapses to two constants. Its 12-line justification (lines 42-60) documents FIX-13 and X-1's coupling — that reasoning belongs in ADR-0009, not in the new code, per the brief's comment rule.

The three stages themselves (fresh / lapsed / dropped, `signals.ts:158-170`) already match v2's table exactly. Only the window derivation changes.

### §4.3 Soft availability
**Contradicts structurally.** Today `no_known_conflict` is a **stored enum value** that `resolveSignals` passes through and `computeOverlap` counts at `overlap.ts:121-122`. v2 derives soft at read time from `busy_block`, outside the resolver, and passes it to `computeOverlap` as a separate `soft: Map<string, Set<string>>` argument.

Nothing derives soft availability from `busy_block` anywhere in the repo today. This is net-new logic, and v2 §4.3's rule — "a member who signalled and did not tap a night is **not** soft for it" — is the same call ADR-0007 X-5 made. Consistent; good.

### §4.4 `computeOverlap`
**Satisfied.** No cache exists. There is no `overlap:{group}` key, no precompute job, nothing to delete — `grep -r "overlap:" --include='*.ts'` finds nothing. The brief's item 3 is already true.

**Contradicts.** `NightOverlap.totalMembers` (`overlap.ts:164`) is `memberCount` in v2 §4.4. `vibeBand` is gated at `BAND_FLOOR = 3` (line 57) which matches v2's "null if confirmed < 3".

**A regression v2 would introduce.** v2 §4.4's signature is `{ groupId, todayGroupLocal, members, resolved, soft }` — it has **no `signalledUserIds`** — yet `GroupOverlap` still returns `signalledCount` ("members with a fresh (<7d) signal") and `isLive`. Deriving that from `resolved` is precisely defect **IMP-3**: a member who signalled "slammed, no free nights" has zero rows in `resolved` and would be counted as not having signalled. That under-reports `signalledCount`, can drop a group below the liveness floor while everyone has in fact signalled, and under-counts the M5 gate metric — the audit's words, and it was found by running the thing. `overlap.ts:88-99` carries a nine-line comment explaining why the argument is separate. Open question 4.

### §4.5 Required tests
**The renumbering is the risk here.** v2 reuses RS-1..RS-8 and OV-6/OV-8 for different assertions:

| ID | Today | v2 §4.5 |
|---|---|---|
| RS-1 | scoped wins over global for the week (Rule A) | scoped **newer** than global wins |
| RS-2 | overlapping horizons, newest wins | global **newer** than scoped wins — *the opposite of Rule A* |
| RS-3 | 9-day-old confirmation downgraded | two weeks overlap, newer wins per date |
| RS-4 | no signal → not counted | no signal → not in map (unchanged in spirit) |
| RS-5 | abandoned signal decays in every week | 7-day boundary from both sides |
| RS-6 | past the second cycle, dropped | 14-day boundary from both sides |
| RS-7 | **a fortnightly group is not stale for answering fortnightly** | stale `blocked` dropped |
| RS-8 | the drop stage clears stale `blocked` | a `prefilled` night is fresh |

Five IDs change meaning while keeping their names, and **RS-7 disappears as a concept** — it tests `cadence_weeks`, which v2 deletes. `traceability.md` cites these IDs by name and `verify:docs` asserts they exist in the suite, so both stay green through a silent semantic swap. Open question 5.

OV-6 moves from "sync may not write `confirmed_free`" to "worker role INSERT/UPDATE/DELETE on `signal_night` raises" — **which cannot run until `overlap_worker` exists** (open question 2). OV-8 moves from "two timezones bucket onto the same night" to a 23:30-UTC/`America/Los_Angeles` boundary test. OV-11 and NP-1..NP-6 are new.

---

## §5 API

Twelve procedures exist; v2 specifies **thirty-four**.

**Satisfied:** `auth.requestOtp`, `auth.verifyOtp`, `me.get`, `me.updateProfile`, `group.create`, `group.joinByCode`, `group.listMine`, `group.get`, `group.overlap`, `signal.getCurrent`, `signal.getDraft`, `signal.submit`.

**Missing (22):** `me.notificationPrefs`, `me.registerPush`, `me.exportData`, `me.deleteAccount`, `group.shareCard`, `group.leave`, `group.updateSettings`, `group.delete`, all seven `plan.*`, both `plan.getPublic`/`plan.rsvp`, both `calendar.*`, both `poke.*`.

**Contradicts.** v2 requires authorization as middleware — `userProcedure`, `groupMemberProcedure`, `groupAdminProcedure`. `trpc/trpc.ts` has only `publicProcedure` (line 8) and `protectedProcedure` (line 11); membership is checked inline in each group procedure. There is no `admin` concept in any procedure, though `member_role_t` exists in the schema.

**§5.3 rate limits.** `rateLimiters.ts` defines four buckets against v2's six. `otp:phone` 3/hour and `join:ip` 10/hour match; `otp:ip` 10/hour matches. Missing: `rsvp:ip:{slug}`, `public:ip` 60/min, both `poke:*`. The extra `otpVerifyByPhone` (10/hour, `rateLimiters.ts:31`) is **IMP-10** and is not in v2's table — v2 would silently drop a hardening fix that closed a brute-force hole on a 6-digit code. Recorded under "Decisions I made": keep it.

`rateLimit.ts:33-53`'s in-memory fallback is removed by v2 §5.3, which is the correct call and closes **IMP-11** — the audit measured it as providing "approximately no protection in any real deployment". Postgres `rate_limit_check()` replaces it and, unlike Upstash, needs no new credential.

---

## §6 Worker jobs
**Missing entirely.** No worker, no pg-boss, no job. `apps/worker/README.md` is the whole of it. All six jobs are new. No `overlapPrecompute` exists to delete — §6's "There is no `overlapPrecompute`" is already true.

## §7 Notifications
**Missing entirely.** `notification_log` (`schema.ts:262-282`) is a log table with no writer; v2's `notification` is an outbox with a status machine. `decideDelivery()` does not exist. Nothing sends anything. INV-9's grep test has nothing to guard yet, which makes it cheap to add now and expensive to add later.

## §8 Design tokens
**Mostly satisfied.** Dark only; `Heatmap.tsx` renders numeric labels per cell and hatches soft. **Contradicts:** heat steps map to absolute count today, not `confirmedCount / memberCount` in fifths — the deviation is already noted in the backlog's T7 row and in `implementation-audit.md`'s open items. v2 settles it; the heatmap needs the change.

## §9 Copy
`lib/copy.ts` has 20 keys. **Missing:** `digest`, `signalPushMulti`. `lapsedHint` exists (line 35) but reads `'They said yes to this night, but not in the last week.'` while v2 specifies `"Said yes a while ago — tap to reconfirm."` — a **verbatim** mismatch that the new `verify:docs` check would fail on. One of the two must move; v2 wins by precedence.

## §10 Environment
**Contradicts.** `UPSTASH_REDIS_REST_URL` / `_TOKEN` are read at `rateLimit.ts:67-68` and must go. **Missing:** everything Twilio, VAPID, Google OAuth, `CALENDAR_TOKEN_ENCRYPTION_KEY`, `WORKER_DATABASE_URL`, `SENTRY_DSN`. `OVERLAP_WORKER_DB_PASSWORD` is read by `migrate.ts:36` and is not in v2 §10's list, though v2 still needs the role to have a password.

## §11 Analytics
`lib/analytics.ts` is a 46-line seam with no PostHog behind it. The v2 split (`notification_deferred` vs `notification_dropped`) has nothing to split yet.

## §12 Definition of done
Milestone A is pilot-blocking and **reorders v1.5's sprints** — calendar moves behind the loop. Nothing in Milestone A is verified-live today; six backlog rows sit at 🟡 for exactly that reason. Two items are blocked on external queues that no amount of code clears: Twilio A2P (1-4 weeks, can be rejected) and, for Milestone B, Google OAuth verification (2-6 weeks).

## §13 Out of scope
**Satisfied.** `someday_item` is the only §13 item with any surface in the repo, and v2 deletes it. No pokes beyond the schema table. No i18n, no light theme, no native.

---

## Decisions I made

Recorded because v2 is silent on each, and I took the boring option.

1. **GRANT ordering.** v2 §3.2's grant block names `plan`, `rsvp` and `notification` before those tables are created. I will emit all `GRANT` statements after the last `CREATE TABLE` rather than reproduce the document's order. No behaviour change; the listing simply cannot run as written.
2. **Keep `otpVerifyByPhone` (10/hour).** It is IMP-10, it closes brute-forcing of a 6-digit code, and v2 §5.3's table omits it. Dropping a hardening fix because a table was written without it is the wrong direction. It will appear in the §5.3 table when I rewrite the spec.
3. **`packages/core` depends on `@overlap/shared` and nothing else.** Shared keeps the zod schemas and constants both apps already import; core gets the pure logic. Two packages, not one, because shared is imported by client components and core never should be.
4. **`busy_block.source` is dropped.** v2's DDL omits it and no v2 code path writes anything but calendar data. Per "prefer deletion".
5. **`signal_night.id` is dropped in favour of the natural key `(signal_id, date)`.** v2's DDL specifies that PK. The existing `signal_night_signal_date_uq` unique index becomes redundant and goes with it.
6. **Node 22 everywhere in one commit** — `.nvmrc`, root `engines`, CI's `node-version-file` already reads `.nvmrc` so it follows automatically.
7. **`app_user.timezone` default becomes `'UTC'`,** per v2's DDL, replacing `'America/Toronto'`. First-run capture already overwrites it (T25), so the default is only ever a placeholder.
8. **Test IDs for genuinely new tests continue the existing sequence** (OV-11, NP-1..NP-6) rather than reusing a retired number. This is the same rule `docs/adr/README.md` states for ADRs. It does **not** resolve the RS renumbering, which is open question 5.
9. **`verify:invariants` will be a separate script**, not folded into `verify:docs`, because v2 §0 names it as its own command and the DoD lists it separately.

---

## Open questions for Mobina

Five block a phase. Two I would answer before anything else.

**1. ADR-0008 is double-booked, and I created the collision yesterday.** *(blocks Phase 5)*
v2 §3.1 cites **ADR-0008** for "the group is the calendar authority", and the brief asks for ADRs 0008-0012. But `docs/adr/0008-openspec-as-the-planning-layer.md` already exists — I wrote it, it is committed at `b4b6b60`, and it is in open PR #1. `docs/adr/README.md` says ADRs are "numbered sequentially, never renumbered or deleted".
Options: (a) v2's five ADRs become **0009-0013** and I edit §3.1's citation — cheapest, and the OpenSpec ADR keeps a number people may already have read; (b) renumber the OpenSpec ADR to 0013 while PR #1 is still open and unmerged, keeping v2's numbering exactly as the spec prints it. **I recommend (a).** Tell me which.

**2. INV-1 cannot be enforced as v2 states it, for two separate reasons.** *(blocks Phase 1, and OV-6)*
v2 §0: "written only by `signal.submit` on behalf of a session user. **No job, sync, or backfill may write it.**"
- (a) The `overlap_worker` role **does not exist in the live database** — verified above. v2 leans harder on it than v1.5 did, because making `written_by` a static `CHECK (written_by = 'user')` turns that column into a constant and removes it as a discriminator. The role plus the `session_user` trigger become the entire enforcement. I need `OVERLAP_WORKER_DB_PASSWORD` to create it, and OV-6 as v2 rewrites it cannot pass until it exists.
- (b) Even with the role, the guard only refuses `session_user = 'overlap_worker'`. **A backfill run as the service role still writes `confirmed_free` freely**, which the invariant's own prose forbids. v1.5 had the same hole and papered it with `written_by`; v2 removes the paper. Do you want the trigger to allowlist instead (refuse unless `session_user` is the web role), or is service-role write an accepted gap stated in ADR-0010?

**3. `computeOverlap` cannot build its headline inside `packages/core`.** *(blocks Phase 2)*
`overlap.ts:171-189` composes `headline` from `copy.headline`, `copy.headlineBand` and `copy.bandClauses`. §2 forbids `packages/core` importing from `apps/`; §9 requires those strings to live in `lib/copy.ts` and be checked there verbatim. Three ways out: (a) move the copy table to `packages/shared` and have `lib/copy.ts` re-export it, pointing the §9 check at the shared file; (b) `computeOverlap` returns structured headline data (`{ weekday, day, n, m, band }`) and the web layer renders the sentence — cleanest separation, but changes `GroupOverlap.headline`'s type, which §4.4 pins to `string | null`; (c) pass the copy table in as an argument. **I lean (b)** — a pure engine should not be composing English — but it edits a type v2 states explicitly, so I am not choosing it unilaterally.

**4. v2 §4.4's signature would reintroduce IMP-3.** *(blocks Phase 2)*
The signature drops `signalledUserIds` but still returns `signalledCount` and `isLive`. The only remaining source is `resolved`, and deriving it from there is the exact defect IMP-3 recorded: a member who signals "slammed, zero free nights" vanishes from `resolved` and reads as not having signalled. It under-counts the M5 gate metric and can drop a group below the liveness floor while everyone has signalled. It was found by running the thing, not reading it. May I restore `signalledUserIds` (or an equivalent `freshSignallers: ReadonlySet<string>`) to the §4.4 signature?

**5. The RS test IDs are being silently remapped.** *(blocks Phase 2)*
Five of the eight change meaning while keeping their names, and RS-2 inverts. RS-7 stops existing as a concept — it tests `cadence_weeks`. `traceability.md` cites these by name and `verify:docs` only checks that a test with that name exists, so the swap passes every check while every historical reference silently now points at a different assertion. Do I (a) adopt v2's numbering as printed and accept that git history's RS-5 is not today's RS-5, or (b) retire RS-1..RS-8 and number the v2 set **RS-9..RS-16**, which costs a spec edit and keeps every past reference true? **I recommend (b)**, for the same reason ADRs are never renumbered.

There is already a live instance of this going wrong. `docs/audits/coherence-audit.md:114` proposes **`OV-11`** as "cohort of 3, two `broke` and one `low_key`, band must be identical to the band for a cohort of 1 `low_key`". v2 §4.5 line 449 assigns **`OV-11`** to "a member who signalled without tapping a night is not soft for it". Two different tests, one number, both written down as commitments. Nothing caught it because `verify:docs` skips `docs/audits/`. Whichever way you answer, one of these two needs a different number.

**6. §0 says eight invariants; the table lists nine.** *(blocks `verify:invariants`)*
INV-9 is new. I will write the check to require all nine and fix the prose — confirm that is right rather than INV-9 being a late addition you did not mean to make load-bearing.

**7. One migration journal versus a secret.** *(blocks Phase 1)*
`migrate.ts:36-42` substitutes `__OVERLAP_WORKER_PASSWORD__` into `sql/0001_guard_invariants.sql` at run time. Drizzle's migrator reads files verbatim and cannot do that. Collapsing into one journal therefore means the role's password cannot come from a migration. Boring option: the migration does `CREATE ROLE overlap_worker NOLOGIN` (no secret), and granting it a password becomes a one-time documented setup step in `founder-checklist.md`. Acceptable?

**8. Testcontainers.** *(blocks Phase 1's test work)*
§1 says integration tests run against a Postgres testcontainer; today they run against live Supabase and CI skips all 11. Testcontainers is a new dependency and a CI change, and it would make the live tier run in CI for the first time — a real gain. Is that in scope for this task, or do I keep `DATABASE_URL` and treat the testcontainer line as a later ticket?

**9. Phase 1 will delete your one `app_user` row.** *(blocks Phase 1)*
The cleanest Phase 1 is a single squashed baseline migration: the schema drift is large, the database is empty, and carrying eleven ALTERs for tables nobody has written to is ceremony. That means dropping and recreating the public schema on the live Supabase project, which destroys the one `app_user` row (and its `auth.users` row, if you want them consistent). Everything else is already zero. Confirm I may rebuild, or say the row matters and I will write incremental ALTERs instead.

**10. Committing `docs/engineering-spec-v2.md` turns CI red today.** *(blocks the Phase 0 commit)*
Line 449 cites `OV-11`, and `verify:docs`'s "cited test IDs exist" check asserts every `OV-`/`RS-` id named in `docs/` exists in the suite. `OV-11` will not exist until Phase 2 writes it. The check is doing its job — a forward-looking spec is exactly the thing it was not designed to hold.

I have therefore **left the v2 spec untracked for the Phase 0 commit** and committed only this plan. I think that is correct sequencing rather than a dodge: v2 is an input to Phase 0, and Phase 5 is the phase whose job is "replace `docs/engineering-spec.md` with v2" — by which point Phase 2 has written `OV-11` and the check passes with nothing exempted. If you would rather the spec sat in the repo from today, the alternative is a one-line exemption in `scripts/verify-docs.mjs` for a spec marked `Status: proposed`, which is a code change and so not mine to make inside Phase 0.

---

## What I would do first, given answers

Phase 1 is ready to start the moment questions 2, 7 and 9 are answered; questions 1, 3, 4, 5 gate Phases 2 and 5 but not Phase 1. Nothing in this plan required a code change, and none was made.
