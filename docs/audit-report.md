# Implementation Audit Report

**Period:** 2026-09-03 → 2026-09-04 (T1–T7)
**Scope:** everything built so far — repo scaffold, DB schema, auth, groups, the overlap engine, the Signal, the heatmap.
**Method:** four audit passes, each run *before* starting the next ticket. Findings only count here if they were demonstrated — by executing the code, querying the live database, or probing the deployed API — not by reading it and reasoning about it.

`engineering-spec.md` v1.1 referenced an `audit-report.md` covering the *document* audit that produced findings A1–A11 and FIX-1–FIX-12. That file was never in the repo. This is a different document: it records defects found in the **implementation**, and the two spec corrections that came out of them.

---

## Why this exists

Nine of the fourteen defects below were invisible to `lint`, `typecheck`, and a green test suite. Several were invisible to a *passing test of the exact function containing the bug*. The pattern is consistent enough to be worth stating plainly:

> Every defect that mattered was found by running the thing, not by reading it.

The corollary shaped how the tests are now structured — see [What changed in how this is tested](#what-changed-in-how-this-is-tested).

---

## Tier 1 — Would have produced visibly wrong behaviour for users

### IMP-1. Availability never decayed, so abandoned signals kept asserting hard confirmations
**Found:** product-logic re-read, 2026-09-04. **Status:** fixed; both specs corrected.

`resolveSignals` downgraded stale `confirmed_free` nights only when `horizon_week == 0`, per `engineering-spec.md` §4.0's literal rule. The consequence, demonstrated concretely:

> Alice signals on Sept 6, tapping nights across all three weeks, then never signals again. On **Sept 20** — a fortnight later — the heatmap still counts her as **confirmed free** for Sept 24, at full weight in the headline.

A two-week-old guess presented as a friend saying yes is exactly the over-reporting **A2** exists to prevent, and it meant skipping the ritual had no consequence at all — defeating the decay design in master doc §2.3d ("skip repeatedly and you fade out of the picture entirely").

This was a genuine conflict between the two spec documents rather than a coding mistake: the spec said week 0 only, the master doc said weeks two and three should read as unconfirmed. Both now describe one rule — **a confirmation older than 7 days stops counting, whichever week it sat in**. `engineering-spec.md` → v1.2, `overlap-master-doc.md` → v0.3, test RS-5.

### IMP-2. Signals were ordered by string comparison, so the wrong one could win
**Found:** overlap-engine audit. **Status:** fixed.

`resolveSignals` compared `submittedAt` lexicographically in two places while parsing it properly in a third. ISO 8601 only sorts lexicographically when every value shares one representation, so `...T08:00:00-04:00` (12:00Z) sorted *before* `...T10:00:00.000Z` (10:00Z) despite being two hours later.

Proven before fixing: a night resolved to **blocked** when the user's most recent Signal had tapped it **confirmed_free**. Silent — no error, just quietly wrong availability, which is the FIX-2 failure mode. Every existing fixture used `toISOString()` (uniformly `Z`), which is precisely why an otherwise-green suite never caught it.

### IMP-3. A member who signalled "nothing works this week" was counted as not having signalled
**Found:** live end-to-end test, T7. **Status:** fixed.

`group.overlap` fetched signals with an `INNER JOIN` to `signal_night`, so a signal with zero nights vanished entirely. Submitting "I'm slammed, no free nights" is a legitimate and product-important act — it's the whole point of the `Slammed` vibe for master doc §4.2's "Sam" persona.

Consequences: under-reported `signalledCount`; a group could drop back under the liveness floor while everyone had in fact signalled; and Signal Completion Rate — the **M5 gate metric** — would have under-counted exactly the busiest members. No unit test would have found this; it took submitting real signals through the real procedures against real Postgres.

### IMP-4. The ritual had no payoff
**Found:** product-logic re-read. **Status:** fixed.

Submitting the Signal navigated to `/g` — the group *list*. Master doc §2.3c: *"Every ritual must end in a reward. A ritual that ends in 'thanks, saved' is dead within three weeks."* §7.3 calls the heatmap reveal the most polished moment in the app. A list of group names is the "thanks, saved" ending, in the one place the retention model can least afford it.

---

## Tier 2 — Would have blocked or broken deployment

### IMP-5. The migration pipeline did not exist
**Found:** T1–T3 audit. **Status:** fixed.

Nobody had ever run `drizzle-kit generate`, so `migrations/` was empty. `pnpm db:migrate` would have applied nothing and then failed applying trigger SQL against tables that were never created.

### IMP-6. The generated migration tried to create Supabase's own `auth.users`
**Found:** immediately after fixing IMP-5. **Status:** fixed.

drizzle-kit emitted `CREATE TABLE "auth"."users"` with no `CREATE SCHEMA "auth"` — fatal against a non-Supabase Postgres, and a wrong one-column stub even against Supabase. Fixed by leaving `authUsers` unexported so drizzle-kit's export scan can't see it, while the same-module foreign key still resolves.

### IMP-7. The worker role could not write the table it exists to write
**Found:** T1–T3 audit. **Status:** fixed; recorded as ADR-0005.

A gap in `engineering-spec.md` §3 itself: its GRANT list gives `overlap_worker` no permission on `signal_night`, though §6 has `calendar_sync` writing there. T9 would have failed on its first write, before either INV-1 guard could even run.

### IMP-8. `middleware.ts` was silently inert
**Found:** T3 smoke test. **Status:** fixed.

Placed at `apps/web/middleware.ts`; Next.js only loads it from `src/` in this project layout. No error — it simply never ran, so **every protected route was unprotected**. Typecheck, lint and build were all green.

### IMP-9. The database scripts read the wrong env file
**Found:** during Supabase setup. **Status:** fixed.

`import 'dotenv/config'` loads `.env`, not `.env.local`. The app would have worked while `pnpm db:migrate` insisted `DATABASE_URL` was unset.

---

## Tier 3 — Security and correctness hardening

### IMP-10. `verifyOtp` had no rate limit
**Status:** fixed — 10/hour per phone.

`requestOtp` was limited per FIX-9; `verifyOtp` was not, leaving unlimited guesses at a 6-digit code. Not in §5.2's table, but the same class of vector.

### IMP-11. FIX-9's rate limiting is wired correctly but **does not actually work**
**Found:** Sprint 1 audit. **Status:** open — needs Upstash. See ADR-0004.

Ten consecutive `requestOtp` calls to the same phone were never throttled. The algorithm and wiring are both correct — an in-process test shows 3 allowed, 4th refused, Supabase reached only 3 times — but the in-memory fallback's counter resets whenever its module is re-instantiated, which happened repeatedly inside a single server process.

**This creates a sequencing requirement the founder checklist didn't have: Upstash must be configured *before* Twilio.** Until then `auth.requestOtp` is unrate-limited, and the moment Twilio works every unthrottled request is a paid SMS — the billing-attack vector FIX-9 exists to prevent. Doing them in the other order opens the vector instead of closing it.

### IMP-12. FIX-1's trigger could throw inside Supabase's own auth table
**Status:** fixed.

No guard for `NEW.phone IS NULL`. Supabase's `auth.users` supports non-phone signups this product doesn't use; an admin-created or future-OAuth account would have raised inside a trigger on Supabase's core table rather than simply not mirroring a row.

### IMP-13. Three domain rules were each defined twice
**Status:** fixed — consolidated into `@overlap/shared`.

The liveness floor was live drift risk: the engine gated `isLive` on its own constant while the group page computed "N to go" from a separate copy. Changing one would have left the UI confidently telling people the wrong number.

### IMP-14. Shared types were declared but never enforced
**Status:** fixed.

`Group`/`GroupWithMembers`/`GroupSummary` existed but weren't used as the router's return types — decoration, not a contract. A field added to a procedure's return without updating the type would have drifted silently.

---

## Verified working (checked, not assumed)

- **Row-level security.** Tables created by raw migration are exactly how a Supabase project ends up with PostgREST wide open. Probed empirically: committed a real `app_user` row with a phone number, then queried `/rest/v1/app_user` from outside with the public key. Returns `[]` while the row demonstrably exists; anonymous INSERT refused with `42501`. RLS on for all 13 tables, zero policies — deny-all.
- **INV-1 (OV-6).** A sync-written `confirmed_free` is rejected by `guard_confirmed_free`; so is a `confirmed_free` with a null `confirmed_at`; a genuine user tap is accepted. The guard blocks calendar sync without blocking people, which is the actual requirement.
- **FIX-1.** An `auth.users` insert produces exactly one `app_user` row, carrying the phone through.
- **INV-8 and the upsert.** `ON CONFLICT (...) WHERE group_id is null` matches the partial index and updates rather than duplicating. `pg-mem` cannot parse that syntax at all (ADR-0006), so this could only ever have failed in production.
- **The full chain.** Three members signal the same night → the heatmap reports 3 of 3, correct headline, INV-3 correctly withholding vibe counts below a cohort of 5, re-submitting replaces rather than accumulates. Rolled back, zero residue.
- **Migrations are idempotent** — a second `db:migrate` run is clean.

---

## What changed in how this is tested

Three tiers now, chosen because the first two demonstrably missed real defects:

1. **Unit** (`tests/services`, `tests/lib`, `tests/trpc`) — pure logic, I/O faked.
2. **Schema** (`tests/integration/migrationSql.test.ts`) — the real migration SQL against `pg-mem`, a real SQL engine. Validates DDL and constraints; cannot run plpgsql (ADR-0006).
3. **Live** (`tests/integration/liveDb.test.ts`) — the triggers, the partial-index upsert, and the full Signal→heatmap chain against real Postgres. Runs only when `DATABASE_URL` is set, so CI skips it; every write is inside a rolled-back transaction, verified to leave zero rows behind.

Two specific habits came out of the failures above:

- **A fake convincing enough to pass is worse than an admitted gap.** Where faking Drizzle's query builder would have risked a green test over wrong SQL, the gap was recorded as an `it.todo` naming what was missing — and each was later closed with a real test rather than quietly deleted.
- **Prove the bug before fixing it.** IMP-2 and IMP-3 were both written as failing tests first, which is the only way to know the fix addresses the actual defect.

---

## Open items

| Item | Blocked on | Consequence if shipped as-is |
|---|---|---|
| **IMP-11** — rate limiting inert | Upstash Redis (~10 min) | `auth.requestOtp` unthrottled; every request a paid SMS once Twilio is live |
| "Two phones can OTP-login" | Twilio — Supabase has no built-in SMS | Sprint 1 DoD cannot be closed |
| `overlap_worker` role (FIX-4) | `OVERLAP_WORKER_DB_PASSWORD` | INV-1 keeps its trigger but loses its second, structural boundary. Needed before T9 |
| Real-phone verification of the <10s Signal | A phone, and the above | Sprint 2 DoD cannot be closed |
| Heat-step scale | Judgment | 5+ confirmed saturates regardless of group size; the spec says only "darker = more". Revisit once real groups exist |
