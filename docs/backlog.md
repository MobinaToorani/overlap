# Backlog

The T1-T22 sequence from `agent-prompt.md`, kept as a lightweight board here since this is a two-person project (founder + implementing agent) and a full Jira/Linear board would be overhead the team doesn't need yet. **Update this file's Status column as part of the PR that finishes a ticket** — it's the fastest way for a new session (agent or human) to answer "where are we" without re-reading every doc.

One ticket in flight at a time — see `docs/agent-prompt.md`'s ground rules. A sprint is "Done" only once every box in `engineering-spec.md` §12 is checked **and** Mobina has confirmed it on a real phone.

| Ticket | What | Sprint | Status |
|---|---|---|---|
| T1 | Repo scaffold: pnpm monorepo, Next.js 15, TS strict, Tailwind v4, Drizzle, Vitest, CI | 1 | ✅ Done — this pass |
| T2 | Full DB schema as Drizzle migrations, incl. `guard_confirmed_free` trigger; OV-6 written first | 1 | ✅ **Done and verified against live Supabase (2026-09-04).** Migration applied cleanly; `tests/integration/liveDb.test.ts` confirms the schema, the INV-1 guard trigger (**OV-6 passes** — sync writing `confirmed_free` raises), FIX-1's app_user-on-signup trigger, and INV-8's partial index. Earlier audit passes fixed a broken migration pipeline and a missing `signal_night` GRANT (ADR-0005). Remaining gap: the `overlap_worker` role (FIX-4) isn't created until `OVERLAP_WORKER_DB_PASSWORD` is set — needed before T9 |
| T3 | Phone OTP auth via Supabase; login, session, protected route wrapper | 1 | 🟡 Code + unit tests done this pass (auth router, session middleware, FIX-1 trigger, FIX-9 rate limiting). Supabase project now provisioned and connected, and FIX-1's trigger is verified live (an auth.users insert really does produce exactly one app_user row). Sprint 1 DoD's "two phones can OTP-login" is **still unverified**: Supabase has no built-in SMS, so phone OTP can't send until a Twilio account exists |
| T4 | Group create, join-by-code, member list, group home shell | 1 | 🟡 `group.create/joinByCode/get/listMine` (listMine added — needed by the IA's group switcher, not in §5's list), join-code generation (FIX-12), rate limiting (§5.2), and the group home shell UI (`/g`, `/g/[groupId]`) all built and unit-tested, plus an audit pass that fixed an error-message-scoping UI bug and a silent clipboard-failure gap. The schema these queries run against is now verified live, but **`group.ts`'s own query/transaction/collision-retry code still hasn't been exercised end-to-end** — that needs a signed-in session, which needs Twilio (below) |
| T5 | `resolveSignals()` — precedence, dedup, three-stage freshness decay; RS-1..RS-8 | 2 | ✅ Done — all 8 passing (RS-5 with the v1.2 decay correction; RS-6/7/8 with FIX-13's three cadence-derived stages) |
| T5b | `computeOverlap()` as a pure function + all ten OV tests | 2 | ✅ Done — **all ten OV tests now pass**, OV-6 included (it moved to `tests/integration/liveDb.test.ts` and runs against live Supabase). A later audit also fixed a real ordering bug in `resolveSignals` — ISO timestamps were compared as strings |
| T6 | Signal modal: vibe tap, 3-week grid, optional note, submit | 2 | 🟡 `signal.getCurrent`/`signal.submit` + the `/signal` modal (five vibe targets, three week-aligned rows of night pills, opt-in one-liner so the core path never needs a keyboard) + `seconds_to_complete` instrumentation through a `lib/analytics.ts` seam that T18 wires to PostHog. Per-group overrides (§2.2 Rule 3) deliberately refuse with NOT_IMPLEMENTED rather than take an untested second upsert path. Both database-level unknowns are now **verified against live Supabase** (`tests/integration/liveDb.test.ts`): the upsert's `ON CONFLICT ... WHERE` partial-index target matches, and the INV-1 guard accepts the server-set `written_by`/`confirmed_at` while rejecting a sync write. Still unverified: the end-to-end submit through a real session (needs Twilio), median-under-10s, and the real-phone check |
| T7 | Heatmap UI: confirmed vs. soft visually distinct, below-threshold empty state | 2 | 🟡 `group.overlap` + the heatmap (days as columns, scrollable across 21 days; confirmed = solid saturation, soft = hatched and never a heat step per A2; every cell carries its count as text since §7.4 forbids colour-only intensity; below 3 **signalled** members shows `belowThreshold` instead of an empty grid). Verified end to end against live Postgres — three members signal, the heatmap sees 3-of-3 with the right headline and INV-3 correctly withholding vibe counts. Two deviations noted in code: the bottom-right slot holds the Signal CTA until T11 builds plan creation, and heat steps map by absolute count (the spec doesn't say). Not yet: real-phone check, and the §8.1 Redis cache is the T-worker precompute job, not this |
| T8 | Python worker skeleton on Fly.io, healthcheck, shared-secret auth | 3 | 🟡 Directory shape only (`apps/worker/{jobs,lib,tests}`) — no running service |
| T9 | Google Calendar OAuth (FreeBusy only) + `calendar_sync` job | 3 | ⬜ Not started |
| T10 | Signal draft pre-fill from `busy_block` + prior week | 3 | ⬜ Not started |
| T11 | Plan creation from a heatmap night; capture `is_home_hang` | 4 | ⬜ Not started |
| T12 | Public invite page `/p/[slug]`: SSR, edge-cached, OG image, LCP < 1s | 4 | ⬜ Not started |
| T13 | Guest RSVP, first name only; account prompt after RSVP | 4 | ⬜ Not started |
| T14 | Plan thread: post message, list messages | 4 | ⬜ Not started |
| T15 | Notification dispatcher (single chokepoint); INV-5/INV-6; signal exemption (FIX-3) | 5 | ⬜ Not started |
| T16 | `signal_dispatch` job: hourly, timezone-correct, idempotent | 5 | ⬜ Not started |
| T17 | SMS via Twilio (default) + web push as upgrade | 5 | ⬜ Not started |
| T18 | PostHog events (§11) + W1-W8 completion dashboard | 5 | ⬜ Not started |
| T19 | `attendance_prompt` job + one-tap "did you make it" | 5 | ⬜ Not started |
| T20 | Playwright e2e: signal→heatmap→plan→invite, invite→rsvp→signup | 5 | ⬜ Not started |
| T21 | Rate limits on every public route (§5.2) — before any real invite link ships | — | ⬜ Not started |
| T22 | `me.exportData`, `me.deleteAccount`, `group.delete` (PIPEDA) | — | ⬜ Not started. **Two-stage per ADR-0007/X-18**: a tested manual deletion runbook must exist *before* M4, since the PIPEDA obligation attaches to the first pilot user, not to M6 |
| T23 | `group.shareCard` — the A10 cold-start artifact (§2.5) | — | ⬜ Not started. Sequenced after T12 to share its OG-image machinery. This is §2.5's answer to the Empty Room Problem, and below-threshold is the *normal* state at pilot start |
| T24 | One-tap re-confirm for a `lapsed` night (P2) | — | ⬜ Not started. The `lapsed` state ships in the engine and heatmap now; this is the mutation that makes it useful — the highest-intent surface in the product, since the member already said yes to that exact night |
| T25 | First-run name capture, folded into T4's create/join flow (X-12) | 1 | ⬜ Not started. `display_name` currently defaults to a neutral placeholder; nothing collects a real name, so a pilot group would be seven people called "New member" |

**Stop after T25.** That's v1 — see `agent-prompt.md`.

## Struck or deferred (ADR-0007)

Recorded so they are not silently re-adopted, and so "why isn't this built" has an answer:

- **FIX-7 (fortnightly cadence stepdown) — deferred, not struck** *(was struck; revised by `audit-report.md` FIX-13 — see ADR-0007's amendment)*. The **stepdown** is still not built: not computable from the schema, and it could not fire during the pilot. **A8 is reopened as unresolved.** What changed is the collision with the freshness rule — that is now discharged rather than deferred with it, since §4.0's windows derive from `cadence_weeks` (RS-7). Reviving the stepdown is a switch to flip, not a redesign.
- **FIX-5 (`overlap_precompute` + Redis cache) — deferred past M5.** Recomputation is trivially fast for five groups of seven; adding a cache-invalidation contract before there is load to justify one is premature.
- **Apple / CalDAV calendar — out of v1.** Google-only, as §9.3 already permits. Risk accepted: an iPhone-heavy pilot group gets no sync, and falls back to manual night-tapping.
- **Founder-triggered first Signal — folded into T16**, which owns the dispatcher it needs.

## Outside the ticket sequence (founder-only)

Tracked in full in `founder-checklist.md`; the two items with real queues, restated here because they're easy to forget once T3+ engineering work gets absorbing:

- **Upstash Redis — do this BEFORE Twilio.** Not just a weeks-2-4 infra chore: measured during the Sprint 1 audit (2026-09-04), the in-memory fallback limiter does not throttle at all across requests, so `auth.requestOtp` is effectively unrate-limited until Upstash exists. The moment Twilio is live, every unthrottled request is a paid SMS — the billing-attack vector FIX-9 exists to prevent. See ADR-0004.
- Twilio A2P 10DLC registration (1-4 weeks, can be rejected). Also gates Supabase phone OTP entirely — Supabase has no built-in SMS, so "two phones can OTP-login" cannot be verified until this exists.
- Google OAuth verification (2-6 weeks; "testing" mode with manual test users covers the whole pilot, so this can run in parallel rather than block T9)
