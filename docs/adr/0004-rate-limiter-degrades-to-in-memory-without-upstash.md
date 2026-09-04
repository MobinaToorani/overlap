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

**This is not safe as-is for a real deployment**, and measurement since has shown it's worse than this ADR originally assumed.

**Measured 2026-09-04 (Sprint 1 audit).** Ten consecutive `auth.requestOtp` calls for the same phone against `next dev` were *never* throttled — the limiter's counter resets whenever its module is re-instantiated, which happened repeatedly within a single server process. The identical sequence throttles correctly in-process (`tests/trpc/rateLimitWiring.test.ts` — 3 allowed, 4th `TOO_MANY_REQUESTS`, Supabase reached only 3 times), so the wiring is right and the algorithm is right; only the persistence is missing. The original wording here ("provides no real protection across multiple serverless instances") undersold it: it does not reliably throttle across *requests*, let alone instances. Both the code comment and the runtime warning have been corrected to say so plainly.

**This creates a sequencing requirement that isn't obvious from the founder checklist:** Upstash must be configured **before** Twilio goes live, not merely "before launch". Until then `auth.requestOtp` should be considered unrated-limited, and the moment Twilio works every unthrottled request is a paid SMS — the exact billing-attack vector FIX-9 exists to prevent. Ordering the two the other way around opens the vector rather than closing it.

**Verification when Upstash lands:** confirm in a deployed (not local) environment that the startup log does *not* contain the `UPSTASH_REDIS_REST_URL/TOKEN not set` warning, then repeat the four-request check against the deployed URL and confirm the fourth is refused.
