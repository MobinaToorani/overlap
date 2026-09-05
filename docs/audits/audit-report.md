# Audit Report — Build Documentation

**Scope:** `engineering-spec.md` v1.0, `agent-prompt.md`, `founder-checklist.md`, `marketing-plan.md`, `overlap-master-doc.md` v0.2
**Method:** traced each document as if executing it literally — running the DDL, implementing each ticket in order, following each checklist item — and recorded every point where it would fail, stall, or require a guess.
**Result:** 12 defects. 3 blocking, 1 silent-failure, 8 correctness or compliance. All fixed in place.

---

## Blocking — the build stops or produces wrong output

### FIX-1 · `app_user` was orphaned from Supabase Auth
`engineering-spec.md` §3

The schema created `app_user` with an independently generated `uuid` primary key, while auth was specified as Supabase phone OTP — which manages its own `auth.users` table. Nothing connected them. Ticket T3 would have completed with a working login that could not resolve a session to an application row, and the failure would surface at T4 as a nonsensical foreign key error.

**Fix:** `app_user.id` now `REFERENCES auth.users(id) ON DELETE CASCADE`, with a note that the row is created in the OTP verify handler rather than generated.

---

### FIX-2 · Signal resolution was completely undefined
`engineering-spec.md` §4.0 (new section)

The most consequential omission. The overlap engine consumed "the signals for a group," but that phrase hid two unresolved ambiguities:

**(a) Global vs. group-scoped.** Audit finding A4 made signals global by default with an opt-in per-group override. But nothing said what happens when a user has both for the same week. Merge? Union the nights? Prefer one?

**(b) Overlapping horizons.** This is the worse one. Every Sunday a user creates a signal covering 21 days. Last week's signal covered 21 days too — **fourteen dates are covered by both rows.** The `UNIQUE (signal_id, date)` constraint permits this, because they're different `signal_id`s. The engine would have returned two conflicting nights for the same user on the same date, and `confirmedCount` would have double-counted people.

Left unspecified, an agent resolves this by guessing, and the guess lands inside the one piece of real logic in the product.

**Fix:** a dedicated `resolveSignals()` function, specified with explicit precedence — group-scoped wins wholesale over global; most recent `submitted_at` wins per date; week-0 nights from signals older than 7 days downgrade to soft. Four new tests, RS-1 through RS-4. Promoted to its own ticket (T5) ahead of the engine itself.

This also resolves something the master doc left hanging: progressive decay is now implemented here, at read time, with no expiry job and no `expires_at` column.

---

### FIX-10 · `plan.ends_at` was nullable, breaking the attendance job
`engineering-spec.md` §3, §6

`attendance_prompt` queries plans past `ends_at`, but `ends_at` had no NOT NULL constraint and no default. Every plan created without an explicit end time would be invisible to the job — meaning it would never receive an attendance confirmation, meaning it would never count toward **Confirmed Hangs, the North Star metric.** The primary metric would have silently under-reported by whatever fraction of plans omitted an end time, which for a casual planning app is most of them.

**Fix:** `NOT NULL`, defaulted to `starts_at + 4h` at write time.

---

## Silent failure — works in testing, breaks the product in the field

### FIX-3 · Plan invites could starve the Sunday Signal
`engineering-spec.md` §7

The dispatcher checked the 4-per-week notification budget **before** considering rank. The ranking table existed, but it only governed *ordering*, not *survival*.

Concretely: a user in three active groups receives four plan invites between Thursday and Saturday. Budget exhausted. Sunday arrives, `dispatch()` counts four sends in the trailing seven days, and drops the Signal — the one notification the master doc explicitly states must never be crowded out.

This is the worst class of bug in the whole set, for three reasons:

1. It fails for **the most engaged users first** — people in multiple active groups getting lots of invites.
2. It fails **invisibly**. There's no error, just a missing message.
3. It would corrupt the M5 gate. Signal Completion drops, and the conclusion reads *"the ritual doesn't work"* when the truth is *"we stopped sending it to the people who use us most."* The correct response would be a one-line dispatcher fix; the recorded response would be redesigning a mechanic that was fine.

**Fix:** `kind='signal'` is exempt from the budget entirely and can never be dropped. Discretionary ceiling drops to 3, keeping the effective total at 4. Ranked pre-emption added so a higher-rank send can displace an undelivered lower-rank one. A starvation test is now a Sprint 5 exit criterion, and the agent prompt instructs writing that test *before* the dispatcher.

---

## Correctness and compliance

### FIX-4 · The INV-1 trigger was weaker than advertised
The trigger checked `written_by <> 'user'` — but `written_by` is supplied by the caller. A sync job passing `written_by='user'` defeats it completely. It catches accidents, not determined code, while the invariant table implied a hard guarantee.

**Fix:** added a real boundary — a separate `overlap_worker` Postgres role with no grant permitting the value, plus a second trigger checking `current_user`. The original trigger stays as a first line of defence, now honestly labelled.

### FIX-5 · Cache TTL outlived the data's validity
`overlap_precompute` cached with a fixed 6h TTL, but freshness downgrades (§4.0) are date-dependent. A cache written at 22:00 would serve yesterday's confirmed nights until 04:00 the next day.
**Fix:** TTL expires at the next group-local midnight, plus a daily 00:05 recompute.

### FIX-6 · No date-to-timestamp conversion rule
A heatmap night is a `DATE`; `plan.starts_at` is a `TIMESTAMPTZ`. Nothing said how to bridge them, so every plan created from the heatmap would have had an agent-invented default time.
**Fix:** defaults to 19:00 in the group's timezone. Also fixed `is_home_hang`, which was in the schema but never populated by any flow — it now defaults TRUE when `location_text` is empty, which is what actually measures Open Question 7.

### FIX-7 · Cadence stepdown had no trigger condition
`cadence_weeks` existed with no rule for when a group moves between weekly and fortnightly.
**Fix:** explicit thresholds — down after 3 consecutive weeks below 40% completion with zero plans; up immediately on any plan creation; floor at 2.

### FIX-8 · Edge caching and guest RSVP contradicted each other
The public page was specified as both edge-cached and mutable by unauthenticated guests. The second guest to RSVP would see a cached page missing the first.
**Fix:** split the page — cache the static shell for the sub-1s LCP target, fetch the attendee list client-side uncached.

### FIX-9 · No rate limits in the engineering spec
The master doc mentioned rate limiting once, in prose. The engineering spec — the document the agent actually implements from — had none. `auth.requestOtp` in particular is a direct billing-attack vector, since every OTP is a paid SMS.
**Fix:** a rate-limit table covering all five public routes, promoted to ticket T21, with an explicit instruction that it lands before any invite link is shared.

### FIX-11 · No account deletion or data export
Required under PIPEDA, and an App Store rejection reason the moment native shells ship at M6.
**Fix:** three new procedures, ticket T22, including message and plan anonymization so deleting a user doesn't orphan a group's history.

### FIX-12 · Join code entropy unspecified
`join_code text UNIQUE NOT NULL` with no length, alphabet, or guessability requirement. An agent might produce a 4-character code, making groups brute-forceable.
**Fix:** minimum 10 characters from a 32-character unambiguous alphabet, never sequential, with a join-attempt rate limit. Also added the missing `grp.deleted_at` for soft deletion.

---

## Checked and found sound

- Cross-document consistency on the numbers that matter: liveness threshold is 3 everywhere, three-week horizon is consistent, SMS-first is consistent, the M5 gate figure matches across master doc, spec, and prompt.
- The locked stack is internally coherent. Tailwind v4's CSS-first config suits the `:root` token approach; tRPC v11 and Drizzle work with Next.js 15 App Router.
- INV-2 through INV-8 are correctly placed and testable.
- The founder checklist's ordering is right — A2P 10DLC and OAuth verification genuinely are the long-lead items, and A2P correctly chains behind business registration and a live privacy policy.
- Cost estimates are the right order of magnitude.
- The marketing plan contains no claims requiring verification and no tactics that would breach platform rules.

---

## Found during implementation

### FIX-13 · Decay applied only to week 0, so abandoned signals never faded
*Reported by the implementing agent at T6. Spec defect, not an implementation defect.*

`engineering-spec.md` §4.0 v1.1 scoped the freshness downgrade to `horizon_week == 0`. Weeks 1 and 2 had no decay at all, so a user who signalled once and never returned kept scoring as a **hard confirmation** for those weeks indefinitely. Fourteen days after her only signal, Alice still counted as confirmed-free in the headline.

Two consequences, both serious: it reintroduced precisely the over-reporting that A2 exists to prevent, and it removed the consequence for skipping that makes the loss-aversion mechanic work.

The conflict was visible because master doc §2.3d described the intended behaviour correctly while the spec implemented something narrower. **The precedence rule — spec wins on implementation, master doc wins on intent — worked as designed:** it surfaced the divergence as a question rather than letting it become a silent behavioural difference.

**Fix:** decay now applies to every horizon week, in three stages (confirmed → soft → dropped) rather than two, because "fade out entirely" cannot be produced by a single cliff. The threshold derives from the group's `cadence_weeks` rather than a flat 7 days, since FIX-7 steps quiet groups to fortnightly and a flat rule would penalise them for complying. Four new tests, RS-5 through RS-8. Master doc §2.3d rewritten to state the three stages explicitly rather than describing them in prose.

**Process note:** the agent stopped and asked rather than changing semantics unilaterally. That is the correct behaviour for any change to what the product asserts about people, and it should be reinforced.

---

## Remaining known limitations — accepted, not fixed

These are real and deliberately not addressed. Listed so they don't get rediscovered as surprises.

- **No offline support.** The PWA requires connectivity. Acceptable for v1; the Signal is a 10-second interaction.
- **No group member removal flow.** Only self-leave exists. Fine for friend groups; revisit if a group ever needs to eject someone.
- **No plan editing after creation.** Delete and recreate. A v2 concern.
- **Timezone changes mid-week** (a user travelling) may produce odd night bucketing. Rare, low impact, ignore until observed.
- **No message moderation.** Plan threads are among people who chose each other. Acceptable while groups are private and invite-only, but this becomes a real gap the moment anything is publicly discoverable.
- **The 20-ticket sequence is tight for 10 build weeks part-time.** T9 (OAuth) and T12 (invite page) are each larger than a typical ticket. If the schedule slips, cut T14 (plan thread) before cutting T12 — the invite page is the acquisition engine and the thread is a nice-to-have that iMessage already covers.
