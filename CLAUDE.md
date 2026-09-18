# Working on Overlap

Overlap is a planning layer for adult friend groups: one ten-second weekly
ritual (the Sunday Signal), and a heatmap of when the group is actually free.
Solo founder + implementing agent. Pre-pilot.

**Read `docs/README.md` first** — it indexes every document and says which one
wins when two disagree. This file is only the rules you need loaded before
touching anything.

---

## Work one ticket at a time, then stop

`docs/backlog.md` is the live board and answers "where are we" without reading
anything else. Take the next ticket, finish it, update the board, stop. Don't
start the following one — Mobina verifies on a real phone between tickets.

Full ground rules: `docs/agent-prompt.md`.

## Plan the ticket before you build it — OpenSpec

Scope for a ticket is agreed in writing **before** any code exists, not decided
mid-build and reported afterwards. That failure is why ADR-0008 exists; T25 is
the worked example.

```
/opsx:propose <ticket or idea>   → openspec/changes/<ticket>-<slug>/
                                     proposal.md · specs/ · design.md · tasks.md
                                   then STOP. Mobina reviews the plan.
/opsx:apply                      → implement the agreed task list
/opsx:archive                    → fold what it settled back into docs/
```

`/opsx:explore` is the thinking-partner mode for a question that isn't a change
yet. `/opsx:update` revises a plan already written.

Three things to know before using it:

- **`openspec/config.yaml` is the reason the plans are any good.** It carries
  the invariants, the precedence order, the test tiers, the DoD, and per-artifact
  rules requiring every proposal to name its spec section, its `INV-n`, its
  A-/FIX-/IMP-/X- finding and its ticket. If a generated plan reads like it
  could be for any product, fix that file — not the plan.
- **Propose authorizes planning only.** Don't implement in the same turn, even
  if the request said "build it". The review between the two is the point.
- **`openspec/specs/` expands `engineering-spec.md`; it never overrides it.**
  Restating a spec section verbatim in a delta spec means the delta did nothing.

Skip the workflow for a genuine one-liner. Anything touching the overlap engine,
the dispatcher, the schema, or a privacy boundary is not a one-liner.

## Four subagents, for the parts that need a reader

Hand-written, in `.claude/agents/`. Each covers work this repo does repeatedly
and that `/opsx:*` (planning) and `/code-review` (generic correctness) do not.

| Agent | Use it when |
|---|---|
| `invariant-auditor` | Before calling any ticket done, and on any change touching the engine, signal resolution, the dispatcher, calendar sync, the schema, or anything that logs. Especially if the change "saves the user a tap" — that is INV-1's shape. |
| `doc-coherence` | Before committing a finished ticket, and after archiving an OpenSpec change. It reads the half of the maintenance rules `verify:docs` cannot: is a status honest, does the cited test actually prove the claim, does `openspec/specs/` contradict the contract. |
| `db-prover` | Whenever a change touches a query, a transaction, a constraint, a trigger, an index, or a migration. Writes and runs the live-Postgres tier, and reports what it could **not** prove. |
| `spec-researcher` | Before proposing a change, and before asking Mobina something the documents may already answer. Resolves precedence and distinguishes decided / deferred / struck / genuinely open. |

They report; they do not decide. `db-prover` is the only one that writes, and
only tests.

## The eight invariants are not guidelines

`docs/engineering-spec.md` §0. Each one silently breaks the product if
violated, and **each must have a test**. The three most likely to be broken by
well-meaning code:

- **INV-1** — calendar sync may never write `confirmed_free`. Only a human tap
  creates that value. Enforced by a DB trigger, a separate Postgres role, and
  the input schema, because one guard is not enough for the rule the whole
  product rests on.
- **INV-3 / INV-4** — vibe counts need a cohort of ≥5; `broke` never appears in
  any count, band, or list at any size. Enforced in the engine, never the UI.

The engine's job is to **refuse to over-claim**. When in doubt about whether to
show something, show less.

## Never log phone numbers, tokens, or calendar data

Not in errors, not in analytics, not in a debug line you meant to remove.
`display_name` once defaulted to the user's phone number and rendered it in
every group's member list — that class of bug is why this rule is here.

## Before you say a ticket is done

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm verify:docs
```

All five, and they must pass. `verify:docs` catches the stale-cross-reference
class of decay this repo keeps auditing itself for — broken doc links, a spec
version that moved, a test cited in the matrix that doesn't exist. It also runs
`openspec validate`, so a malformed plan or an archived change with unfinished
tasks fails here rather than in review. Then, **in the same commit**:

1. Update the ticket's Status in `docs/backlog.md`.
2. Update its row in `docs/traceability.md` if it touched an invariant, an
   A-/FIX-/IMP-/X- finding, or added a test that proves one.
3. If you changed a rule in one spec, change it in the other and bump both
   versions. `engineering-spec.md` and `overlap-master-doc.md` are a pair.
4. If an OpenSpec change is being archived, fold what it settled into the
   document that owns it — the specs, an `adr/`, or a `traceability.md` row.

There are three test tiers: unit, pg-mem schema, and **live Postgres**
(`tests/integration/liveDb.test.ts`, skipped without `DATABASE_URL`). The live
tier exists because every defect that mattered in this project was found by
running the thing, not by reading it. If a change touches a query, a
transaction, or a constraint, prove it there.

## The four audits are four different documents

Conflating them loses exactly the findings that matter. Each found things the
others structurally could not.

| Source | Audits | Findings |
|---|---|---|
| `docs/overlap-master-doc.md` §0 | the **idea** | A1–A11 |
| `docs/audits/audit-report.md` | the **documentation** | FIX-1–FIX-13 |
| `docs/audits/implementation-audit.md` | the **code** | IMP-1–IMP-15 |
| `docs/audits/coherence-audit.md` | the **seams between documents** | X-1–X-32 |

`docs/traceability.md` maps every one of those to its enforcement, ticket, and
test. **The PR that touches a correction updates its row there.** That file
exists because accepted corrections were being lost in the gaps between
documents, and nothing in the process noticed.

## Precedence when documents disagree

1. `engineering-spec.md` — implementation detail (schema, API, algorithms)
2. `overlap-master-doc.md` — intent (what the product is for, what it must never do)
3. `openspec/specs/` — behaviour at scenario granularity; expands the engineering
   spec, never overrides it, and never an invariant (ADR-0008)
4. `backlog.md` — current state
5. `adr/` — decisions taken while building

Then **fix the loser**. A disagreement that survives a reading is how the next
correction gets lost. And note that a late-arriving document can override a
settled ADR: `adr/0007` was amended, not edited, when `audits/audit-report.md`
turned up carrying a finding that contradicted it.

## Stack is locked

Next.js 15 App Router · TypeScript strict, no `any` · tRPC v11 (zod on every
procedure) · Drizzle · Postgres/Supabase · Tailwind v4 · Vitest · pnpm.

No new dependencies without making the case first. Nothing from
`engineering-spec.md` §13 (out of scope) gets built.

Build tooling outside that list: `@fission-ai/openspec`, pinned to an exact
version because `openspec update` rewrites the instructions the agents follow
and that should be a reviewable diff. `.claude/commands/` and `.claude/skills/`
are its vendored output — committed, but not edited by hand.

## Ask rather than guess on product intent

The hard calls in this project have been design questions — should `lapsed`
exist, does pre-fill violate A2, is a stale `blocked` still true. Getting one
wrong changes what the product asserts about people. Stop and ask; that has
worked every time it's been done.
