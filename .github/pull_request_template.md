## Ticket

<!-- e.g. T5b — closes part of the overlap engine -->

## What changed and why

<!-- Why, not just what — the diff already shows what. -->

## Invariants touched

<!-- List any of INV-1..INV-8 (docs/engineering-spec.md §0) this PR's code could affect, and where the test for each lives. Write "none" explicitly if none apply — don't leave this blank. -->

## Checklist

- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all pass
- [ ] `docs/backlog.md` Status column updated for the ticket(s) this closes
- [ ] `docs/traceability.md` row updated if this touches an invariant, an A-/FIX-/IMP-/X- finding, or adds a test that proves one
- [ ] If this changed a rule in one spec, the other spec changed in the same commit (and both versions bumped)
- [ ] Every invariant this PR could violate has a test (or an `it.todo` explaining what's blocking one)
- [ ] New dependencies, if any, were justified in a PR comment per `docs/engineering-spec.md` §1
- [ ] Verified-live boxes for this ticket recorded in `docs/backlog.md` — **not** required to merge (ADR-0007/X-20 splits the DoD: code-complete blocks the next ticket, verified-live blocks the pilot), but no verified-live box may still be open at M4
