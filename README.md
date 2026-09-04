# Overlap

**Overlap shows you when your friends are actually free.**

A rolling three-week heatmap of when a friend group is collectively free, fed by a ten-second weekly ritual (**the Sunday Signal**) that turns a good night into a shareable, no-account-required invite. Partiful is for the party; Overlap is for the six weeks before it, when nobody can figure out a date.

[![CI](https://github.com/MobinaToorani/overlap/actions/workflows/ci.yml/badge.svg)](https://github.com/MobinaToorani/overlap/actions/workflows/ci.yml)

> **Status: pre-launch, private repo.** v1 scope is T1-T22 in [`docs/backlog.md`](docs/backlog.md) — built so far: the repo scaffold, the full DB schema, the overlap engine, phone OTP auth, groups, the Signal, and the heatmap (T1-T7). Schema, invariant triggers and the Signal→heatmap chain are verified against a live Supabase database; phone login still waits on Twilio. No calendar sync or worker yet. See [Where things stand](#where-things-stand).

---

## Table of contents

- [Why this exists](#why-this-exists)
- [How it works](#how-it-works)
- [Non-negotiable invariants](#non-negotiable-invariants)
- [Tech stack](#tech-stack)
- [Repo layout](#repo-layout)
- [Getting started](#getting-started)
- [Testing](#testing)
- [Where things stand](#where-things-stand)
- [Documentation map](#documentation-map)
- [Contributing](#contributing)

## Why this exists

Adult friend groups don't stop wanting to see each other — they stop being able to schedule it. Someone floats an idea in the group chat, six people reply with partial constraints across three days, nobody holds the full picture in their head, and the thread dies. The bottleneck isn't desire or budget; it's the absence of a shared, current picture of who's actually free, and the group chat is the worst possible interface for computing that.

Overlap's retention bet — and the reason most apps in this category (Down to Lunch, Free, Kickback) died — is a single synchronized ritual rather than a feed or a chat surface. The full reasoning, including an adversarial audit of the original design (eleven findings, three of them product-killing), lives in [`docs/overlap-master-doc.md`](docs/overlap-master-doc.md).

## How it works

1. **The Signal.** Every Sunday, one push: *"Signal time. How's your week looking?"* One tap for vibe, tap the nights you could plausibly do something across a rolling three-week horizon, optional one-liner. Median target: under 10 seconds.
2. **The heatmap.** Submitting instantly reveals *"Thursday the 17th — 5 of 7 free. The group is leaning low-key."* — computed by [`computeOverlap()`](apps/web/src/server/services/overlap.ts), described below.
3. **The invite.** One tap turns a good night into a public, no-account page. RSVP requires only a first name; the account prompt comes *after*, framed around what the person gains.

Calendar sync is a **draft input only** — it can remove a night (hard conflict) but can never assert one as free. Every night that counts as available must be affirmatively tapped by a human. This is the single most important design decision in the product (`overlap-master-doc.md` finding A2) and it's enforced in the database, not just convention — see INV-1 below.

### The core algorithm

The overlap engine is two pure functions, zero I/O, fully unit-tested:

- **`resolveSignals()`** ([`apps/web/src/server/services/signals.ts`](apps/web/src/server/services/signals.ts)) resolves two ambiguities a naive implementation gets wrong: a group-scoped signal always shadows a global one for the same week (never merged), and where two signals' 21-day horizons overlap, the most recently submitted one wins per date. It also applies freshness decay: once a signal is more than 7 days old none of its nights still count as a hard yes, whichever of its three weeks they sat in — so someone who stops signalling fades from the picture rather than asserting stale confirmations. Runs in **O(n)** in the number of nights — every night is inspected exactly once, which is also the theoretical floor.
- **`computeOverlap()`** ([`apps/web/src/server/services/overlap.ts`](apps/web/src/server/services/overlap.ts)) turns resolved per-member availability into the 21-night heatmap: confirmed counts, vibe bands, the best night (earliest date wins ties), and a plain-language headline — built from confirmed members only. Also **O(n)** in the number of resolved member-nights, via a single pass building per-date accumulators rather than re-scanning members per date.

Both treat every date as an opaque `YYYY-MM-DD` string and do all arithmetic in UTC ([`dateUtils.ts`](apps/web/src/lib/dateUtils.ts)) — never via `new Date(str)` plus local `getDate()`/`getDay()`, which would silently misbucket nights depending on the *server's* timezone or a DST transition. See [ADR-0002](docs/adr/0002-overlap-engine-is-two-pure-functions.md) for the full reasoning.

## Non-negotiable invariants

Eight rules from an adversarial audit, each of which silently breaks the product if violated. Full table in [`docs/engineering-spec.md`](docs/engineering-spec.md#0-non-negotiable-invariants); the three most likely to be violated by well-intentioned code:

| | Rule |
|---|---|
| **INV-1** | Calendar sync can never write `confirmed_free` — only a human tap can. Enforced by a DB trigger **and** a separate `overlap_worker` Postgres role that's physically unable to write the value ([`0001_guard_invariants.sql`](apps/web/src/server/db/sql/0001_guard_invariants.sql)). |
| **INV-3** | Exact vibe counts only appear once the confirmed cohort is ≥ 5; below that, a qualitative band only. Enforced inside `computeOverlap()`, not the UI — a privacy guarantee in the presentation layer is one refactor away from being lost. |
| **INV-4** | `broke` (financial vibe) never appears in any count, band, or list, at any group size. `computeOverlap()`'s output type makes this structurally true, not just policy. |

See [ADR-0003](docs/adr/0003-invariants-enforced-at-the-lowest-honest-layer.md) for why each invariant is enforced where it is.

## Tech stack

Locked in [`docs/engineering-spec.md`](docs/engineering-spec.md#1-locked-technology-decisions) §1 — no substitutions without a new ADR ([ADR-0001](docs/adr/0001-locked-tech-stack.md)).

| Layer | Choice |
|---|---|
| Web | Next.js 15 (App Router) · React 19 · TypeScript strict · Tailwind v4 |
| API | tRPC v11, every input validated with zod |
| Database | Postgres (Supabase) via Drizzle ORM |
| Cache / queue | Upstash Redis |
| Auth | Supabase Auth, phone OTP |
| Messaging | Twilio SMS (default channel) + web push (VAPID) as an upgrade |
| Worker | Python 3.12, FastAPI + APScheduler, on Fly.io |
| Analytics / errors | PostHog · Sentry |
| Hosting | Vercel (web) · Fly.io (worker) |
| Tooling | pnpm workspaces · Vitest · Playwright · pytest |

## Repo layout

```
overlap/
├── apps/
│   ├── web/                 Next.js app — UI, tRPC API, the overlap engine
│   │   ├── src/app/         Route groups: (auth), (app)/g/[groupId], p/[slug] (public), api/
│   │   ├── src/server/      db/ (Drizzle schema + invariant SQL), services/ (the engine), trpc/
│   │   └── tests/           unit, schema (pg-mem), and live-Postgres tiers
│   └── worker/               Python skeleton — directory shape only until T8
├── packages/
│   └── shared/               Types + zod schemas shared web ↔ worker contract
└── docs/
    ├── overlap-master-doc.md    Product intent — wins on intent
    ├── engineering-spec.md      Implementation contract — wins on implementation
    ├── agent-prompt.md          Standing instructions for whoever builds a ticket
    ├── founder-checklist.md     Tasks only the founder can do (legal, A2P 10DLC, OAuth verification)
    ├── marketing-plan.md        GTM
    ├── backlog.md               T1-T22 status board
    ├── audit-report.md          the design audit (A1-A11, FIX-1-FIX-12)
    ├── implementation-audit.md  defects found in the code, and how
    └── adr/                     Decisions made while building, not written into the spec
```

## Getting started

```bash
pnpm install          # Node 20 LTS — see .nvmrc; nvm use first if you use nvm
cp apps/web/.env.example apps/web/.env.local   # fill in what you have; most features work without every var yet
pnpm dev              # apps/web on http://localhost:3000
```

Common scripts (run from the repo root, or with `--filter @overlap/web` / `--filter @overlap/shared`):

```bash
pnpm lint             # eslint, both packages
pnpm typecheck         # tsc --noEmit, both packages
pnpm test              # vitest run, both packages
pnpm build              # next build
pnpm db:generate       # drizzle-kit generate — needs DATABASE_URL
pnpm db:migrate        # run migrations + apply the INV-1 guard triggers — needs DATABASE_URL
```

## Testing

```bash
pnpm test
```

Every non-negotiable invariant needs a test. Where one genuinely can't run yet, it's marked `it.todo(...)` naming exactly what's missing rather than silently skipped — and closed with a real test once it can run, which is what happened to OV-6 (it needed a live Postgres, and now runs against one in `tests/integration/liveDb.test.ts`). See [`apps/web/tests/`](apps/web/tests/) for the OV-1..10 / RS-1..5 suites and [`CONTRIBUTING.md`](CONTRIBUTING.md) for the invariant-needs-a-test rule.

Three tiers, not two: [`tests/services/`](apps/web/tests/services/) and [`tests/trpc/`](apps/web/tests/trpc/) are pure unit tests (no I/O, or I/O faked via injected test doubles); [`tests/integration/`](apps/web/tests/integration/) runs the actual generated migration SQL against `pg-mem`, a real (if narrower-than-Postgres) SQL engine — see [ADR-0006](docs/adr/0006-pg-mem-for-schema-tests-not-drizzle-queries.md) for exactly what it does and doesn't verify (schema and constraints: yes; plpgsql triggers and Drizzle query code: no, still needs a live Postgres).

## Where things stand

Full board: [`docs/backlog.md`](docs/backlog.md), which is the designated status board — prefer it over this paragraph if they ever disagree. Short version: T1-T7 are built. The schema, the INV-1 guard triggers, FIX-1's signup trigger, INV-8's partial-index upsert, and the full Signal→heatmap chain are all verified against a live Supabase database. Still unverified: anything needing Twilio (phone login, and therefore "two phones can OTP-login"), and anything needing a real device (the ten-second Signal median). Calendar sync, plans/invites, the worker and the notification dispatcher are still ahead — see the backlog for the sequence, which is deliberately one-ticket-at-a-time (`docs/agent-prompt.md` explains why: long autonomous runs on a greenfield product produce plausible code that violates the invariants, and the invariants are the product).

## Documentation map

Read in this order for context, most-durable first: [`overlap-master-doc.md`](docs/overlap-master-doc.md) (intent) → [`engineering-spec.md`](docs/engineering-spec.md) (contract) → [`docs/adr/`](docs/adr/) (decisions made while building) → [`docs/backlog.md`](docs/backlog.md) (current state) → [`agent-prompt.md`](docs/agent-prompt.md) (standing build instructions). Business-side docs: [`founder-checklist.md`](docs/founder-checklist.md), [`marketing-plan.md`](docs/marketing-plan.md).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) — the agile process (one ticket at a time, invariant-needs-a-test, when to write an ADR), code style, and the pre-PR checklist.

---

*Private repository. Not affiliated with, and no relation to, any other product of a similar name.*
