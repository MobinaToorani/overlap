# ADR-0001: Adopt the locked tech stack as-is, no substitutions without a new ADR

**Status:** accepted
**Date:** 2026-09-03

## Context

`engineering-spec.md` §1 already names the stack: Next.js 15 (App Router, TS strict), Tailwind v4, tRPC v11, Drizzle, Postgres/Supabase, Upstash Redis, Supabase phone-OTP auth, Twilio SMS as the default channel, a Python 3.12/FastAPI worker on Fly.io, PostHog, Sentry, Vercel, pnpm. It also explicitly rejects Prisma, NextAuth, GraphQL, microservices, and any UI kit beyond Radix primitives. This ADR exists only to record that the T1 scaffold implements it literally, and to be the place a future substitution proposal gets written down instead of silently drifting.

## Decision

Use the stack exactly as specified. At scaffold time (2026-09-03), the newest release in each locked major was pinned: Next.js 15.5.25 (not 16 — 16 was `latest` on npm the day this was built, but the spec names 15; bumping majors is its own decision, not a side effect of running `pnpm add`), React 19, Tailwind 4, Drizzle ORM 0.36, TypeScript 5.7.

## Alternatives considered

Running `create-next-app@latest` unmodified would have pulled Next 16. Rejected — "no substitutions without an explicit decision record" is a rule from `agent-prompt.md`'s ground rules, and a major-version bump the founder didn't ask for is exactly the kind of drift that rule exists to prevent.

## Consequences

Someone has to deliberately bump Next 15→16 later (new ADR, one paragraph making the case, per the working agreement) rather than it happening implicitly on a fresh `pnpm install` of a lockfile-less clone. Until then, `apps/web/package.json` pins `15.5.25`, not a `^15` range with unpinned minor movement left unconsidered — that keeps `pnpm install` reproducible for a second machine or a CI runner.
