## Ticket

<!-- e.g. T5b — closes part of the overlap engine -->

## What changed and why

<!-- Why, not just what — the diff already shows what. -->

## Invariants touched

<!-- List any of INV-1..INV-8 (docs/engineering-spec.md §0) this PR's code could affect, and where the test for each lives. Write "none" explicitly if none apply — don't leave this blank. -->

## Checklist

- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all pass
- [ ] `docs/backlog.md` Status column updated for the ticket(s) this closes
- [ ] Every invariant this PR could violate has a test (or an `it.todo` explaining what's blocking one)
- [ ] New dependencies, if any, were justified in a PR comment per `docs/engineering-spec.md` §1
- [ ] Confirmed on a real phone (required before a ticket counts as done — `docs/engineering-spec.md` §12)
