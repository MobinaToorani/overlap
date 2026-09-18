# ADR-0008: OpenSpec is the planning layer, and `openspec/specs/` expands the engineering spec

**Status:** accepted
**Date:** 2026-09-18
**Decided by:** Mobina, on the spec-surface question; the rest delegated to the implementing agent.

## Context

`backlog.md` has carried this observation since 2026-09-11, under "also proposed, lower priority, no ticket yet":

> **Per-ticket acceptance criteria, written from the spec before the work starts.** The process change that most deserves the name "spec-driven". §12 carries per-*sprint* DoD, but a ticket is a one-line row here, so scope calls land on the implementing agent mid-build and get reported afterwards.

T25 is the worked example it cites: whether the name form also belonged on `/me`, and whether capturing the browser timezone was in scope, were both decided by the agent and flagged in the commit rather than agreed first. Neither call was wrong. Both were made at the wrong time, by the wrong person, and reviewed only as a fait accompli.

This repo is already spec-driven in every respect except the one that matters per ticket. There is a versioned contract, an intent doc with explicit precedence, a traceability matrix, four audits, and `verify:docs` in CI. What there is not is a place where *this* ticket's scope, delta, and acceptance criteria get written down and agreed **before** any code exists.

[OpenSpec](https://github.com/Fission-AI/OpenSpec) is that place. A change gets a directory holding four artifacts — `proposal.md` (why, and what is deliberately excluded), a delta spec in WHEN/THEN scenarios, `design.md` (how, and what was rejected), and `tasks.md` — produced by `/opsx:propose` and reviewed before `/opsx:apply` writes a line of code. The workflow enforces the split this project kept failing to enforce by habit: planning authorizes planning only.

## Decision

**Adopt OpenSpec as the planning layer, and keep `docs/` as the authority.** `openspec/changes/<ticket>-<slug>/` is where a ticket is proposed, spec'd, designed, and task-listed. `docs/engineering-spec.md` remains the contract.

**`openspec/specs/` is a live per-capability spec surface, and it sits third in precedence** — below both specs, above the backlog:

1. `engineering-spec.md` — implementation detail
2. `overlap-master-doc.md` — intent
3. `openspec/specs/` — per-capability behavioural requirements
4. `backlog.md` — current state
5. `adr/` — decisions taken while building

The two spec surfaces are at different altitudes, which is the whole reason this is safe: `engineering-spec.md` states a rule; `openspec/specs/` states the observable scenarios that prove the rule holds. A delta spec that restates §4 verbatim has failed to do its job. **`openspec/specs/` never overrides the engineering spec, and never an invariant.** When the two disagree, the engineering spec wins and the loser gets fixed in the same commit — the rule this repo already runs on, extended to a third document.

Three things make that more than an intention:

- `openspec/config.yaml` carries the invariants, the precedence order, the test tiers, and the definition of done as **project context**, plus per-artifact rules requiring every proposal to name its spec section, its `INV-n`, its A-/FIX-/IMP-/X- finding, and its ticket. An agent that reads it cannot write a plan that would fit any product.
- Its `operations.archive` guidance makes folding an archived change back into `docs/` part of archiving, not a thing to remember afterwards.
- `pnpm verify:docs` runs `openspec validate --all --strict` and `openspec validate --archived` as an eighth check, so a malformed plan, or an archived change whose task list was never finished, fails CI like any other doc defect. The definition of done stays five commands.

## Alternatives considered

**Planning layer only — leave `openspec/specs/` empty, fold accepted rules straight into `engineering-spec.md`.** The conservative option, and the one that creates no second surface at all. Rejected deliberately by Mobina. It gives up `openspec list --specs`, spec validation, and the accumulated per-capability view, and it puts scenario-level detail into a document whose altitude is deliberately higher — §4 would either bloat or keep losing the detail, which is the gap this adoption exists to close.

**Full replacement — migrate `engineering-spec.md` into `openspec/specs/`.** Rejected. The engineering spec is not only requirements: it is the invariant table, the locked stack, the repo structure, the out-of-scope list, and the per-sprint DoD. Dissolving it into per-capability files would scatter §0 across a dozen directories, and §0 is the part that must be readable in one sitting. The four audits and `traceability.md` also reference it by section number throughout.

**Defer the spec-surface question until after one trial change.** Rejected as the worst of the three: `/opsx:propose` asks what to do with a delta spec on its very first run, so "decide later" means deciding it by accident, in a change, with no record.

**Do nothing; write acceptance criteria into the backlog row.** What the backlog itself proposed. Rejected because a row in a table is where this already failed — there is no room in a cell for a rejected alternative, a refusal scenario, or an ordered task list, and nothing checks that the cell was filled.

## Consequences

**Easier.** A ticket's scope is agreed before it is built, in writing, by the person whose call it is. The rejected alternative survives, so it does not get re-proposed in six months. A plan arrives already knowing about INV-1, the live-Postgres tier, and the five DoD commands, because `config.yaml` tells it. `verify:docs` grew teeth on a fourth surface.

**Harder.** There is now a third document that can state a rule, and this project's recurring defect is corrections lost between documents — that is what the coherence audit found thirty-two times. The mitigation is the archive guidance plus the precedence rule above, and neither is mechanically checkable. **This is the thing to watch.** If a rule is ever found stated in `openspec/specs/` and contradicted in `engineering-spec.md`, that is this ADR's risk landing, and it should be revisited rather than patched.

**To revisit if:** `openspec/specs/` starts restating the engineering spec instead of expanding it (the surfaces have collapsed to one altitude, and one of them should go), or `/opsx:propose` produces plans no more specific than a backlog row would have been (the context in `config.yaml` is not doing its job, and the fix is that file, not this decision).

**Also settled here:** everything under `.claude/` is committed, because the workflow is part of the repo rather than one machine's setup — but it divides in two, and the division is load-bearing. `.claude/commands/` and `.claude/skills/` are **vendored** output of `openspec update`, rewritten wholesale on every update, so `verify:docs` and Prettier skip them; editing one by hand loses the edit. `.claude/agents/` is **hand-written** — four subagents covering the work this repo says needs a reader — and is held to the doc rules like anything else in the repo, which is what stops a broken path in an agent's prompt quietly misdirecting the agent that follows it. `.claude/settings.local.json` stays ignored. The CLI is pinned at an exact version (`@fission-ai/openspec` 1.13.1) rather than floated with `npx @latest`, because `openspec update` rewrites the instructions the agents follow and that should be a reviewable diff, not a background drift. CLI telemetry is off.
