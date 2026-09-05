# Docs

Three of these claim authority over overlapping things. This says which one wins, and what each is for.

```
docs/
├── overlap-master-doc.md    the product, and why      ← read first
├── engineering-spec.md      the contract
├── marketing-plan.md        how the first 100 groups happen
├── founder-checklist.md     what only Mobina can do
│
├── agent-prompt.md          standing instructions, T1–T25
├── backlog.md               live status board
├── traceability.md          every rule → its test → whether that's true today
│
├── audits/                  four adversarial reviews (see audits/README.md)
└── adr/                     decisions taken while building
```

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

Four adversarial reviews on four different axes — the idea (A-series), the
documentation (FIX), the code (IMP), and the seams between documents (X).
Each found defects the others structurally could not.

**See `audits/README.md`** for what each one is, what each axis taught, and
which is which. Their current status is in `traceability.md`, not there.

## Maintenance rules

Three, and they are the whole system:

1. **The PR that finishes a ticket updates `backlog.md`.**
2. **The PR that touches a correction updates its row in `traceability.md`.**
3. **A rule changed in one spec is changed in the other in the same commit.**

**`pnpm verify:docs` now enforces the mechanically decidable part**, and CI runs it on every push: broken doc links, cross-references to a spec version that moved, tests cited in the matrix that don't exist in the suite, tickets cited that aren't on the board, and raw UTF-8 in HTML.

It cannot check whether a row is *honest* — whether the test named actually proves the thing claimed, or whether a status is current. That still needs a reader. The audits above are what happens when the unenforceable half slips.
