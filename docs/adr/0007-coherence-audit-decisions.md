# ADR-0007: Decisions on the coherence audit (X-1 … X-32)

**Status:** accepted
**Date:** 2026-09-04
**Decided by:** delegated to the implementing agent, on reasoning rather than preference.

`coherence-audit.md` raised 32 findings, eight proposals, and five corrections with no owner. The mechanical ones (stale text) were applied directly. This records the ones that required a judgment call, each with the argument that decided it — so a future reader can disagree with the reasoning rather than guess at it.

A theme worth stating up front: **several findings are best resolved by deleting a commitment rather than building it.** A correction that exists only in a schema column is not a mitigation; it is a note claiming to be one, and it costs more than nothing because it stops anyone looking at the problem again.

---

## X-1 — ~~Strike FIX-7. Do not make freshness cadence-aware.~~ **Superseded — see the amendment at the foot of this file.**

The audit offers two options: tie the freshness window to cadence, or strike FIX-7 and reopen A8. **Struck.**

- Its trigger condition — *"3 consecutive weeks with completion < 40% AND zero plans"* — is **not computable from the schema.** There is no per-group weekly completion history, and no ticket adds one.
- It could not fire during the pilot regardless: three consecutive qualifying weeks inside a four-week measurement window, in a five-group cohort.
- A8's actual mitigation is the three-week horizon (§2.3g: *"each Signal now feeds several planning windows rather than one"*). The stepdown is the secondary half, and the secondary half is the one that collides with freshness.
- Most importantly: **M5 asks whether the mechanic works at weekly cadence.** If it doesn't, the answer is to redesign the mechanic, not to ask less often. Building an adaptive cadence before the base cadence is validated is optimising a loop that may not exist.

`grp.cadence_weeks` stays (harmless, already migrated, and correct if A8 is revisited). Freshness stays a flat 7 days. **If FIX-7 is ever revived, freshness must become cadence-aware in the same change** — noted at the constant, because that coupling is exactly what X-1 found.

A8 returns to being an open question, which is a more honest state than a correction nothing implements.

## X-4 / P2 — Add `lapsed` as a first-class resolved state. **Implemented.**

Not primarily a retention decision. `copy.softHint` reads *"No conflict on their calendar, but they haven't confirmed"* — which is **false** about a member who tapped the night and whose signal aged out. A2's thesis is that this screen never misrepresents what a friend said; misrepresenting them pessimistically is still misrepresenting them, and it discards true information the system already has.

`ResolvedNightState = NightState | 'lapsed'` — resolution-only, never stored, so the DB enum and INV-1 are untouched. It scores exactly as little as soft does (INV-2 intact) but is counted and rendered apart.

**The one-tap re-confirm affordance (P2's other half) is deferred to its own ticket.** It is new API surface — a mutation confirming a single night — and the state is what fixes the falsehood. The affordance is what makes the state valuable, and it should be built deliberately rather than bolted on here.

## P3 — Raise the band floor to 3. **Implemented.**

At a cohort of two, *"the group is leaning low-key"* plus knowing who was free discloses both members' vibes. A5's finding is that small-group aggregation is not anonymity; a floor of two is not aggregation at all.

**Do not lower the k-anonymity floor of 5 to get pilot data.** It will rarely be reached at pilot scale, which means A5's correction ships largely unexercised — accept that consciously. Lowering a privacy floor to observe whether the privacy floor works trades the guarantee for evidence about the guarantee, which is backwards.

Implementing this surfaced a bug: `BAND_ELIGIBLE_FLOOR` was gating both the band *and* whether a headline appeared at all, so raising it silently raised the headline floor above §4's `|confirmed| >= 2`. Now `HEADLINE_FLOOR` and `BAND_FLOOR`, separately. This is X-16's pathology in miniature — one constant serving two concepts.

## X-5 — Calendar pre-fill is a **read path**. `calendar_sync` writes `busy_block` only.

The write path is not merely redundant, it is **structurally impossible**: `signal_night.signal_id` is `NOT NULL`, so a soft night must hang off a parent signal — meaning sync could only ever write `no_known_conflict` for users who **already signalled**, which is the exact population the state does not describe. The feature cannot work as specified.

So: delete the `signal_night` clause from §6; `signal.getDraft` computes from `busy_block` at read time and persists nothing; soft availability for non-signalling members, if wanted, is computed in the engine.

This dissolves rather than patches IMP-7/ADR-0005: **`overlap_worker` needs no `signal_night` grant at all.** Both INV-1 guards stay regardless — their real job is stopping a future contributor, not the current worker.

**Follow-on question, decided:** a night the user saw in the grid and deliberately did *not* tap shows **no** calendar-derived soft state. Once a signal is submitted, its taps are the whole truth for the dates it covered. An untapped night in a grid someone actually looked at is a considered answer, and overriding it with "no known conflict" over-reports a person who already told you — the same principle as INV-1, applied consistently.

## X-7 — Add `grp.timezone`. Convert once, at the query boundary.

Three specified behaviours require it (OV-8's group-local bucketing, FIX-6's 19:00 group-local default, FIX-5's local-midnight TTL) and none are computable without it. One column.

Reconciling with ADR-0002, which are both defensible but only one can hold: **`busy_block.timestamptz` → `YYYY-MM-DD` conversion happens once, at the query boundary, using `grp.timezone`. Everything downstream treats the result as an opaque string and does UTC arithmetic.** ADR-0002 governs the engine; `grp.timezone` governs what is handed to it. OV-8 gets rewritten to test the boundary, since the engine by design cannot fail it.

## X-8 — Add RSVP uniqueness before T13 builds on it.

CHPGM is the North Star and *"≥3 RSVPs"* is currently three **rows**, not three people — inflatable by one guest tapping three times. That is precisely the A6 failure it was corrected to avoid: the primary metric rising while the product fails. Unique indexes on `(plan_id, user_id)` and `(plan_id, guest_token)`, `plan.rsvp` upserts, and §17 restated as **"≥3 distinct respondents."** `plus_ones` does **not** count toward the three — they are not evidence anyone showed up.

## X-9 — `public_slug` gets FIX-12's treatment, at ≥16 characters, with no semantic content.

It is the sole access control on an unauthenticated, edge-cached page showing a friend group's real name, date, location and attendee list. The 60/min limit is a scraping defence, not an enumeration defence. A plan link also travels further than a join code and lives forever in message history, which is why it gets more entropy rather than the same.

## X-15 — Explicit RLS policies for `overlap_worker`, not `BYPASSRLS`. Use `session_user`.

RLS deny-all currently blocks the worker entirely; T9 would fail looking like an empty database. `BYPASSRLS` would fix it by making the worker a superuser-lite — a blunt instrument that removes the guarantee instead of expressing it. Explicit per-table policies keep RLS meaningful and self-documenting.

`guard_worker_role()` must test **`session_user`**, not `current_user`: the latter changes under `SET ROLE` and inside `SECURITY DEFINER` functions, so it does not reliably identify who connected.

And the thing the RLS finding implies but never states, now recorded: **PostgREST is not an API surface for this product. All data access is via tRPC; the anon key is never used for data.** Deny-all is only correct while that holds, and the first `supabase.from()` in client code breaks it silently.

## X-19 — Move prior-signal pre-fill into T6.

A1's correction rests on pre-fill making weeks two and three cost *one tap*. Without it the horizon costs ~21 taps and the ten-second budget — which **is** the retention mechanic — is blown. A Sprint 2 DoD item cannot depend on a Sprint 3 ticket.

Prior-signal pre-fill has **no calendar dependency**. T6 takes it (and `signal.getDraft`, prior-signal source only); T10 extends `getDraft` with `busy_block` as a second source. Measure the ten-second median against the version that has pre-fill, since that is the only version the product is designed around.

## X-20 / P7 — Split the DoD into code-complete and verified-live, with M4 as the wall.

The current rule is being violated by the only sensible course of action, and a rule routinely and correctly violated stops being read. **Code-complete** blocks the next ticket; **verified-live** blocks the pilot. One hard rule preserves the original intent: *no verified-live box may still be open when M4 is declared.*

## X-12 — Name collection needs a ticket. The leak is already fixed.

`display_name` was seeded from the phone number and rendered in the member list, so every group member was shown every other member's phone. Fixed immediately (neutral placeholder, verified live) — that was a defect, not a decision. The decision is the remainder: **a first-run name step belongs in T4's group create/join flow**, not T3. Someone signing in has no reason to name themselves yet; someone joining a group with six friends obviously does, and it is the moment the name is first needed.

Nullable-with-fallback is the tempting alternative and is rejected: the fallback would have to be *something*, and every candidate either leaks (phone) or is useless at scale ("New member" ×7).

## P8 — The pilot runs on SMS only.

M5 turns on delivery-adjusted completion, and web push has **no delivery receipt** — a push service accepting a message is not evidence it arrived. Mixing a structurally unobservable channel into the one measurement that decides whether the product continues is A3's failure inverted: the wrong lesson learned at the most expensive moment. Ship web push; keep the pilot cohort on SMS; report Delivery Rate **per channel, never pooled**.

## P4 — Carry the attendance prompt in the Signal. (For T19.)

CHPGM depends on the attendance prompt firing, but §6 specifies it in-app only — invisible to exactly the people who don't open the app between plans, which is the Dead Interval thesis's entire population. The Sunday Signal is already budget-exempt, already guaranteed delivery, and already lands after most weekend plans. Append it **at the end, in the reveal**, after submit — where the user is being rewarded and is at their most willing — and only when a plan is actually pending confirmation.

## The five ownerless corrections

| Correction | Decision |
|---|---|
| **FIX-5** — precompute + Redis cache | **Defer past M5.** Recomputation is trivially fast for five groups of seven; the 50ms target is not at risk at pilot scale. Premature, and it adds a cache-invalidation contract before there is load to justify one |
| **FIX-7** — cadence stepdown | **Struck** — see X-1 |
| **A10 share card** | **Build it — new ticket, after T12.** It is §2.5's answer to the Empty Room Problem, which is the product's single largest risk, and below-threshold is the *normal* state at pilot start. Sequenced after T12 so it shares that ticket's OG-image machinery rather than duplicating it |
| **Founder-triggered first Signal** | **Fold into T16.** It needs the dispatcher to reach anyone but the founder, so it cannot precede it. Genuinely valuable: it removes a up-to-six-day wait at the moment of peak enthusiasm |
| **Apple / CalDAV** | **Google-only for v1**; amend §6.1, which currently promises both. §9.3 already permits this. Manual night-tapping is the fallback, and calendar sync is a convenience, not the mechanic. Flag the risk honestly: an iPhone-heavy pilot group gets no sync at all |

## Consequences

The net effect is **fewer commitments, more honestly held**. Two corrections are struck (FIX-7, Apple), one deferred (FIX-5), two given owners (share card, founder-triggered Signal), and three schema changes queued before the tickets that would build on them (`grp.timezone`, RSVP uniqueness, `public_slug`).

> **Superseded in part.** FIX-7 is **deferred, not struck** — see the amendment below. The count above reads *one* struck correction (Apple), not two.

The decisions that touch shipped code — `lapsed`, the band floor, the `display_name` leak — are implemented and tested. The rest are spec and ticket changes that land ahead of the tickets they affect, which is the point: each was found in the seam between documents, and the fix is to close the seam before the code arrives.

---

## Amendment, 2026-09-04 — X-1 partially reversed by `audit-report.md` FIX-13

**Status:** accepted, superseding the X-1 section above.

`audit-report.md` — the design audit both specs cite, added to the repo after this ADR was written — carries a **FIX-13** written in response to the decay defect reported from T6. It specifies the resolution differently than X-1 above decided, on two points. FIX-13 wins on both, and the reasoning is worth keeping because the disagreement was substantive rather than clerical.

### 1. Freshness *is* cadence-derived. (Reversed.)

X-1 argued: FIX-7 is unbuildable now, so strike it, and freshness stays a flat 7 days with a comment telling whoever revives it to fix freshness in the same change.

That reasoning had a hole. **A note instructing a future contributor to remember something is exactly the mechanism this repo's coherence audit exists because of.** X-1 was itself a finding about a correction that lived in a comment and was never carried through; resolving it with another comment reproduces the pathology it identified.

Deriving the window from `cadence_weeks` costs one parameter and, at today's universal `cadence_weeks = 1`, produces **behaviour identical to the flat rule** — every existing test passed unchanged. It is free, and it makes the trap structurally impossible instead of documented. Test **RS-7** pins it.

### 2. Decay has three stages, not two. (Added.)

X-1 did not consider this and neither did the coherence audit. FIX-13's argument is correct and I had missed it: **`lapsed` is still shown**, so a two-state model produces a fade that never finishes. Someone who signals once in September stays visible at reduced weight until the dates themselves roll past. Master doc §2.3d promises they "fade out of the picture entirely", and no combination of two states delivers that.

Stage 3 drops the night **whatever state it held**, including `blocked` — a decision beyond FIX-13's letter, taken for consistency with the reasoning that produced `lapsed` in the first place. A two-cycle-old "I'm busy" asserts a conflict the member may no longer have, and the honesty argument that forbids stale confirmations forbids stale conflicts equally. Silence is the accurate representation of *we no longer know*. **RS-8** covers it.

### What survives from X-1

FIX-7's **stepdown** is still not built, for X-1's original and undisturbed reasons: its trigger needs completion history no table holds, it cannot fire in a four-week pilot, and adapting a cadence before validating the base cadence optimises a loop that may not exist. **A8 stays reopened.** The change is one of register — from *struck* to *deferred* — and the difference is real: `cadence_weeks` is now read by the engine rather than being an inert column, so the stepdown becomes a switch to flip rather than a feature to re-derive.

**Meta-note, and the reason this amendment is written rather than the ADR quietly edited:** the previous decision was reached by reasoning honestly from the documents available at the time, and was wrong in a way no amount of further thought about those documents would have exposed — the missing input was a document that had not yet been added. This is the third time in this project that a defect was found by an artifact arriving late rather than by re-reading what was already present, which is worth remembering the next time a decision feels finished.
