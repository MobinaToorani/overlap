# Contributing

This is currently a founder-plus-one-agent project, but the workflow below is written to hold up the moment a second human joins — that's the point of writing it down now instead of later.

## The agile process here

There's no ceremony overhead — no sprints-as-meetings, no standups — because a two-person team doesn't need them. What we keep, because it's what actually prevents drift on a greenfield build:

1. **One ticket at a time**, from `docs/backlog.md` / `docs/agent-prompt.md`'s T1-T22 sequence. Open a branch per ticket, PR per ticket. Don't start T(n+1) before T(n) is merged and its `docs/engineering-spec.md` §12 checklist is satisfied.
2. **Update `docs/backlog.md`'s Status column in the same PR** that finishes a ticket. The backlog is the source of truth for "where are we," not memory or chat history.
3. **Every non-negotiable invariant (`docs/engineering-spec.md` §0, INV-1..INV-8) needs a test.** If a PR touches code that could violate one and doesn't add or update a test for it, that's a blocking review comment, not a nitpick. If something genuinely can't be tested yet (needs infra that doesn't exist), say so explicitly — `it.todo(...)` with a comment explaining what's missing, not a silently absent test.
4. **Record a decision, not just the code, when you pick between two reasonable approaches.** See `docs/adr/` — a short ADR, not a design doc. Most changes don't need one; see `docs/adr/README.md` for when they do.
5. **No dependency or scope additions beyond `docs/engineering-spec.md` §1 and the v1 feature set (§6.1, and NOT §13) without a one-paragraph case first.** This is the rule most likely to get bent under deadline pressure — it's also the one the founder has explicitly said to hold the line on.

## Before opening a PR

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

All four must pass — this is exactly what CI (`.github/workflows/ci.yml`) runs on every push and PR.

## Code style

- TypeScript strict, no `any`, no unexplained `@ts-ignore` — enforced by `eslint.config.mjs` in both `apps/web` and `packages/shared`, not just convention.
- Every tRPC procedure validates input with a zod schema from `@overlap/shared` (see `packages/shared/src/schemas.ts`).
- Never log phone numbers, tokens, or calendar data.
- Comments explain *why*, not *what* — if removing a comment wouldn't confuse the next reader, it shouldn't be there. The overlap engine's comments are the model to follow: they justify complexity/invariant choices a reviewer would otherwise have to reverse-engineer.
- Copy strings live in `apps/web/src/lib/copy.ts`, never inline in components.

## Commit messages

Small, reviewable commits. Say what changed and, if it's not obvious from the diff, why. No fixed convention (Conventional Commits, etc.) is mandated — clarity over format.

## Docs map

Read in this order for context, most-durable first:

1. `docs/overlap-master-doc.md` — product intent, wins on intent when it conflicts with the spec
2. `docs/engineering-spec.md` — implementation contract, wins on implementation detail
3. `docs/audit-report.md` — defects found in the implementation, and the two spec corrections that came out of them
4. `docs/adr/` — decisions made *while building*, not written into the spec
5. `docs/backlog.md` — current state
6. `docs/agent-prompt.md` — the standing instructions for whoever (human or agent) is implementing a ticket
