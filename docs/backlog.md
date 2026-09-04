# Backlog

The T1-T22 sequence from `agent-prompt.md`, kept as a lightweight board here since this is a two-person project (founder + implementing agent) and a full Jira/Linear board would be overhead the team doesn't need yet. **Update this file's Status column as part of the PR that finishes a ticket** — it's the fastest way for a new session (agent or human) to answer "where are we" without re-reading every doc.

One ticket in flight at a time — see `docs/agent-prompt.md`'s ground rules. A sprint is "Done" only once every box in `engineering-spec.md` §12 is checked **and** Mobina has confirmed it on a real phone.

| Ticket | What | Sprint | Status |
|---|---|---|---|
| T1 | Repo scaffold: pnpm monorepo, Next.js 15, TS strict, Tailwind v4, Drizzle, Vitest, CI | 1 | ✅ Done — this pass |
| T2 | Full DB schema as Drizzle migrations, incl. `guard_confirmed_free` trigger; OV-6 written first | 1 | 🟡 Schema, generated migration (`0000_initial_schema.sql`), and guard/FIX-1 SQL all written and reviewed. Two audit passes on 2026-09-04 found and fixed a broken migration pipeline (nobody had run `drizzle-kit generate` before), a missing `signal_night` GRANT (ADR-0005), and validated the DDL + its constraints (uniqueness, CHECKs, FK cascades, INV-8's partial indexes) against a real SQL engine — see `tests/integration/migrationSql.test.ts` and ADR-0006 for exactly what that does and doesn't cover. **Still not run against a real Postgres**: the plpgsql trigger bodies (OV-6/INV-1, FIX-1) can't be verified without one — no DB provisioned yet |
| T3 | Phone OTP auth via Supabase; login, session, protected route wrapper | 1 | 🟡 Code + unit tests done this pass (auth router, session middleware, FIX-1 trigger, FIX-9 rate limiting). Sprint 1 DoD's "two phones can OTP-login" is **not yet verified** — needs a real Supabase project's URL/keys in `.env.local`; nobody has done that yet |
| T4 | Group create, join-by-code, member list, group home shell | 1 | 🟡 `group.create/joinByCode/get/listMine` (listMine added — needed by the IA's group switcher, not in §5's list), join-code generation (FIX-12), rate limiting (§5.2), and the group home shell UI (`/g`, `/g/[groupId]`) all built and unit-tested where honestly testable, plus a second audit pass (2026-09-04) that fixed an error-message-scoping UI bug and a silent clipboard-failure gap. **The actual query/transaction/join-code-collision-retry code in `group.ts` is still not verified against a live database** — `tests/integration/migrationSql.test.ts` validates the schema those queries run against, not the queries themselves (see ADR-0006) |
| T5 | `resolveSignals()` — precedence, dedup, freshness downgrade; RS-1..RS-4 | 2 | ✅ Done — this pass, all 4 tests passing |
| T5b | `computeOverlap()` as a pure function + all ten OV tests | 2 | ✅ Done — this pass, 9/10 tests passing (OV-6 is the DB-integration `it.todo` above) |
| T6 | Signal modal: vibe tap, 3-week grid, optional note, submit | 2 | 🟡 `signal.getCurrent`/`signal.submit` + the `/signal` modal (five vibe targets, three week-aligned rows of night pills, opt-in one-liner so the core path never needs a keyboard) + `seconds_to_complete` instrumentation through a `lib/analytics.ts` seam that T18 wires to PostHog. Per-group overrides (§2.2 Rule 3) deliberately refuse with NOT_IMPLEMENTED rather than take an untested second upsert path. **Two things need a live Postgres before this counts as done:** the upsert's `ON CONFLICT ... WHERE` partial-index target (pg-mem can't parse it — see the `it.todo` in `tests/integration/migrationSql.test.ts`), and the INV-1 guard trigger accepting the server-set `written_by`/`confirmed_at`. Median-under-10s and the real-phone check are also still unverified |
| T7 | Heatmap UI: confirmed vs. soft visually distinct, below-threshold empty state | 2 | ⬜ Not started |
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
| T22 | `me.exportData`, `me.deleteAccount`, `group.delete` (PIPEDA) | — | ⬜ Not started |

**Stop after T22.** That's v1 — see `agent-prompt.md`.

## Outside the ticket sequence (founder-only)

Tracked in full in `founder-checklist.md`; the two items with real queues, restated here because they're easy to forget once T3+ engineering work gets absorbing:

- Twilio A2P 10DLC registration (1-4 weeks, can be rejected)
- Google OAuth verification (2-6 weeks; "testing" mode with manual test users covers the whole pilot, so this can run in parallel rather than block T9)
