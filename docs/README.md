# Docs

Eleven documents, three of which claim authority over overlapping things. This says which one wins, and what each is for.

## Precedence

When two documents disagree, resolve in this order — and then **fix the loser**, because a disagreement that survives a reading is how corrections get lost:

1. **`engineering-spec.md`** wins on *implementation detail* — schema, API shape, algorithms, thresholds.
2. **`overlap-master-doc.md`** wins on *intent* — what the product is for, why a rule exists, what it must never do.
3. **`backlog.md`** wins on *current state*. If a status is claimed anywhere else, believe this one.
4. **`adr/`** wins on *decisions made while building* that neither spec settled.

The specs each carry a version and a changelog. If you change a rule in one, change it in the other in the same commit, and bump both.

## What each document is for

### The product
| File | Purpose |
|---|---|
| `overlap-master-doc.md` | Why this product exists, who it is for, the retention argument, the audit that reshaped it. Read first. |
| `engineering-spec.md` | The contract. Removes decisions an implementer would otherwise invent. |
| `marketing-plan.md` | How the first hundred groups happen. Growth is the invite artifact, not campaigns. |
| `founder-checklist.md` | Everything an agent cannot do: legal entity, Twilio, Google verification, pilot recruitment. |

### The build
| File | Purpose |
|---|---|
| `agent-prompt.md` | Standing instructions for whoever implements a ticket. Contains T1–T25. |
| `backlog.md` | Live status board. Updated by the PR that finishes a ticket. |
| `traceability.md` | Every rule → its enforcement → its ticket → its test. **The file that stops corrections falling into seams.** |
| `adr/` | Decisions taken while building, with the reasoning, so they can be disagreed with rather than guessed at. |

### The audits
Three axes, deliberately separate. Each found things the others could not.

| File | Audits | Findings |
|---|---|---|
| `audit-report.md` | **the idea** — adversarial review of the design before any code | A1–A11, FIX-1–12 *(referenced by both specs; not yet in the repo)* |
| `implementation-audit.md` | **the build** — defects in the code | IMP-1–15 |
| `coherence-audit.md` | **the seams** — contradictions *between* documents | X-1–X-32 |

The pattern each one found is worth carrying into the next:

> **Implementation:** every defect that mattered was found by running the thing, not reading it.
> **Coherence:** every correction that got lost was lost in the seam between two documents that each assumed the other was carrying it.

## Maintenance rules

Three, and they are the whole system:

1. **The PR that finishes a ticket updates `backlog.md`.**
2. **The PR that touches a correction updates its row in `traceability.md`.**
3. **A rule changed in one spec is changed in the other in the same commit.**

None of these are enforced by CI. They are habits, and the audits above are what happens when a habit slips.
