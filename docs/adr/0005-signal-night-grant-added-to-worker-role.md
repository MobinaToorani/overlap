# ADR-0005: Added a GRANT on signal_night for overlap_worker, missing from engineering-spec.md §3's own list

**Status:** accepted
**Date:** 2026-09-04

## Context

Auditing T1-T3, `apps/web/src/server/db/sql/0001_guard_invariants.sql`'s GRANT statements were copied verbatim from `engineering-spec.md` §3:

```sql
GRANT SELECT, INSERT, UPDATE ON busy_block TO overlap_worker;
GRANT SELECT ON signal, app_user, grp, group_member TO overlap_worker;
```

`engineering-spec.md` §6 describes the `calendar_sync` job (T9) as writing to `signal_night` directly: "Writes `signal_night` only as `blocked`/`no_known_conflict` with `written_by='sync'`." But no GRANT anywhere in §3 gives `overlap_worker` any permission on `signal_night` — not `INSERT`, not `UPDATE`, not even `SELECT`. As written, the spec's own GRANT list would make T9 fail with a permission-denied error the first time it tried to write anything, not just when writing `confirmed_free` — the invariant enforcement (`guard_worker_role`, later in the same file) is unreachable, because the write is rejected before either trigger even runs.

## Decision

Added `GRANT SELECT, INSERT, UPDATE ON signal_night TO overlap_worker;` to `0001_guard_invariants.sql`, placed after the two grants copied from the spec and commented as a deviation with reasoning, not silently folded in.

## Alternatives considered

**Leave it as specified and let T9 surface the bug.** Rejected — this is a schema/permissions-layer bug, not a product-intent question; there's no reasonable reading of §6 where the worker both needs to write `signal_night` and is granted zero access to it. Waiting for T9 to hit a permission error just delays discovering a bug this audit already found.

**File it as a question for Mobina instead of fixing it.** Considered, but the fix is unambiguous (grant exactly what §6 says the job does, no more) and doesn't touch product intent or any invariant's meaning — INV-1 is still enforced by `guard_worker_role`, which checks `NEW.state`, not by the absence of a grant. Table-level grants aren't the security boundary here; the trigger is. Documenting it as an ADR is the traceability mechanism instead.

## Consequences

`engineering-spec.md` itself is unchanged — it's Mobina's authored contract document, not something to silently edit out from under her. This ADR is the record that the implementation deviates from the spec's literal GRANT list, and why. Worth folding into `engineering-spec.md` §3 directly next time that document gets a revision pass, so the contract and the implementation don't quietly diverge in two different repos' worth of history.
