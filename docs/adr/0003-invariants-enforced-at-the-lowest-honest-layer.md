# ADR-0003: Enforce each invariant at the lowest layer that can actually guarantee it, not in the UI

**Status:** accepted
**Date:** 2026-09-03

## Context

`engineering-spec.md` §0 and the master doc's audit findings (A2, A5) are explicit that INV-1 and INV-3 must not be enforced only in presentation code: "a privacy guarantee in the presentation layer is one refactor away from being lost." T1/T2 only built the data layer and the pure overlap engine — no UI yet — but the *pattern* needed to be settled now, since T6/T7 (Signal modal, heatmap UI) will be tempted to take shortcuts once real deadlines show up.

## Decision

Layer invariants by how cheaply they can be defeated one layer up:

- **INV-1** (calendar sync can never assert `confirmed_free`) gets *two* independent enforcement points below the API layer: a `BEFORE INSERT OR UPDATE` trigger that checks `written_by` (`sql/0001_guard_invariants.sql`), **and** a separate `overlap_worker` Postgres role that is granted `INSERT`/`UPDATE` on `busy_block` but only `SELECT` on `signal` — plus a second trigger that rejects `confirmed_free` from that role specifically, regardless of what `written_by` claims. The trigger alone only catches a caller that's honest about `written_by`; the role makes it structurally impossible for the sync path to write the value at all, even from buggy or malicious worker code.
- **INV-2/INV-3/INV-4** (soft nights never score, vibe counts need a 5+ cohort, `broke` never appears in output) are enforced inside `computeOverlap()` itself — the function *cannot construct* a `vibeCounts` object containing `'broke'` or reflecting a sub-5 cohort, because `VISIBLE_VIBES` excludes it and the cohort check gates the whole object, not a display flag next to it.

## Alternatives considered

Trusting the tRPC layer or the React components to hide `broke` counts and gate on cohort size — rejected outright per A5's own framing: aggregation implemented only at render time is trivially bypassed by any new view, export, or debug panel that queries the same data later.

## Consequences

A future contributor adding a new way to view overlap data (an admin panel, a CSV export, a different UI framework) inherits these guarantees for free, because they call `computeOverlap()` rather than re-deriving the numbers. The cost: `computeOverlap()`'s output type (`NightOverlap`) is deliberately narrower than the raw resolved data — there is no escape hatch parameter to "just get the raw counts, I'll filter them myself." If a legitimate future need for raw confirmed-member data arises (e.g. an admin debug view), it should be a new, explicitly-named function, not a flag on this one.
