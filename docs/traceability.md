# Traceability Matrix

Every rule this product commits to → where it is enforced → which ticket owns it → which test proves it → whether that is true today.

**This file exists because corrections got lost in the seams between documents.** The coherence audit found five accepted corrections with spec surface and no ticket; they would simply never have been built, and nothing in the process would have noticed. This is the artifact that makes that visible.

## The rule that keeps it true

> **The PR that touches a correction updates its row here.** Same rule the backlog already runs on. A row whose Test column is empty is a commitment nobody has proven, and a row whose Ticket column says *none* is a commitment nobody is going to build.

Statuses: ✅ enforced and proven · 🟡 built, not fully proven · ⬜ not started · 🔴 no owner · ⛔ struck

Last verified against the repo: **2026-09-04** (117 tests passing — 20 shared + 97 web, including 10 against live Postgres; test names below are real and were read out of the suite, not transcribed from a document).

---

## Invariants

The eight rules that silently break the product if violated. Every one needs a test — that is `engineering-spec.md` §0's own requirement.

| # | Rule | Enforced at | Ticket | Test | Status |
|---|---|---|---|---|---|
| **INV-1** | Sync may never write `confirmed_free` | `guard_confirmed_free` trigger + `guard_worker_role` + zod input type + server-set `written_by` | T2, T6 | `liveDb > OV-6: sync may not write confirmed_free` · `+ confirmed_free without confirmed_at is rejected` · `+ a user-tapped night is accepted` · `signal.test > cannot express no_known_conflict or a sync writer` | ✅ live |
| **INV-2** | Only `confirmed_free` scores | `computeOverlap` | T5b | `OV-2` · `OV-9` · `RS-3` · `RS-5` | ✅ |
| **INV-3** | Vibe counts only at cohort ≥ 5 | `computeOverlap` (not the UI) | T5b | `OV-3` · `OV-4` | ✅ |
| **INV-4** | `broke` never in any count, band or list | `VISIBLE_VIBES` strips it once, before both branches | T5b | `OV-4` · `headline wording > omits the band clause entirely when every confirmed member is broke` | ✅ — note the *spec's* pseudocode still leaks it in the else-branch (X-3); the code does not |
| **INV-5** | ≤ 4 notifications / 7 days, excess dropped | central dispatcher | T15 | — | ⬜ dispatcher not built |
| **INV-6** | Four lifecycle events per dispatch | dispatcher + analytics | T15, T18 | — | ⬜ — **and unachievable as written on web push (X-14)**; restate per-channel |
| **INV-7** | FreeBusy scopes only, no event detail | OAuth scope config; no title/location columns exist | T9 | schema has no such columns (structural) | 🟡 structural half holds; no `scope_granted` column records what was actually granted (X-28) |
| **INV-8** | One global signal per user per week | partial unique index `uq_signal_global` | T2, T6 | `liveDb > INV-8: a second global signal for the same week is rejected` · `+ upsert conflict target matches the partial index` · `migrationSql > INV-8` | ✅ live |

---

## Design audit findings (A-series)

From the adversarial review of the product design, recorded in `overlap-master-doc.md` §0. *(`audit-report.md` is a different review — it audits the build documentation and is the FIX-series source, not this one.)*

| Finding | Correction | Ticket | Test | Status |
|---|---|---|---|---|
| A1 horizon < planning horizon | rolling three weeks | T6 | `signalGrid > buildWeeks` · `+ agrees with horizonWeekFor` | 🟡 built; the pre-fill that makes it affordable moved into T6 (X-19) but is **not yet implemented** |
| **A2 free ≠ available** | calendar drafts, humans confirm | T2, T9, T10 | INV-1 row above · `lapsed` state tests | 🟡 guard proven live; T9/T10 not started |
| A3 push unreliable | SMS is the floor | T17 | — | ⬜ — pilot is SMS-only by decision (ADR-0007, P8) |
| A4 multiplying ritual | one global Signal | T5, T6 | `RS-1` · INV-8 row | ✅ — master doc §9.3's per-group key was reintroducing this (X-2), now corrected |
| A5 aggregation ≠ anonymity | k-floor 5; band floor 3 | T5b | `OV-3` · `OV-4` · `headline > withholds the band below a cohort of three` | ✅ — floor raised 2→3 (ADR-0007, P3). The k-floor of 5 will rarely be reached at pilot scale; accepted consciously |
| A6 North Star unmeasurable | Confirmed Hangs | T19 | — | ⬜ — **inflatable until X-8's RSVP uniqueness lands**: "≥3 RSVPs" counts rows, not people |
| A7 booking unvalidated | streams reordered | founder | concierge test | ⬜ M5b |
| **A8 weekly ask, monthly behaviour** | FIX-7 stepdown, deferred | 🟡 | `RS-7` (the freshness half only) | 🟡 **A8 REOPENED as unresolved.** The stepdown isn't built and can't fire in the pilot; the three-week horizon is its partial mitigation. What *is* done is the freshness coupling, so reviving it later is a switch, not a redesign (ADR-0007 amendment) |
| A9 budget oversubscribed | rank ladder | T15 | — | ⬜ — see X-13, the budget currently counts its own drops |
| A10 cold start | threshold 3 **+ share card** | T7 (floor ✅) / **T23** (card) | `belowThreshold` render path | 🟡 floor live; card now has an owner (was 🔴) |
| A11 timeline | 12 weeks, OAuth week 1 | founder | — | ✅ — two stale "Sprint 3" paragraphs corrected (X-24) |

---

## Spec corrections (FIX-series)

| Fix | What | Ticket | Test | Status |
|---|---|---|---|---|
| FIX-1 | `app_user` keyed to `auth.users` | T2, T3 | `liveDb > FIX-1: inserting an auth.users row creates exactly one app_user row` | ✅ live |
| FIX-2 | signal resolution defined | T5 | `RS-1` … `RS-8` + the timestamp-ordering regression test | ✅ — three documents said RS-1..RS-4 until X-23; the set is now eight (FIX-13) |
| FIX-3 | Signal exempt from budget | T15 | — | ⬜ |
| FIX-4 | worker role boundary | T2, T9 | — | 🟡 triggers live; role uncreated (needs `OVERLAP_WORKER_DB_PASSWORD`) and **RLS deny-all would block it** (X-15) |
| **FIX-5** | precompute + Redis TTL | ⛔ deferred | — | ⛔ **deferred past M5** (ADR-0007) — recomputation is fast enough at pilot scale |
| FIX-6 | night date → timestamptz at 19:00 group-local | T11 | — | ⬜ — **blocked on `grp.timezone`, which does not exist** (X-7) |
| **FIX-7** | cadence stepdown | 🟡 deferred | `migrationSql > cadence_weeks rejects anything other than 1 or 2` · `RS-7` (the column is now **read**) | 🟡 **stepdown deferred, coupling discharged.** Was ⛔ struck; ADR-0007's amendment reverses half of X-1. A8 stays reopened |
| FIX-8 | cache shell, fetch RSVPs client-side | T12, T13 | — | ⬜ |
| FIX-9 | OTP rate limits | T3 | `rateLimitWiring > trips TOO_MANY_REQUESTS on the 4th request` · `rateLimit > 3 in-memory tests` | 🔴 **wired correctly but INERT until Upstash** (IMP-11). Upstash must precede Twilio |
| FIX-10 | `ends_at` NOT NULL | T11, T19 | `migrationSql` DDL | ✅ schema |
| FIX-11 | PIPEDA export/delete | T22 | — | ⬜ — **manual deletion runbook required before M4**, not M6 (X-18) |
| FIX-12 | join code alphabet | T4 | `joinCode > 6 tests` · `liveDb > create returns a 12-char join code` | ✅ — **not yet applied to `public_slug`** (X-9), which needs it more |
| **FIX-13** | decay in three cadence-derived stages | T5, T6 | `RS-5` · `RS-6` · `RS-7` · `RS-8` | ✅ — reported from T6, specified in `audit-report.md`, and it **overrode ADR-0007/X-1**; see that ADR's amendment |

---

## Implementation defects (IMP-series)

Full detail in `implementation-audit.md`. All fixed unless noted.

| # | Defect | Test that now covers it |
|---|---|---|
| IMP-1 | Availability never decayed past week 0 | `RS-5` — and `RS-6`/`RS-8`, for the third stage the first fix still lacked (FIX-13) |
| IMP-2 | Signals ordered by string, not instant | `signals > orders signals by instant, not by string` |
| IMP-3 | Zero-night signal vanished from `group.overlap` | `liveDb > the full Signal → overlap chain` |
| IMP-4 | Submitting the Signal showed no payoff | — (navigation; covered by T20 e2e when built) |
| IMP-5 | Migration pipeline did not exist | `migrationSql` (whole file) |
| IMP-6 | Migration tried to create Supabase's `auth.users` | `migrationSql` DDL executes |
| IMP-7 | Worker had no `signal_night` grant | ⛔ **dissolved by X-5** — the worker never writes that table |
| IMP-8 | `middleware.ts` silently inert | — (verified by curl; T20 e2e will cover) |
| IMP-9 | DB scripts read `.env`, not `.env.local` | — (verified manually) |
| IMP-10 | `verifyOtp` unthrottled | `auth > TOO_MANY_REQUESTS when verify attempts are exhausted` |
| IMP-11 | **Rate limiting inert in practice** | `rateLimitWiring` proves the wiring; **the gap is Upstash** 🔴 |
| IMP-12 | FIX-1 trigger could throw on null phone | `liveDb > FIX-1` |
| IMP-13 | Domain rules defined twice | consolidated in `@overlap/shared` |
| IMP-14 | Shared types not enforced as contracts | typecheck (explicit return types) |
| IMP-15 | `display_name` leaked the phone number into every group | verified live; **T25 must still collect a real name** |

---

## Coherence findings (X-series) — open items only

Resolved-and-applied findings are omitted; see `coherence-audit.md` and ADR-0007.

| # | Finding | Decision | Ticket | Status |
|---|---|---|---|---|
| X-3 | Spec pseudocode leaks `broke`; type isn't structural | strip once at top (code already does) | spec edit + `PublicVibe` type | ⬜ type not yet narrowed |
| X-5 | Two calendar pre-fill architectures | read path; sync writes `busy_block` only | T9, T10 | ✅ decided, spec updated |
| X-6 | Engine horizon ≠ signal horizon (offset by weekday) | state the rule in §4.0 | — | ⬜ **undocumented; real** |
| X-7 | No `grp.timezone` | add column; convert at query boundary | T9/T11 | ⬜ migration needed |
| X-8 | `rsvp` has no uniqueness; North Star inflatable | unique indexes + `guest_token` | T13 | ⬜ before T13 |
| X-9 | `public_slug` has no generation rule | FIX-12 + ≥16 chars, no semantics | T12 | ⬜ before T12 |
| X-13 | Budget counts its own drops; idempotency key collides | exclude drops; scope the key | T15 | ⬜ |
| X-14 | INV-6 unachievable on web push | per-channel delivery reporting | T15, T18 | ⬜ |
| X-15 | RLS deny-all blocks `overlap_worker`; `current_user` wrong | explicit policies; `session_user` | T9 | ⬜ before T9 |
| X-16 | Three definitions of "current" | one constant set | — | 🟡 floor consolidated; windows still need stating |
| X-17 | Rate limits sequenced after the routes they protect | dissolve T21 into T12/T13 | T12, T13, T21 | ⬜ |
| X-19 | Sprint 2 DoD needs a Sprint 3 ticket | pre-fill into T6 | T6 | ✅ resequenced; **implementation still owed** |
| X-28 | `message.archived_at` missing; §2.6 promises archiving | add column or soften the promise | T14 | ⬜ |
| X-29 | No `--vibe-broke` token | add it, as warm as the others | T6 | ⬜ |
| X-31 | Kill criteria have a 35–54% dead zone | decide before the pilot | founder | ⬜ |
| X-32 | Two headline metrics have no event | add `account_created`, `group_created`, `group_joined` + first-touch attribution | T12, T13, T18 | ⬜ **before T12**, or pilot-era invites are unattributable |

---

## Gaps in this matrix itself

Stated rather than hidden, per the repo's own standard:

- ~~**`audit-report.md` is missing.**~~ **Closed 2026-09-04** — added to the repo. Reading it immediately produced a correction: it carries a **FIX-13** that had no row here, and whose specified resolution contradicted ADR-0007's X-1 decision on two points. Both are now reconciled (see the FIX-13 row and ADR-0007's amendment). *This is the gap section doing its job: the entry existed for two days, and closing it changed shipped code.*
- **The A-series rows are still traced from citations, not from `audit-report.md`.** That document audits the *build documentation* and is the source for FIX-1–FIX-13; the A1–A11 design findings live in `overlap-master-doc.md` §0. The A-series rows below have not been re-verified against a dedicated source because there isn't one — §0 is the source.
- **No automated check enforces this file.** X-17's proposal — a test asserting every public procedure has a limiter — is the model for what would actually keep a matrix honest. Today the only mechanism is the maintenance rule at the top, which is a habit, not a guarantee.
- **Rows without a Test are not claims of safety.** They are the backlog of things believed but unproven, which is the entire point of keeping them visible.
