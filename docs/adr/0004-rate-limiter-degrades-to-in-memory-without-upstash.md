# ADR-0004: The OTP rate limiter falls back to an in-memory limiter, with a loud warning, instead of failing closed

**Status:** accepted
**Date:** 2026-09-03

## Context

`engineering-spec.md` §5.2 (FIX-9) flags `auth.requestOtp` as "a direct billing-attack vector" — each call sends a real, paid SMS — and says explicitly: "do not defer these to before launch." At T3 time, no Upstash Redis project exists yet (it's a Week 2-4 founder task per `founder-checklist.md`), so `auth.requestOtp` needed to work in local dev before Upstash is provisioned, while still doing something meaningful about the abuse vector the spec is worried about.

## Decision

`createRateLimiter()` (`apps/web/src/server/services/rateLimit.ts`) uses Upstash when `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` are set, and otherwise falls back to a single-process in-memory sliding-window limiter, logging a loud `console.warn` explaining that the fallback provides close to no real protection across multiple serverless instances.

## Alternatives considered

**Fail closed** — refuse to send any OTP at all if Upstash isn't configured. Rejected for now: it would make local dev impossible without an Upstash account from day one, which is real friction for a solo pre-revenue founder, and the spec's own warning is specifically about a *production* billing-attack vector, not local development.

**No fallback logic at all — just call Upstash and let it throw if unconfigured.** Rejected because the failure would be an opaque connection error deep in a third-party client, not a clear statement of what's missing and why it matters.

## Consequences

**This is not safe as-is for a real deployment.** If Overlap ever ships to a serverless/edge target (Vercel is the locked hosting choice) without Upstash configured, the in-memory limiter provides no real protection — each invocation likely gets its own memory, so an attacker's requests spread across instances essentially unlimited. The warning log is the only guard against this happening silently.

**Follow-up before real phone numbers are used:** once Upstash is provisioned (`founder-checklist.md`, weeks 2-4), verify in a deployed (not local) environment that the startup log does *not* show the `UPSTASH_REDIS_REST_URL/TOKEN not set` warning. Whoever does the T3 phone-verification step in `docs/backlog.md` should check this at the same time — it's a five-second log check that's cheap to fold into that verification pass, and easy to forget separately.
