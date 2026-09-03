# ADR-0002: resolveSignals() and computeOverlap() are pure, zero-I/O, and separately unit-tested

**Status:** accepted
**Date:** 2026-09-03

## Context

`engineering-spec.md` §4 calls `computeOverlap()` "the most important file in the codebase" and §4.0 (FIX-2) requires signal resolution to live in its own `resolveSignals()` function that runs *before* it — global-vs-scoped precedence and overlapping-horizon dedup were the single biggest gap in spec v1.0, silently producing duplicate or arbitrary nights per date. Both functions need to be correct under adversarial edge cases (DST boundaries, multi-timezone members, stale signals) and cheap enough to run in a request handler *or* a worker precompute job.

## Decision

Both functions take plain data in and return plain data out — no database client, no clock other than an explicit `now`/`today` parameter, no network. `resolveSignals()` produces a `ResolvedSignalMap` (`Map<userId, Map<date, ResolvedNight>>`); `computeOverlap()` consumes that plus a member list and returns `GroupOverlap`. Every date is handled as an opaque `YYYY-MM-DD` string, converted to a UTC-anchored timestamp only inside `dateUtils.ts` and never through `new Date(str)` + local `getDate()`/`getDay()` — see that file's doc comment for why (OV-7 DST, OV-8 multi-timezone bucketing both hinge on this one rule).

Both are O(total nights) — one pass per night, which is the theoretical floor since every night has to be inspected at least once to know whether it counts. See the complexity comments in `services/signals.ts` and `services/overlap.ts` for the reasoning per function; not repeated here since code comments next to the algorithm are less likely to drift out of sync than a doc describing code elsewhere.

## Alternatives considered

**Merging resolution into computeOverlap()** — rejected per the explicit FIX-2 requirement; it would also make computeOverlap's own edge cases (band derivation, best-night tie-breaking) harder to test in isolation from resolution's edge cases (freshness decay, precedence).

**Doing date arithmetic with plain `Date` objects and local timezone methods** — the obvious-looking approach, and exactly the trap OV-7/OV-8 exist to catch. A `Date` constructed from a date-only string and then read back with `.getDate()` depends on the *host process's* timezone, which is unrelated to any user's or the group's timezone and would silently misbucket nights near midnight UTC or across a DST transition depending only on where the code happens to run.

## Consequences

Both functions can be fuzz-tested or precomputed in the worker without dragging in a database mock. The one thing this ADR asks a reviewer to watch for: any future change to either file that reaches for `new Date(dateString).getDate()`, `.getDay()`, or similar local-timezone accessors should be treated as a regression, not a style nit — reject it back to `dateUtils.ts`'s UTC helpers.
