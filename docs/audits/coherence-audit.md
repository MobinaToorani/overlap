# Cross-Document Coherence Audit

**Period:** 2026-09-04
**Scope:** all eight documents — `overlap-master-doc.md` v0.3, `engineering-spec.md` v1.2, `README.md`, `agent-prompt.md`, `backlog.md`, `founder-checklist.md`, `implementation-audit.md`, `marketing-plan.md`
**Method:** every claim in every document checked against every other document. Findings only count here if the contradiction is quotable from two places, or the gap is demonstrable by tracing a required behaviour to a schema column, a ticket, or a test that does not exist.

**Not to be confused with** `audit-report.md` (the adversarial review of the *design*, findings A1–A11) or `implementation-audit.md` (defects found in the *code*, IMP-1–IMP-14). This is the third axis: defects found in the **relationships between the documents**. Findings are tagged `X-n`.

---

## Why this axis exists

The A-series audited the product against reality. The IMP-series audited the code against the spec. Nothing has audited the spec against the master doc, or either against the tickets that are supposed to implement them.

That gap is not theoretical. The v0.2/v1.1 audit produced twelve numbered corrections. **Three of them (FIX-5, FIX-7, and A10's share card) have spec surface but no ticket in T1–T22** — they will simply never be built, and nothing in the current process would ever notice. Two more (IMP-1's freshness rule and the OAuth start date) were corrected in one document and left standing in another.

The pattern from `implementation-audit.md` — *"every defect that mattered was found by running the thing"* — has a counterpart here:

> Every correction that got lost was lost in the seam between two documents that each assumed the other was carrying it.

The single highest-value fix in this report is not any individual finding. It is **Appendix A**: one table mapping every audit finding to its invariant, its ticket, and its test. It is the artifact that makes the seam visible.

---

## Verdict

The documents are unusually good. The reasoning is sound, the audit culture is real, and the honesty about unverified work is better than most funded teams manage. The defects below are almost entirely *drift* — the cost of correcting four documents in two passes without a mechanism that forces the fourth to move when the first does.

Six findings are Tier 1: they would silently produce wrong behaviour, and two of them would do it in exactly the way A2 exists to prevent. **X-1 is the most serious thing in this report** — it is a latent product-killing interaction between two corrections that were each individually right.

---

## Tier 1 — Would silently break the product

### X-1. The fortnightly cadence and the seven-day freshness rule cancel each other out

**Sources:** `engineering-spec.md` §3 FIX-7 + §4.0 (corrected) + §6 `signal_dispatch`; `overlap-master-doc.md` §2.3g, A8.

Two corrections, each right on its own:

- **FIX-7 / A8:** a group with sustained low plan volume steps *down* to `cadence_weeks = 2`. It is asked for a Signal every fourteen days.
- **IMP-1 / §4.0 v1.2:** a confirmation older than **seven days** stops counting as a hard yes, whichever week it sat in.

Put them together. A fortnightly group signals on Sunday the 6th. By Sunday the 13th every member's signal is seven days old, so **every confirmed night for every member in the group downgrades to soft simultaneously.** `confirmedCount` is zero across all 21 nights. `bestNight` is meaningless. The headline is `null`. `computeOverlap()` returns, correctly and per spec, a heatmap that says the group has no overlap at all — for the entire second week of every cycle, forever.

The failure is worse than empty, because it is *selective*: it hits precisely the groups the stepdown was designed to rescue. A8's correction was "better to ask less often than to be ignored." As specified, asking less often makes the product go blank half the time, which is a considerably faster route to being ignored.

**Correction.** The freshness window is not a constant; it is a property of the ask. Tie it to the cadence the group is actually on:

```
freshnessWindow = 7 * group.cadence_weeks + gracePeriod   // grace ≈ 2 days
```

A confirmation should survive until slightly past the moment the next Signal was due, because *that* is the moment the user's silence becomes information. The current rule encodes "your answer expires seven days later"; the rule the product wants is "your answer expires when you were asked again and didn't reply."

This has one consequence worth accepting deliberately: `resolveSignals()` becomes group-aware, and a global signal can resolve differently in a weekly group than in a fortnightly one. That is correct — the *signal* is global (Rule 3, A4), but its *staleness* is relative to what each group asked for. It is a small extra parameter and it keeps both corrections intact.

**Test to add:** `RS-6` — a group at `cadence_weeks = 2` with all members signalled on day 0 still reports non-zero `confirmedCount` on day 10.

---

### X-2. The master doc's dispatch idempotency key multiplies the ritual, defeating A4

**Sources:** `overlap-master-doc.md` §9.3 vs `engineering-spec.md` §6.

> §9.3: *"Idempotency key: `(user_id, group_id, week_start_date)`."*
> §6: *"Idempotency key: `signal:{user_id}:{week_start_date}`."*

These are not two phrasings of one rule. The master doc's key is per-group, which means **a user in three groups receives three Sunday Signal messages.** That is precisely finding A4 — *"the ten-second promise becomes thirty seconds of repetitive input, and the people with the most social surface area churn first"* — reintroduced in the implementation notes of the same document that raised it.

It also breaks the notification budget arithmetic. FIX-3 reserves exactly one slot per week for the Signal; three signals consume three, and the "3 discretionary + 1 reserved" ceiling in §7 becomes 3 + 3.

The spec's key is the correct one. §9.3 is stale text from v0.1, written before Rule 3 existed.

**Correction.** Delete the group from the key in §9.3. Then resolve what §9.3 leaves undefined even after the fix: **when a user belongs to groups with different `signal_dow`, `signal_hour`, or `cadence_weeks`, whose settings govern the single global Signal?** Neither document says. Proposed rule, in keeping with "the cost must not scale with group count": dispatch at the **earliest** local slot among the user's groups in any week where **any** group's cadence is due. Write it down; an agent will otherwise invent it.

---

### X-3. INV-4 leaks in the spec's own pseudocode, and the type signature does not make it structural

**Sources:** `engineering-spec.md` §4 Algorithm and Signature; `README.md` invariant table.

The algorithm block:

```
if |confirmed| >= 5:
    vibeCounts = tally(confirmed.vibe) minus 'broke'   # INV-4
    vibeBand   = derive(vibeCounts)
else:
    vibeCounts = null
    vibeBand   = derive_band(confirmed.vibe) if |confirmed| >= 2 else null
```

`broke` is subtracted in the first branch and **not in the second.** Below a cohort of five — which is every pilot group, on most nights — the band is derived from the raw vibe list including `broke`. INV-4 says `broke` never appears in any *count, band, or list, at any cohort size*. The else-branch violates the invariant it sits three lines below.

The concrete leak: a cohort of three where two people tapped `Broke this week` and one tapped `Low-key only`. Whatever `derive_band` does with a modal input returns a band shaped by the two broke members. In a seven-person group, "the group is leaning [whatever broke maps to]" plus knowing two people's plans is exactly the A5 arithmetic — and this is the one vibe A5 said must never be inferable at any size.

Two further problems in the same six lines:

1. **`derive()` and `derive_band()` are never defined anywhere in either document.** The spec's stated purpose is *"remove every decision an agent would otherwise invent."* This is the mapping from five vibes to three bands (`expansive | mixed | low_key`), and it is left to invention. Note also the naming mismatch: the enum value is `down_for_anything`, the band is `expansive`, and nothing states the correspondence. `out_of_town` has no band at all — does an out-of-town member drag the group toward `low_key`? They should almost certainly be excluded from band derivation entirely, since they are not a mood, they are an absence.
2. **`vibeCounts: Record<string, number> | null` does not make INV-4 structural.** The README claims *"`computeOverlap()`'s output type makes this structurally true, not just policy."* `Record<string, number>` accepts a `broke` key without complaint. The claim is aspirational; the type is not carrying it.

**Correction.**

```ts
type PublicVibe = Exclude<Vibe, 'broke'>;              // structural INV-4
type VibeBand   = 'expansive' | 'mixed' | 'low_key';

vibeCounts: Partial<Record<PublicVibe, number>> | null;
```

Strip `broke` (and `out_of_town`) **once, at the top of the vibe pipeline**, before either branch runs — not per branch. Then define `deriveBand()` explicitly in the spec with its own test, and raise the band floor: see X-4's neighbour, P3.

**Tests to add:** `OV-11` — cohort of 3, two `broke` and one `low_key`, band must be identical to the band for a cohort of 1 `low_key`. `OV-12` — `deriveBand` mapping table, one case per input distribution.

---

### X-4. "Soft" means two different things, and the tooltip is false for one of them

**Sources:** `engineering-spec.md` §4.0 (freshness downgrade), §9 `copy.softHint`, §8 `--soft-stroke`; `overlap-master-doc.md` A2, §7.3.

After the v1.2 freshness correction, a night renders as *soft* in two entirely different situations:

1. Calendar sync found no conflict; the person has said nothing. → `softHint` is accurate.
2. The person **affirmatively tapped this night** and their signal has since aged past seven days. → `softHint` reads *"No conflict on their calendar, but they haven't confirmed."* This is factually false. They did confirm. It went stale.

One visual state, one string, two meanings — and the product's entire trust thesis (A2) is that this screen never misrepresents what a friend said. Misrepresenting it in the *pessimistic* direction is less damaging than the A2 failure, but it is the same class of error, and it wastes the most valuable thing on the screen: a night where someone actually said yes and simply needs to re-confirm.

**Correction.** Three display states, not two:

| State | Meaning | Scores | Renders |
|---|---|---|---|
| `confirmed` | tapped, fresh | yes | solid saturation |
| `lapsed` | tapped, stale | no | solid outline, muted — *"Said yes on the 6th"* |
| `soft` | calendar-clear, never tapped | no | hatched — current `softHint` copy |

`resolveSignals()` already computes exactly this distinction; it currently discards it by collapsing case 2 into case 1's output state. Carrying it costs one enum value.

This is also the cheapest retention surface in the product and it currently does not exist: a `lapsed` night is a one-tap re-confirm from a member who has already told you they want that night. See **P2**.

**Test to add:** `RS-7` — a 9-day-old `confirmed_free` night resolves to `lapsed`, not `soft`, and is excluded from `confirmedCount`.

---

### X-5. There are two contradictory calendar pre-fill mechanisms, and the one in the schema cannot reach the people it describes

**Sources:** `engineering-spec.md` §3 (`signal_night.signal_id NOT NULL`), §5 `signal.getDraft`, §6 `calendar_sync`; `agent-prompt.md` T10.

§6 says `calendar_sync` *"Writes `signal_night` only as `blocked`/`no_known_conflict` with `written_by='sync'`."*
§5 says `signal.getDraft` returns *"prefilled nights from `busy_block` + prior week."*

These are two different architectures for the same feature. The first is a write path (the worker materialises soft nights into the table). The second is a read path (the client computes a draft at request time and nothing is persisted until the user submits). T10 is written in the language of the second. §6 and INV-1's entire DB apparatus are built for the first.

The write path also has a hard structural problem: **`signal_night.signal_id` is `NOT NULL`.** A soft night must hang off a parent `signal` row. So `calendar_sync` can only write `no_known_conflict` for a user who has *already submitted a signal that week* — which means the `no_known_conflict` state is structurally unreachable for the exact population it was designed to describe: members who have not signalled. `softCount` can never include a non-signalling member. In a group where three of seven signalled, the other four contribute nothing at all to the heatmap even if their calendars are wide open.

**Correction.** Pick the read path, and say so:

- `calendar_sync` writes **`busy_block` only.** Delete the `signal_night` clause from §6.
- `signal.getDraft` computes the draft from `busy_block` at read time and persists nothing.
- Soft availability for non-signalling members, if it is wanted at all, is computed in `computeOverlap()` from `busy_block` — not stored.

This also resolves ADR-0005 / IMP-7 cleanly: **`overlap_worker` needs no `signal_night` grant whatsoever**, because it never writes that table. The GRANT gap the implementation audit found is not a spec omission to be patched — it is the spec's §3 being right and its §6 being wrong.

Keep both INV-1 guards regardless. Defence in depth costs nothing and the trigger's real job is stopping a *future* contributor, not the current worker.

**Then decide the question neither document answers:** on a night the user saw in the grid and deliberately did **not** tap, does calendar-derived soft availability still display? A2's logic says no — an untapped night is a considered answer, and showing it as "no known conflict" over-reports a person who has already told you. Recommended rule: **once a user submits a signal for a week, calendar-derived soft state is suppressed for every date that signal covered.** Their taps are the whole truth for that window.

---

### X-6. The engine's horizon and the signal's horizon are different 21-day windows

**Sources:** `engineering-spec.md` §4 Algorithm (`horizon = next 21 days from today`), §3 (`signal.week_start_date`), §4.0.

The engine's window is `[today, today+20]`. A signal's nights run from its `week_start_date` — the Sunday — for 21 days, i.e. `[week_start, week_start+20]`.

On a Thursday these windows are offset by four days. The consequences:

- The last four days of the engine's horizon are covered by **no current signal from anyone.** They render permanently empty, mid-grid, for reasons no user could deduce.
- The first days of a signal are in the engine's past. `signal_night` rows for dates before today are stored and then silently ignored — or not, since nothing says to filter them.
- A user who signals late in the week is offered night pills for days that have already happened, unless T6's grid separately excludes them (the backlog says the grid is "three week-aligned rows," which suggests it does not).

Neither document defines `week_start_date` (is it the Sunday preceding submission, or the upcoming one?), and the answer changes the whole picture.

**Correction.** State it once, in §4.0, next to the other two ambiguity rules:

- `week_start_date` is the **Sunday on or before `submitted_at`**, in the user's timezone.
- The Signal grid offers nights from `max(today, week_start)` through `week_start + 20`. Past nights are never offered and never written.
- The engine horizon is `[today, today + 20]`. Nights outside it are ignored at read time, not deleted.
- Accept the consequence: the tail of the horizon thins out as the week progresses and refills every Sunday. That is honest and it is a reason to signal, not a bug — but it must be a stated property, because otherwise the first person to notice will "fix" it by extending someone's signal.

---

## Tier 2 — Would block delivery, or is a defect in the contract

### X-7. `grp` has no timezone column, but three separate rules require one

**Sources:** `engineering-spec.md` §3 (`grp`), §4 OV-8, §5 `plan.createFromNight`, §6 `overlap_precompute`; `README.md` core-algorithm section; ADR-0002.

Three requirements name a group timezone:

- **OV-8:** *"Night bucketing uses the group's local date, not UTC."*
- **`plan.createFromNight` (FIX-6):** *"Default `startTime` to 19:00 in the GROUP's timezone."*
- **`overlap_precompute` (FIX-5):** *"at 00:05 group-local daily"*, TTL *"expire at the next local midnight."*

`grp` has `signal_dow` and `signal_hour` but **no timezone**. Only `app_user` has one. The group's local date is not computable from the schema.

Worse, OV-8 contradicts the shipped implementation and its ADR. The README states the engine treats every date as an opaque `YYYY-MM-DD` and does all arithmetic in UTC, per ADR-0002 — a decision made specifically to avoid the misbucketing OV-8 is testing for. So OV-8 either fails, or passes vacuously, or was quietly reinterpreted. All three are bad outcomes for a mandatory test.

**Correction.** Add `grp.timezone text NOT NULL DEFAULT 'America/Toronto'`. Then reconcile the two philosophies explicitly, because they are both defensible and only one can be true:

> Dates are bucketed by the **group's** timezone. The conversion from `busy_block.timestamptz` to a `YYYY-MM-DD` night happens **once, at the query boundary**, using `grp.timezone`. Everything downstream — `resolveSignals`, `computeOverlap`, `dateUtils` — treats the result as an opaque string and does all arithmetic in UTC. ADR-0002 governs the engine; `grp.timezone` governs what gets handed to it.

Then rewrite OV-8 to test the boundary rather than the engine, since the engine by design cannot fail it.

---

### X-8. `rsvp` has no uniqueness constraint, and the North Star counts RSVPs

**Source:** `engineering-spec.md` §3 (`rsvp`), §17 CHPGM definition.

`rsvp` has `CHECK (user_id IS NOT NULL OR guest_name IS NOT NULL)` and nothing else. There is no unique key on `(plan_id, user_id)`, no concept of guest identity, and `plan.rsvp` is documented as the endpoint a user calls to respond — with no statement of whether a second call updates or inserts.

Consequences, in ascending order of seriousness:

1. A member who changes `going` → `maybe` produces two rows and the attendee list shows them twice.
2. A guest can RSVP under the same first name repeatedly. The rate limit (5/hour/IP/slug) throttles it; it does not prevent it.
3. **CHPGM — the North Star — requires "≥3 RSVPs."** Three rows is not three people. The primary metric is inflatable by one guest tapping three times, which is exactly the class of failure A6 corrected the North Star to avoid.

**Correction.**

```sql
CREATE UNIQUE INDEX uq_rsvp_user  ON rsvp (plan_id, user_id)    WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX uq_rsvp_guest ON rsvp (plan_id, guest_token) WHERE user_id IS NULL;
ALTER TABLE rsvp ADD COLUMN guest_token text;  -- set from a signed cookie on /p/[slug]
```

`plan.rsvp` upserts on those keys. Restate CHPGM as *"≥3 distinct respondents"* in §17. And define whether `plus_ones` counts toward the three — currently undefined, and it changes the number.

---

### X-9. `public_slug` has no generation rule, and it is the only thing protecting a plan

**Sources:** `engineering-spec.md` §3 (`plan.public_slug`) vs `grp.join_code` (FIX-12).

`join_code` got a full treatment in FIX-12: ≥10 characters, 32-symbol unambiguous alphabet, never sequential, rate-limited. `public_slug` — which is the sole access control on an unauthenticated, edge-cached page showing a friend group's real name, date, location, and attendee list — is specified as `text UNIQUE NOT NULL` and nothing more.

An agent will reach for something readable: `thursday-drinks`, or worse, an incrementing id. Either is enumerable, and `plan.getPublic` is rate-limited at 60/min per IP, which is a scraping limit, not an enumeration defence.

**Correction.** Apply FIX-12 verbatim to `public_slug`, with one addition: slugs must be **≥16 characters** (a plan link travels further than a join code and lives forever in message history), and must not encode the group name, the date, or anything else that makes a guess cheaper. If a human-readable slug is wanted for aesthetics, make it `{readable}-{16-char-random}` and validate only the random part.

---

### X-10. `busy_block` has no natural key, so "upsert" is undefined

**Source:** `engineering-spec.md` §3, §6 `calendar_sync`.

§6: *"Google FreeBusy for next 21 days → **upsert** `busy_block`."*

`busy_block` has a `gen_random_uuid()` primary key and no other constraint. There is nothing to conflict on. As specified, `calendar_sync` running every six hours either duplicates every busy interval four times a day, or the agent invents a key.

FreeBusy also offers no stable external id — the API returns intervals, not events, deliberately (that is the privacy win). So there is no id to store.

**Correction.** Replace the upsert with a scoped replace, which is the only correct pattern against an interval API:

```sql
DELETE FROM busy_block
 WHERE user_id = $1 AND source = 'calendar'
   AND starts_at >= $window_start AND starts_at < $window_end;
-- then bulk INSERT the fetched intervals
```

in one transaction. Note this also gives `calendar.disconnect`'s "purge immediately" requirement the same code path. Add `UNIQUE (user_id, source, starts_at, ends_at)` as a belt-and-braces guard against double-inserts within a window.

---

### X-11. `expires_at` is still promised in the master doc; the column does not exist and "ignore" is the wrong verb

**Sources:** `overlap-master-doc.md` §9.3 vs `engineering-spec.md` §4.0 (v1.2) and §3.

> §9.3: *"A signal has `expires_at`; the overlap query simply ignores expired rows."*
> §4.0: *"There is no expiry job and no `expires_at` column — decay is a read-time concern, computed here."*

The spec is right and the schema agrees with it. But §9.3 is wrong twice over, and the second error is the interesting one: **"ignores expired rows" is not the decay design.** A decayed night must still *render* — §2.3d says it is "still shown in the heatmap, at reduced weight, but excluded from headline counts." Ignoring the row makes the member vanish rather than fade, which is the difference between §2.3d's design and a hard expiry.

This paragraph is v0.1 text that survived both the v0.2 audit and the v0.3 decay clarification. It is the single most misleading sentence in the corpus, because an agent reading the master doc for intent will implement a filter.

**Correction.** Rewrite §9.3's decay note to point at §4.0 and use the right verb: *"Decay is computed at read time in `resolveSignals()`. Nothing is deleted and nothing is filtered — a stale confirmation is **downgraded**, not removed. There is no `expires_at` column and no expiry job."*

---

### X-12. `display_name` is `NOT NULL` and no ticket ever collects one

**Sources:** `engineering-spec.md` §3 (`app_user`), FIX-1; `agent-prompt.md` T3, T4; `implementation-audit.md` FIX-1 verification.

`app_user.display_name text NOT NULL`. The row is created by FIX-1's after-insert trigger on `auth.users`, which has a phone and no name. The implementation audit confirms the trigger works and *"carries the phone through"* — it says nothing about the name, which means it is inserting a placeholder or a coalesce of the phone number.

Meanwhile: the heatmap shows members, `signalledCount` copy names people, the poke copy is `"{sender} wants you in on {weekday}"`, the invite page shows a host, and `me.updateProfile({displayName, timezone})` exists as the only way to set one — reachable through a `/me` route that no ticket builds.

**No ticket in T1–T22 captures a user's name.** T3 is login/session/route-guard. T4 is group create/join/member-list. T6 is the Signal. The pilot would run with seven people called `+16475550101`.

**Correction.** Add a first-run name step to T3 (one screen, one field, blocking) or fold it into T4's group-create/join flow. It is ten minutes of work and it is currently nobody's job. Also decide whether `display_name` should simply be nullable with a UI fallback — that is defensible, but then the fallback must never be the phone number, which would leak it into every group.

---

### X-13. The notification budget counts its own drops, and the idempotency key collides on retry

**Source:** `engineering-spec.md` §3 (`notification_log`), §7.

Two defects in one table.

**(a) Dropped sends are logged in the same table the budget counts.** §7 step 2 says *"count non-signal sends in the trailing 7 days."* `notification_log` holds both sent and dropped rows (`dropped_reason` distinguishes them, `dispatched_at` is nullable). If the count does not exclude `dropped_reason IS NOT NULL`, a user who hits the budget once is permanently starved: every subsequent drop increments the count that caused the drop. The budget becomes a ratchet.

The spec never states the exclusion. `idx_notif_budget ON (user_id, dispatched_at)` hints at the right query but does not enforce it.

**(b) `idempotency_key text UNIQUE NOT NULL` collides.** A dropped send writes a log row carrying its key. If the same logical send is legitimately retried later — the next `nudge_evaluator` run, a re-queued invite — the insert fails on the unique constraint rather than being re-evaluated. Worse, step 1 says *"if `idempotencyKey` already in `notification_log` → return (no double-send)"*, which means **a notification dropped for budget can never be sent again, ever**, even in a later week with budget available. For `kind='nudge'` and `kind='invite'` that is silently wrong.

**Correction.**

- Budget query: `WHERE kind <> 'signal' AND dropped_reason IS NULL AND dispatched_at > now() - interval '7 days'`. Write the predicate into §7 explicitly.
- Idempotency: change the key to `UNIQUE (user_id, idempotency_key)` and scope every key to the window it protects — `invite:{plan_id}:{user_id}`, `nudge:{group_id}:{week_start}`, `signal:{user_id}:{week_start}`. Then step 1's short-circuit should check for a row **with `dropped_reason IS NULL`**, so a previously-dropped send remains eligible.

**Test to add:** alongside FIX-3's starvation test — a user who is dropped for budget in week 1 receives the same class of notification in week 2.

---

### X-14. INV-6 requires four events that web push cannot produce

**Sources:** `engineering-spec.md` §0 INV-6, §7 step 6, §11; `overlap-master-doc.md` §9.3, §17.

> INV-6: *"Every notification dispatch logs four separate events: `dispatched`, `delivered`, `opened`, `completed`."*

For SMS this works: Twilio's status webhook populates `delivered_at` (the founder checklist correctly lists setting it up), link clicks give `opened_at`. For **web push, there is no delivery receipt.** A push service accepting a message is not evidence it reached the device, and no browser reports delivery back to the sender. `delivered_at` for the webpush channel will be permanently null.

That is not merely an unmet invariant. §17 says *"Signal Completion Rate must always be reported alongside Signal Delivery Rate"* and the M5 gate is decided on the pair. If web-push sends have a structurally null numerator, **the delivery rate is understated by exactly the share of users on the upgrade channel**, and the M5 verdict reads "delivery is broken" when delivery may be fine. This is A3's failure mode inverted — the wrong lesson learned at the most expensive moment, again.

**Correction.** Restate INV-6 as: *"Every dispatch logs every lifecycle event **observable on its channel**, and `notification_log` records channel delivery-observability so that Delivery Rate is computed only over channels that can report it."* Add a `delivery_observable boolean` (or derive it from `channel`). Then §17: Signal Delivery Rate is reported **per channel**, never pooled — which is what A3 asked for anyway, since the whole point was to find out whether web push silently fails.

Practical consequence for the pilot: keep pilot users on SMS. Do not let the upgrade channel contaminate the one number M5 turns on.

---

### X-15. RLS deny-all and the `overlap_worker` role are mutually exclusive as currently specified

**Sources:** `implementation-audit.md` (Verified working — RLS), `engineering-spec.md` §3 FIX-4; `backlog.md` (T2 remaining gap).

The implementation audit records, correctly and as a win: *"RLS on for all 13 tables, zero policies — deny-all."* That is safe **because the web app connects with credentials that bypass RLS** (service role / direct `DATABASE_URL` as table owner).

`overlap_worker` is a plain `LOGIN` role. RLS with zero policies denies it everything — `GRANT SELECT ON signal, app_user, grp, group_member TO overlap_worker` will return zero rows, and its `busy_block` writes will be rejected. T9 will fail on its first query, in a way that looks like an empty database rather than a permissions error.

Three smaller problems in the same block:

- `CREATE ROLE overlap_worker LOGIN PASSWORD :'worker_pw'` uses **psql variable interpolation**, which no migration runner supports. Already known (the backlog gates it on `OVERLAP_WORKER_DB_PASSWORD`), but the spec's DDL as written is not runnable.
- `guard_worker_role()` tests `current_user`. `current_user` changes under `SET ROLE` and inside `SECURITY DEFINER` functions; **`session_user`** is the identity that actually reflects who connected and is the correct check for this guard.
- Per X-5, `overlap_worker` should have no `signal_night` privileges at all — which makes the second trigger pure defence in depth rather than the load-bearing boundary FIX-4 describes. Worth saying so honestly in the spec, since FIX-4's whole framing is "the trigger catches accidents, the role catches determined code."

**Correction.** Add explicit `BYPASSRLS`, or — better — write the two policies the worker actually needs and keep RLS meaningful:

```sql
ALTER TABLE busy_block FORCE ROW LEVEL SECURITY;
CREATE POLICY worker_busy_rw ON busy_block TO overlap_worker USING (true) WITH CHECK (true);
CREATE POLICY worker_read    ON app_user   FOR SELECT TO overlap_worker USING (true);
-- etc, one per granted table
```

Then record in an ADR the thing the RLS finding implies but does not state: **PostgREST is not an API surface for this product. All access is via tRPC. The anon key is never used for data access.** Deny-all is only a correct posture while that holds, and the first developer to reach for `supabase.from()` client-side breaks it invisibly.

---

### X-16. There are three different definitions of "current" and they are 7, 14, and undefined days

**Sources:** `engineering-spec.md` §4 (`isLive: signalledCount >= 3`), §4.0 (7-day freshness); `overlap-master-doc.md` §2.5, §17 Active Group (14 days); `implementation-audit.md` IMP-13.

- **Freshness (§4.0):** a confirmation stops counting after **7 days**.
- **Active Group (§17):** *"≥3 members with ≥1 signal in the trailing **14 days**."*
- **`isLive` (§4 signature):** `signalledCount >= 3`. The window is **not specified anywhere.** Nor is what `signalledCount` counts — members with any signal ever, members with a signal for this week, or members whose signal survived resolution.

IMP-13 consolidated the *floor* of 3 into `@overlap/shared` after finding the engine and the UI each held their own copy. The *window* was not consolidated, because it was never defined in the first place.

The three interact badly. A group where everyone last signalled 10 days ago is: **live** (if `isLive` counts any signal), **active** (14-day window), and **completely blank** (7-day freshness, per X-1). The UI would show `belowThreshold`-free, headline-free, empty grid with no explanation of why.

**Correction.** One constant, one definition, in `@overlap/shared`:

```ts
export const LIVENESS_FLOOR = 3;
export const SIGNAL_FRESHNESS_DAYS = 7;    // per group cadence — see X-1
export const ACTIVITY_WINDOW_DAYS  = 14;   // analytics only, never product logic
```

and state explicitly: `signalledCount` counts members with a signal **that survived resolution for the current horizon**. Then the empty-heatmap-but-live case becomes impossible by construction.

---

### X-17. Rate limits are sequenced after the routes they protect

**Sources:** `engineering-spec.md` §5.2; `agent-prompt.md` T12, T13, T21; `backlog.md`.

§5.2 is unambiguous: *"**Do not defer these to 'before launch.'** The moment the first invite link leaves your hands, they are load-bearing."*

The ticket sequence defers them to before launch. T21 — *"Rate limits on every public route"* — sits nine tickets after T12 builds `/p/[slug]` and eight after T13 ships guest RSVP. The agent prompt hedges it as *"before I share a single invite link outside the pilot,"* which is a weaker guarantee than the spec asks for and depends on a founder remembering during the most exciting week of the project.

The correct pattern already exists in this repo: FIX-9's `auth.requestOtp` limit shipped **inside T3**, with the route it protects.

**Correction.** Dissolve T21 into the tickets that open each surface. T12 ships with `plan.getPublic`'s limit; T13 with `plan.rsvp`'s; T4 already has `group.joinByCode`'s. Keep a much smaller T21 as a **verification** ticket — an automated test asserting that every procedure marked public in the router has a limiter attached, which is the thing that actually prevents the next public route from shipping bare.

Note the standing caveat from IMP-11: none of these limits function until Upstash exists. The sequencing requirement the backlog identified (**Upstash before Twilio**) should be restated as the stronger and more general rule: **Upstash before any public route ships, and before Twilio.**

---

### X-18. PIPEDA obligations are scheduled after the pilot they apply to

**Sources:** `engineering-spec.md` §5.3 FIX-11; `agent-prompt.md` T22; `overlap-master-doc.md` §10, §13 M4; `founder-checklist.md` item 3.

T22 (`me.exportData`, `me.deleteAccount`, `group.delete`) is the last ticket. The pilot begins at M4, week 12. §5.3 frames these as *"legally required under PIPEDA. Also an App Store requirement the moment you ship native shells at M6."*

The App Store framing is what put it at the end, and it is the less binding of the two. **The PIPEDA obligation attaches to the first pilot user, not to M6.** From week 12 the product holds real phone numbers, real calendar-derived availability, and real social graph data for ~35 people who were recruited personally, on the promise in §10 that *"deleting a group deletes its data."*

The founder checklist commits to *"PIPEDA compliance basics: stated purpose, consent, access, deletion on request"* in **week 1–2**, as a prerequisite for the A2P and OAuth submissions. So the checklist and the ticket sequence disagree by ten weeks about when deletion has to work.

**Correction.** Two-stage it, which costs almost nothing:

1. **Before the pilot (M4):** a written, tested **manual runbook** — a SQL script that hard-deletes one user and everything referencing them, run by the founder on request, with the response time stated in the privacy policy. That satisfies "deletion on request" for 35 known users. Move `group.delete` (soft-delete + 30-day purge) into T11's sprint, since it is fifteen lines and groups will be created during the pilot.
2. **Keep T22** for the self-serve endpoints ahead of M6.

Also flag one design problem in §5.3 while it is being revisited: `me.exportData` returns a `downloadUrl` *"emailed/SMS'd when ready."* There is no email in this product, and SMS-ing an unauthenticated URL containing a complete export of someone's social graph is a worse privacy failure than the one it exists to remedy. The link must be single-use, short-TTL, and gated behind a fresh session.

---

### X-19. Sprint 2's Definition of Done requires a Sprint 3 ticket

**Sources:** `engineering-spec.md` §12 Sprint 2; `agent-prompt.md` T6, T10.

Sprint 2 DoD: *"Three-week horizon renders; **weeks 1–2 pre-filled from prior signal**."*

Pre-fill from the prior signal is **T10**, which is Sprint 3. T6 (Sprint 2) is *"vibe tap, three-week night grid, optional note, submit"* — no pre-fill. `signal.getDraft`, the procedure that would do it, appears in §5 and in no ticket at all.

Sprint 2 therefore cannot close on its own contents, independent of the Twilio blocker. And the missing feature is not cosmetic: master doc Rule 1 and A1's entire correction rest on *"weeks two and three are pre-filled from the prior signal, so confirming them costs one tap."* Without pre-fill, the three-week horizon costs 21 taps instead of ~9, and the ten-second budget — the retention mechanic — is blown. The one thing that makes the horizon affordable is scheduled after the sprint that ships the horizon.

**Correction.** Split T10. **Pre-fill from the prior signal has no calendar dependency** and belongs in T6, Sprint 2. Pre-fill from `busy_block` genuinely depends on T9 and stays in Sprint 3. Rename accordingly:

- **T6** — Signal modal, including prior-signal pre-fill for weeks 1–2 and `signal.getDraft` (prior-signal source only).
- **T10** — extend `signal.getDraft` with `busy_block` as a second source. INV-1 unchanged: it can only *remove* nights or leave them unconfirmed.

Then measure the ten-second median against the version that has pre-fill, since that is the only version the product is designed around.

---

### X-20. The Definition of Done cannot be met, so it has already stopped functioning

**Sources:** `engineering-spec.md` §12; `agent-prompt.md` ("A sprint is not complete until every box is checked"); `backlog.md`; `implementation-audit.md` Open items.

Sprint 1 DoD includes *"Two phones can OTP-login."* Supabase has no built-in SMS, so this is gated on Twilio A2P registration: **1–4 weeks, can be rejected.** Sprint 2 DoD includes *"Signal submits in < 10s median on a real phone,"* gated on the same thing plus a real device.

Both sprints are code-complete and neither can close. Work has correctly proceeded to Sprint 3 anyway. Which means the rule *"a sprint is not complete until every box is checked and I have confirmed it on a real phone"* is currently being violated by the only sensible course of action — and a rule that is routinely and correctly violated stops being read.

This is a process defect, not a moral failing. The DoD conflates two different gates.

**Correction.** Split every DoD box into two columns:

| Gate | Meaning | Blocks |
|---|---|---|
| **Code-complete** | built, unit + integration tested, merged | the next ticket |
| **Verified-live** | exercised against real infrastructure on a real device | the **pilot**, not the next ticket |

Sprint 1 is code-complete. Its verified-live boxes stay open, visibly, tracked in `implementation-audit.md`'s Open Items table — which is already doing exactly this job and doing it well. Then add one hard rule that preserves the original intent: **no verified-live box may still be open when M4 (pilot start) is declared.** That is the moment the checks actually matter, and it gives them teeth without stalling the build behind a carrier queue.

---

## Tier 3 — Stale text and cohesion

### X-21. The README contradicts itself about whether a database exists

`README.md` status block: *"Schema, invariant triggers and the Signal→heatmap chain are verified against a live Supabase database."*

`README.md`, **Where things stand**, ~90 lines later: *"None of it has run against a real database yet — no Supabase project or other Postgres has been provisioned, so T3's 'two phones can OTP-login' and T4's actual query/transaction behavior are both unverified against live infrastructure."*

The second paragraph is one audit pass stale. The backlog and `implementation-audit.md` both confirm Supabase is provisioned, migrations applied, OV-6 passing live. It also misstates T5/T5b's status ("done and unit-tested" — OV-6 now runs live) and T6/T7 (listed as "still ahead" while the backlog has both at 🟡 with live verification).

Rewrite the section from the backlog, which is the document designated as the status board.

### X-22. The README says OV-6 is `it.todo`; it passes

`README.md` Testing: *"where one genuinely can't run yet (OV-6 needs a live Postgres with the guard trigger installed …), it's marked `it.todo(...)`."*

`backlog.md` T5b: *"all ten OV tests now pass, OV-6 included (it moved to `tests/integration/liveDb.test.ts`)."*

The README is describing the practice with an example that is no longer true. The practice is good and worth keeping — pick a currently-open example, or state it in the abstract.

### X-23. RS-5 is missing from the agent prompt and the backlog

`engineering-spec.md` §4.0 defines **RS-1 through RS-5** as of v1.2. `implementation-audit.md` IMP-1 confirms RS-5 was written and the fix shipped.

`agent-prompt.md` T5 still says *"Tests RS-1..RS-4."* `backlog.md` T5 says *"RS-1..RS-4"* and *"all 4 tests passing."* `engineering-spec.md` §12 Sprint 2 DoD says *"the 4 signal-resolution tests RS-1..RS-4."*

Three documents still describe a four-test suite. Anyone regenerating from the agent prompt drops the test covering the most consequential product bug found so far.

Update all three to RS-1..RS-5 — and to RS-1..RS-7 if X-1 and X-4 are accepted.

### X-24. OAuth verification is "Sprint 3" in two places and "Week 1" in three

- `overlap-master-doc.md` §10: *"start that process during Sprint 3, not after."*
- `overlap-master-doc.md` §15 risk row: *"Begin in Sprint 3."*
- vs **A11**, §13 **M0 — Week 1**, and `founder-checklist.md` item 2 (Week 1, 🔴).

A11's correction was explicitly *"the OAuth verification submission is pulled forward to Sprint 1 so it runs in parallel rather than blocking."* Two paragraphs never got the memo, and both sit in sections a reader consults for exactly this question.

### X-25. The cold-start risk row reverts A10 twice in one cell

`overlap-master-doc.md` §15: *"Group-seeded onboarding, **4-member** liveness threshold, honest UI below it, **useful as a solo invite tool** meanwhile."*

A10 lowered the threshold to **three**, and specifically rejected the invite-tool fallback: *"v0.1's fallback was 'acts as an invite tool,' which is a direct fight with Partiful on their strongest surface."* The replacement is the shareable availability card.

Both reversions in one table cell, in the section a reader scans for the product's mitigations.

### X-26. There are three different pilot windows

| Source | Concierge / pilot window |
|---|---|
| `overlap-master-doc.md` §12 | Weeks **1–8** |
| `overlap-master-doc.md` §13 | M4 pilot begins week **12**, M5 verdict week 16 |
| `founder-checklist.md` | Recruitment weeks **8–12** |
| `marketing-plan.md` §3 | Concierge weeks **8–16** |

§12 is v0.1 text, written against the eight-week v1 that A11 replaced with twelve. It now says the concierge phase ends four weeks before the product it is meant to concierge exists.

The checklist and marketing plan are consistent with each other and with M4/M5 (recruit 8–12, run 12–16). Rewrite §12 Phase 1 to **weeks 8–16** and delete the stale sprint mapping.

### X-27. Four locked-stack decisions drift between the two documents

The spec's §1 opens *"No substitutions without an explicit decision record,"* which makes any drift a defect by definition:

| Layer | `engineering-spec.md` §1 | `overlap-master-doc.md` §9.1 |
|---|---|---|
| Worker scheduler | FastAPI + **APScheduler** | FastAPI + **Celery/RQ** |
| Database | Supabase | Supabase **or Neon** |
| Media | Supabase Storage | **Cloudflare R2** or Supabase Storage |
| Auth/SMS | Twilio **Programmable Messaging** | **Twilio Verify** or Supabase Auth |

The first three are harmless staleness; the spec wins and the master doc should defer rather than re-list. **The fourth is not harmless.** Verify and Programmable Messaging are different products with different A2P registration paths and different per-message economics, and the founder checklist's week-1 registration task depends on which one is being registered. Supabase phone auth can be wired to either. Decide it before filing the Brand, not after.

### X-28. Five master-doc fields have no home in the schema, and one of them carries a product promise

`overlap-master-doc.md` §8 lists fields the spec's §3 dropped:

| Field | Consequence of dropping it |
|---|---|
| `message.archived_at` | **§2.6 promises plan chat "auto-archives when the plan ends."** No column, no job, no ticket. The promise is currently fiction |
| `calendar_connection.scope_granted` | INV-7 ("free/busy only") has no runtime evidence. If Google ever grants a broader scope, nothing records or detects it |
| `plan.visibility` | Probably correctly dropped (all plans are slug-public), but say so |
| `plan.location_place_id` | Needed by Streams 3–4; correctly deferred, worth noting as deliberate |
| `group_member.last_signal_at` | Correctly dropped as derivable — but see X-16, since `signalledCount` is what derives it |

Only the first two need action. `archived_at` should either get a column and a line in `attendance_prompt`, or §2.6's promise should be softened to "conversation is scoped to a plan" without the archival claim.

### X-29. The design tokens cover four of five vibes, and the missing one is `broke`

`engineering-spec.md` §8 defines `--vibe-expansive`, `--vibe-lowkey`, `--vibe-slammed`, `--vibe-away`. `vibe_t` has five values.

`broke` has no token — presumably because INV-4 says it never appears in aggregate output. But §10 states *"Individual vibe is visible only to the person who set it,"* and the Signal modal shows five tap targets, one of which is `Broke this week`, in its selected state. That state needs a colour.

It also needs the *right* colour. This is Jonah's feature, described in §4.2 as *"one of the most emotionally valuable features in the product."* If it renders in the default grey while the other four are warm, the UI editorialises about it. Add `--vibe-broke` and make it as warm as the others. Also note the token names don't match the enum values (`expansive`/`down_for_anything`, `away`/`out_of_town`) — map them explicitly in `copy.ts` or they will be mismatched by hand somewhere.

### X-30. The SMS cost estimate uses the wrong unit

`founder-checklist.md`: *"at 5 groups × 7 people × 4 messages/month that is trivial."*

The notification cap is **4 per week** (INV-5, §7.5), not per month. Worst case is ~16–17/user/month plus OTP, so the estimate is understated roughly fourfold. The conclusion survives — 35 users × 17 ≈ 600 SMS/month is still a few dollars — but the arithmetic should be right in the document that sets the spend alert, and it should be stated per-week so the number scales correctly when someone extrapolates to 100 groups.

While there: `founder-checklist.md` proposes an **Ontario sole proprietorship**. Twilio registers sole proprietors under a distinct, more restricted brand tier with lower throughput ceilings than a standard business brand. Confirm the ceiling covers OTP plus weekly Signal traffic at pilot scale *before* choosing the entity type — and confirm the Canadian registration path specifically, since the checklist treats US and Canadian A2P as one process and they are not identical.

### X-31. The kill criteria have a twenty-point dead zone

- `overlap-master-doc.md` §2.7 / §3.3 / §13 M5: the gate is **≥ 55%**.
- §2.7 and `founder-checklist.md`: below **35%**, *"the mechanic is wrong and must be redesigned."*

**Nothing states what 35–54% means.** That band is the single most likely outcome of a five-group pilot, and it is the one the founder will have the most feelings about — which is exactly why the checklist rightly insists on *"decide your kill criteria in writing, now, before you have feelings about it."* The criteria were written with a hole in the middle.

Fill it before the pilot. A defensible reading: **35–54% = iterate the mechanic and re-run one more four-week cohort, once.** Not a redesign, not a pass, and explicitly not "add features" — with a stated cap on how many times that branch may be taken.

### X-32. Two headline metrics have no event that can produce them

- **Organic Group Creation** — §17, gate for M8, and `marketing-plan.md`'s #2 KPI (*"Organic group share ≥ 40%"*). Defined as *"new groups whose founder first encountered Overlap through an invite link."*
- **Invite → signup conversion ≥ 15%** — `marketing-plan.md` §9, described as the test of whether the public page is doing its job.

§11's event list has `invite_viewed {slug, authed}` and `rsvp_submitted {slug, status, was_guest}`. It has **no signup event at all**, and nothing carries attribution from an invite view to a later account creation or group creation. There is no `signup_source`, no referral parameter on `/p/[slug]`, and no `group_created` event.

Both numbers are currently uncomputable. The second is the one marketing calls *"the single highest-leverage decision you will make."*

**Correction.** Add to §11, and to T12/T13:

```
account_created   { user_id, source: 'invite'|'join_code'|'direct', source_slug? }
group_created     { group_id, creator_source: 'invite'|'join_code'|'direct' }
group_joined      { group_id, method: 'code'|'link' }
```

Persist the attribution at first touch on `/p/[slug]` (a first-party cookie set server-side; it must survive the RSVP → account-prompt hop, which is the exact funnel being measured).

---

## Corrections with no owner

These are audit findings that were accepted, written into a specification, and then never given a ticket. Each will simply not exist in v1.

| Correction | Where it lives | Ticket | Consequence of omission |
|---|---|---|---|
| **FIX-5** — `overlap_precompute` job, Redis cache, TTL to next local midnight | spec §6, master §8.1 | **none** | The §8.1 Redis cache is unbuilt. T7's backlog note says *"the §8.1 Redis cache is the T-worker precompute job, not this"* — pointing at a ticket that does not exist. Every heatmap view recomputes; the 50ms target is unmeasured |
| **FIX-7** — cadence stepdown to fortnightly | spec §3 (`grp.cadence_weeks`), master A8/§2.3g | **none** | T16 *"respects `cadence_weeks`"* — it consumes the column. Nothing ever **sets** it. There is also no stored per-group weekly completion history, so the trigger condition (*"3 consecutive weeks with completion < 40% AND zero plans"*) is not computable from the current schema. A8's correction does not exist |
| **A10 share card** — `group.shareCard` | spec §5, master §2.5/A10 | **none** | The entire below-threshold cold-start protocol. §2.5 makes it the answer to the Empty Room Problem; the shipped behaviour is `belowThreshold` copy and an empty grid |
| **§2.5 founder-triggered first Signal** | master §2.5 | **none** | *"The first Signal is triggered manually by the group's founder, so the ritual begins with a real moment rather than waiting up to six days for Sunday."* No API, no ticket. Every pilot group waits up to six days for their first Signal, at the moment of peak enthusiasm |
| **Apple / CalDAV calendar** | master §6.1 (v1 scope) | **none** | §6.1 says v1 is *"Google + Apple."* §9.3 permits Google-only as a fallback. T9 is Google-only. Fine — but §6.1 should say so, since an iPhone-heavy pilot group with iCloud calendars gets no sync at all |
| **Native shells** | master §6.3 lists them as v3; §13 M6 moves them to Month 5 | n/a | Stale text only; §6.3 predates A3's reordering |

**Recommended action:** add **T23 (share card)**, **T24 (`overlap_precompute` + Redis)**, and fold the founder-triggered first Signal into **T16**. Then decide FIX-7 explicitly — either add the completion-history table and a ticket, or **strike FIX-7 from the spec and reopen A8 as unresolved.** Given X-1, striking it is genuinely defensible: the stepdown as designed conflicts with the freshness rule, and "we have not solved A8" is a more useful state than a correction that exists only on paper. What is not defensible is leaving it in the schema as though it were handled.

---

## Proposed advancements

Clearly marked as proposals, not defects. Ordered by leverage per hour.

### P1. A traceability matrix, maintained as part of the PR that touches any correction

The mechanism that would have caught six of the findings above, including all five no-owner corrections. Appendix A is the first draft. The rule that makes it work is the same one the repo already uses for the backlog: **the PR that closes a ticket updates the matrix row.** One table, one file, `docs/traceability.md`.

### P2. Make `lapsed` a first-class state, and put a re-confirm affordance on it

Follows from X-4. A `lapsed` night is the highest-intent surface in the product: someone already said yes to *that specific night*, and their answer has merely aged. One tap re-confirms it. Compare to the Signal, which asks about 21 nights.

This is a retention mechanic that costs one enum value and one tap target, it is honest (it does not assert on the user's behalf, so INV-1 is untouched), and it gives the heatmap a second reason to be opened between Sundays — directly against the Dead Interval. It also generates exactly the re-engagement data the M5 gate needs, without spending a notification.

### P3. Raise the vibe band floor from 2 to 3

The band is currently released at `|confirmed| >= 2`. At a cohort of two, *"the group is leaning low-key"* discloses both members' vibes to anyone who knows who was free. A5's finding was that small-group aggregation is not anonymity; a floor of 2 is not aggregation at all.

Three is the minimum at which the band is genuinely ambiguous, and it aligns with the liveness floor already in `@overlap/shared`. Cost: the band disappears in a handful of pilot nights. Benefit: the privacy guarantee is actually a guarantee.

Related, and worth deciding now: **at pilot group sizes the k-anonymity floor of 5 confirmed will essentially never be reached**, so A5's correction ships untested. Either accept that consciously (fine — it fails closed) or reduce the floor to 4 for the pilot behind a flag and watch whether anyone reacts.

### P4. Use the Signal SMS to carry the attendance prompt

§6 specifies `attendance_prompt` as *"in-app (not push)"* to protect the notification budget. But the Dead Interval thesis says users are not in the app between plans — so an in-app-only prompt is invisible to precisely the people who did not open the app, and **CHPGM, the North Star, depends on that prompt firing.**

The Sunday Signal is already exempt from the budget, already guaranteed delivery, and already lands on the Sunday after most weekend plans. Append one line to it: *"Also — did you make it on Thursday?"* One extra tap in the Signal flow, zero extra notifications, and the attendance signal arrives through the one channel known to work.

Guard it against the ten-second budget: it appears only when a plan is actually pending confirmation, and it goes at the **end**, after submit, in the reveal — where the user is already being rewarded and is at their most willing.

### P5. Instrument first-touch attribution before T12, not after

Follows from X-32. The cookie must be set the first time a stranger loads `/p/[slug]`, which is T12. Adding it later means every pilot-era invite is unattributable, and the pilot is the only cohort where the founder can also *ask* people how they arrived — the one chance to validate the instrumentation against ground truth.

### P6. A `docs/decisions-pending.md` for the things that are genuinely undecided

Several findings above are not errors so much as decisions nobody has made: heat-step scaling (already in the audit's open items), Sunday 7pm vs group-chosen (§16 Q1), three vs four week horizon (§16 Q6), untapped-night semantics (X-5), the 35–54% branch (X-31). They are currently distributed across §16, an audit table, and nowhere.

One file, each entry with: the question, what depends on it, the date it must be decided by, and the default if it is not. The default matters most — every one of these has a de-facto default that an agent will pick silently.

### P7. Split the DoD into code-complete and verified-live, with M4 as the wall

Follows from X-20. This is the process change with the highest ratio of value to effort in the report, because it restores meaning to a rule that is currently unenforceable.

### P8. Add a "delivery-honest" pilot rule: SMS only

Follows from X-14. Web push is an upgrade channel whose delivery cannot be observed. The M5 gate turns on delivery-adjusted completion. Do not mix an unobservable channel into the only measurement that decides whether the product continues. Ship web push, but keep the pilot cohort on SMS and say so in the M5 write-up.

---

## Appendix A — Traceability matrix (first draft)

Every audit finding → its correction → its enforcement → its ticket → its test. **Rows in bold have no ticket.**

| Finding | Correction | Invariant | Ticket | Test | Status |
|---|---|---|---|---|---|
| A1 three-week horizon | §2.2 Rule 1 | — | T6 | Sprint 2 DoD | 🟡 built, unverified on device |
| **A2 free ≠ available** | calendar drafts only | **INV-1, INV-2** | T2, T9, T10 | OV-6 ✅ live, OV-2 | 🟡 guard live; T9/T10 not started |
| A3 push unreliable | SMS default | — | T17 | Sprint 5 DoD | ⬜ |
| A4 multiplying ritual | one global signal | INV-8 | T5, T6 | RS-1 ✅, INV-8 upsert ✅ live | ⚠️ **see X-2** — master §9.3 still per-group |
| A5 aggregation ≠ anonymity | k-floor of 5 | **INV-3, INV-4** | T5b | OV-3 ✅, OV-4 ✅ | ⚠️ **see X-3** — band branch leaks `broke` |
| A6 North Star unmeasurable | Confirmed Hangs | — | T19 | — | ⚠️ **see X-8** — RSVP count inflatable |
| A7 booking unvalidated | streams reordered | — | n/a (founder) | concierge test | ⬜ M5b |
| **A8 weekly ask, monthly behaviour** | **FIX-7 cadence stepdown** | — | **none** | **none** | 🔴 **no owner; conflicts with X-1** |
| A9 budget oversubscribed | rank ladder | INV-5 | T15 | Sprint 5 DoD | ⚠️ **see X-13** |
| **A10 cold-start threshold** | 3 + **share card** | — | T7 (floor ✅) / **none** (card) | — | 🔴 **card has no owner** |
| A11 timeline | 12 weeks, OAuth wk 1 | — | n/a (founder) | — | ⚠️ **see X-24** — two paragraphs still say Sprint 3 |
| FIX-1 `auth.users` link | trigger | — | T2, T3 | live ✅ | ✅ verified |
| FIX-2 signal resolution | `resolveSignals()` | — | T5 | RS-1..RS-**5** | ⚠️ **see X-23** — 3 docs say RS-4 |
| FIX-3 signal budget exemption | reserved slot | INV-5 | T15 | starvation test | ⬜ |
| FIX-4 worker role | separate DB role | INV-1 | T2/T9 | — | ⚠️ **see X-15** — RLS blocks it; see X-5 |
| **FIX-5 precompute TTL** | local-midnight TTL | — | **none** | **none** | 🔴 **no owner** |
| FIX-6 date → timestamptz | 19:00 group-local | — | T11 | — | ⚠️ **see X-7** — no `grp.timezone` |
| **FIX-7 cadence trigger** | explicit stepdown rule | — | **none** | **none** | 🔴 **no owner** |
| FIX-8 cache vs RSVP | split shell / list | — | T12, T13 | — | ⬜ not restated in either ticket |
| FIX-9 OTP rate limit | 3/hr per phone | — | T3 | in-process ✅ | 🔴 **inert until Upstash — IMP-11** |
| FIX-10 `ends_at` NOT NULL | default +4h | — | T11, T19 | schema ✅ | ✅ |
| FIX-11 PIPEDA procedures | export/delete | — | T22 | — | ⚠️ **see X-18** — after the pilot |
| FIX-12 join code | 10-char alphabet | — | T4 | ✅ | ✅ — **not applied to `public_slug`, X-9** |
| INV-6 four events | dispatcher logging | INV-6 | T15, T18 | — | ⚠️ **see X-14** — unobservable on webpush |
| INV-7 freebusy scopes | scope config | INV-7 | T9 | code review | ⬜ — no `scope_granted` column, X-28 |

---

## Appendix B — What this audit could not verify

Stated explicitly, in keeping with the repo's own standard that an admitted gap beats a convincing fake.

- **No code was read.** Every finding above is derived from the eight documents. Where a document describes the implementation (README, backlog, implementation-audit), I have taken it at its word; where two documents disagree about the implementation, I have flagged the disagreement rather than adjudicating it.
- **Six referenced files were not provided** and are assumed to exist as described: `audit-report.md`, `CONTRIBUTING.md`, and ADR-0001 through ADR-0006. Several findings (X-7 on ADR-0002, X-15 on ADR-0005, X-22 on ADR-0006) may already be partly addressed in those ADRs. If so, the defect is that the ADR's conclusion never propagated back into the spec — which is the same class of finding either way.
- **No claim here is about whether the product will work.** The A-series did that job. This audit assumes the design is right and asks only whether the documents describing it agree with each other.

---

*Findings X-1 through X-32. Six Tier 1, fourteen Tier 2, twelve Tier 3, five corrections with no owner, eight proposals.*
