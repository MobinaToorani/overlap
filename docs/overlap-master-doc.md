# Overlap — Master Product Document

*Working codename. Alternate names in §14.*

**Version:** 0.3 (decay rule clarified 2026-09-04)
**Owner:** Mobina Toorani (Strange Attractor)
**Date:** September 2026
**Status:** Pre-build. This document is the source of truth until v1 ships.

> **v0.2 changelog.** A full adversarial audit of v0.1 found eleven material flaws, three of them capable of killing the product on their own. Corrections are integrated throughout and summarised in **§0**. The most consequential changes: the Signal now covers a rolling three-week horizon rather than one week; calendar sync is demoted from source-of-truth to draft; push delivery is no longer assumed to work; and the monetization order has been inverted because the stream v0.1 called primary may not be accessible.

---

## Table of Contents

0. [Audit Findings & Corrections](#0-audit-findings--corrections)
1. [Executive Summary](#1-executive-summary)
2. [The Retention Problem — and the Solution](#2-the-retention-problem--and-the-solution)
3. [Goals, Objectives & Success Metrics](#3-goals-objectives--success-metrics)
4. [Users, Personas & Jobs To Be Done](#4-users-personas--jobs-to-be-done)
5. [Competitive Landscape](#5-competitive-landscape)
6. [Product Scope](#6-product-scope)
7. [Design Document](#7-design-document)
8. [Data Model](#8-data-model)
9. [Software Architecture & Engineering Plan](#9-software-architecture--engineering-plan)
10. [Privacy, Trust & Safety](#10-privacy-trust--safety)
11. [Monetization Strategy](#11-monetization-strategy)
12. [Go-To-Market](#12-go-to-market)
13. [Roadmap & Milestones](#13-roadmap--milestones)
14. [Naming & Brand](#14-naming--brand)
15. [Risks & Mitigations](#15-risks--mitigations)
16. [Open Questions](#16-open-questions)
17. [Appendix: Metric Definitions](#17-appendix-metric-definitions)

---

## 0. Audit Findings & Corrections

An adversarial review of v0.1, conducted as if trying to argue the product would fail. Findings are ordered by severity. Each names the flaw, the consequence, and the correction now integrated into this document.

### Tier 1 — Would kill the product

---

**A1. The Signal's time horizon was shorter than the planning horizon.**

*Flaw.* v0.1 specified a weekly signal expiring Saturday night, while the heatmap advertised four weeks of forward visibility. These are incompatible. Adult friend groups do not plan for Thursday on Sunday — they plan two to four weeks out, because that is the lead time a group of seven actually requires. A one-week signal can only ever answer a question nobody is asking.

*Consequence.* The heatmap would be structurally empty beyond day six. Every plan worth making would fall outside the data. The core screen would be decorative.

*Correction (§2.2).* The Signal now captures a **rolling three-week horizon**: this week in detail, the following two weeks as coarse "which nights are plausibly open." Because weeks two and three are pre-filled from the prior signal, confirming them costs one tap. The ritual stays under ten seconds; the data now covers the window where plans actually live.

---

**A2. "Free" was treated as "available." It is not.**

*Flaw.* v0.1 made calendar sync the primary availability source and pre-filled the Signal from it. But an empty calendar means only that nothing is scheduled — not that the person wants to leave the house. Nobody puts *recovering*, *broke*, or *not tonight* in Google Calendar. Calendar data systematically **over-reports availability.**

*Consequence.* The most dangerous failure mode in the entire product. The heatmap says five people are free Thursday, a plan is proposed, three decline, and the group learns the heatmap lies. Trust in a predictive surface does not recover from that. This is precisely how When2Meet-style tools become disposable — the data is authoritative-looking and wrong.

*Correction (§2.2, §7.3).* Calendar sync is demoted from source-of-truth to **draft input**. It can only ever remove a night (hard conflict), never assert one as available. Every night shown as open must be **affirmatively confirmed by a human tap.** The heatmap distinguishes two states visually: *confirmed free* (person said so) and *no known conflict* (calendar only, unconfirmed), and the headline count uses confirmed nights exclusively. Under-promising here is worth more than coverage.

---

**A3. The entire retention mechanic depended on push, and push was not guaranteed to work.**

*Flaw.* v0.1 chose PWA-first delivery and rested the Sunday Signal on Web Push. On iOS, web push requires the user to explicitly add the site to their Home Screen first — a step most users will not take. The single load-bearing feature was built on the least reliable delivery channel available, and the doc never acknowledged it.

*Consequence.* No push means no synchronised ritual. No ritual means no retention. The product's defining mechanic would silently fail on a large share of the target audience, and the M5 gate would read as "the mechanic doesn't work" when the real failure was delivery.

*Correction (§9.1, §9.3).* Three changes. (1) **SMS is the guaranteed delivery channel for the Sunday Signal**, since phone auth already gives us the number and consent — web push is treated as a cheaper upgrade, not the default. (2) The pilot **instruments delivery separately from completion**, so a failed ritual can be correctly attributed. (3) Native shells move from v3 to **fast-follow immediately after the M5 gate**, contingent on the mechanic working at all.

### Tier 2 — Would seriously damage the product

---

**A4. Multi-group users would face a multiplying ritual.**

*Flaw.* v0.1 left "is vibe per-group or global?" as an open question, but the answer is load-bearing. Per-group means someone in three friend groups performs three Signals every Sunday. The ten-second promise becomes thirty seconds of repetitive input, and the people with the most social surface area — the most valuable users — churn first.

*Correction (§2.2).* **One Signal per person per week, shared across all groups.** Availability and vibe are global by default. A per-group override exists but is opt-in and never prompted. Cost stays flat as group count grows.

---

**A5. Aggregation does not protect anyone in a group of six.**

*Flaw.* v0.1 promised "the group sees *3 people are in low-spend mode*, never which three." In a seven-person group where four have already mentioned plans, that arithmetic is trivial. Small-group aggregation is not anonymity — and the feature this protects, letting someone quietly signal they are broke, is one of the most emotionally sensitive things in the product.

*Correction (§10).* A **k-anonymity floor**: exact vibe counts are shown only when the responding cohort is five or larger. Below that, the group sees a qualitative band — *"the group is leaning low-key this week"* — with no number. Financial vibe (`Broke this week`) is **never** shown as a count at any group size; it only ever influences the ranking of suggested plans, silently.

---

**A6. The North Star metric could not be measured.**

*Flaw.* "Plans Happened Per Group Per Month" requires knowing a plan actually occurred. We have no ground truth. A plan with three RSVPs that everyone flaked on would count as a success, which means the primary metric could rise while the product fails.

*Correction (§3.4, §17).* North Star becomes **Confirmed Hangs** — a plan counts only with ≥3 RSVPs *and* at least one post-event signal of attendance: a photo in the thread, a message after the start time, or an explicit one-tap "we made it" prompt in the Recap. Softer than a check-in, honest about its own error bars, and actually observable.

---

**A7. The primary revenue stream may not be purchasable.**

*Flaw.* v0.1 named restaurant booking take-rate as Stream 1 and built the unit economics on it. But the major reservation platforms largely do not run open affiliate programs; access is partnership-gated and terms are not something a pre-revenue solo product can assume. The doc modelled ~$4–5 per group per month on a channel that may simply be closed. It also assumed a 20% monetizable-action rate with no evidence, and ignored that a large share of friend hangs happen at somebody's apartment and monetize at exactly zero.

*Correction (§11).* Streams are **reordered by controllability, not size**. Organizer upgrades and group gifting — both fully under our control, both requiring no partner — become Streams 1 and 2. Booking take-rate drops to Stream 3 and is explicitly marked **unvalidated**. The unit economics are restated as a *test to run*, not a projection, and the monetizable-action rate is to be measured with manual concierge bookings during the pilot, before a line of integration code is written.

---

**A8. The ritual asked for weekly input to support a monthly behaviour.**

*Flaw.* Groups plan roughly once or twice a month. A weekly ritual runs at two to four times the cadence of the underlying behaviour, and users notice when an app asks more of them than the outcome justifies.

*Correction (§2.2).* The three-week horizon partly resolves this, since each Signal now feeds several planning windows rather than one. Additionally, groups with sustained low plan volume are **automatically stepped down to a fortnightly Signal** rather than being allowed to decay to zero. Cadence should follow the group's real tempo.

### Tier 3 — Material, correctable

---

**A9. The notification budget was oversubscribed.** Signal + invites + plan reminders + the Nudge + the newly designed Poke exceed four pushes for any active user. *Correction (§7.5):* a strict priority ladder, with the Poke displacing the automated Nudge rather than adding to it — a real friend's message will always outperform an app-generated one.

**A10. The cold-start threshold was too high.** Requiring four members with completed signals before any value appears imposes a fourfold coordination cost at the moment of lowest motivation. Worse, v0.1's fallback was "acts as an invite tool," which is a direct fight with Partiful on their strongest surface. *Correction (§2.5):* threshold drops to **three**, and the sub-threshold state becomes a genuinely different artifact — a **shareable availability card** the founder can drop into the existing group chat, which works as an image even for people who never install anything.

**A11. The timeline was optimistic for one person.** Eight weeks to v1 assumed no friction from Google OAuth verification (which alone commonly runs multiple weeks), iOS PWA push quirks, and a part-time schedule alongside a job search. *Correction (§13):* v1 target moves to **12 weeks**, with M5 at week 16, and the OAuth verification submission is pulled forward to Sprint 1 so it runs in parallel rather than blocking.

### Findings deliberately not acted on

- **Phone-only auth excludes some users and costs per verification.** Accepted for v1: friend groups are a phone graph, and the cost is trivial at pilot scale. Revisit before international expansion.
- **A large platform could ship this.** Real, unmitigable, and not a reason to stop. The defensible asset is accumulated group memory, not the feature.
- **Sunday 7 PM may be a crowded, low-mood hour.** Left as an experiment rather than a correction — see §16.

---

## 1. Executive Summary

### 1.1 The problem

Adult friend groups do not stop wanting to see each other. They stop being able to schedule it. The failure mode is specific and universal:

1. Someone floats an idea in the group chat.
2. Six people reply with partial constraints across three days.
3. Nobody holds the full picture in their head.
4. The thread dies.
5. Everyone privately feels worse about the friendship.

The bottleneck is not desire, venue, or budget. It is **the absence of a shared, current picture of who is actually free.** That computation is expensive, nobody owns it, and the group chat is the worst possible interface for it.

### 1.2 The product

Overlap is a planning layer for existing friend groups. It does three things, in strict priority order:

1. **Shows the overlap.** A live heatmap of when the group is collectively free, generated from passive calendar data and a ten-second weekly check-in — never from manual time entry.
2. **Turns overlap into a plan.** One tap converts a good night into a lightweight, beautiful, no-account-required invite.
3. **Remembers what people want.** A low-key "someday list" of things each person wants to do or would want to receive, surfaced contextually so it never reads as asking.

### 1.3 The business

Users never pay to access the product. Revenue comes from being the highest-intent demand signal in local commerce: a group of eight declaring a date, a city, a vibe, and a budget *before* they have chosen where to spend. That signal is monetized through booking take-rates, native local supply, group-gifting fees, and organizer-side cosmetic upgrades.

### 1.4 The single risk

This category has a graveyard: Down to Lunch, Free, Kickback, Klutch, Shindig. None died from a bad concept. **All of them died from retention.** They were opened during a burst of novelty, then never again, because the app gave the user no reason to exist between plans.

Section 2 is therefore the most important section in this document. Everything else is execution.

---

## 2. The Retention Problem — and the Solution

### 2.1 Precise diagnosis

The failure is not "users churn." It is a specific structural trap:

> **The Empty Room Problem.** The value of the app is a function of how many friends have current data in it. On day one, nobody does. So the first user opens an empty heatmap, learns nothing, and leaves. Their absence makes it emptier for the next person.

Layered on top are three further failure modes:

| Failure | Description | Why it kills the app |
|---|---|---|
| **The Maintenance Tax** | Any app requiring users to manually enter free time gets abandoned in week two. Nobody maintains a second calendar. | Data goes stale → heatmap lies → trust collapses |
| **The Dead Interval** | Between plans (often 3+ weeks), the app has no reason to be opened. | Habit never forms; app falls off the home screen |
| **The Chat Gravity Well** | The group chat already exists and has 100% participation. Any conversation feature competes with iMessage/WhatsApp and loses. | Users bounce back to the chat and never return |

Retention must be solved at the **mechanic** level, not the notification level. Sending more pushes to an app with no loop just accelerates uninstalls.

### 2.2 The solution: The Sunday Signal

A single, synchronized, sub-ten-second weekly ritual that the entire friend group performs at the same time.

**Every Sunday at 7:00 PM local time**, every member of a group receives one push:

> *"Signal time. How's your week looking?"*

Tapping it opens one screen with three inputs and no keyboard:

**1. Vibe** — one tap from five options:
`Down for anything` · `Low-key only` · `Slammed` · `Broke this week` · `Out of town`

**2. Nights, across a rolling three-week horizon** — tap the nights you could plausibly do something.
- **This week:** seven night pills, tapped individually.
- **Weeks two and three:** shown as two compact rows, pre-filled from your previous signal's pattern. Most weeks these are correct and cost a single confirming tap; the input only becomes expensive when your life actually changes, which is exactly when it should.

**3. Optional one-liner** — *"free after 8 most nights, car is dead"*

Then submit. Median completion target: **under 10 seconds.**

The instant you submit, the heatmap unlocks and you see the payoff:

> **Thursday the 17th — 5 of 7 free. The group is leaning low-key.**

**Three rules govern this screen. Each fixes an audit finding and none is negotiable.**

**Rule 1 — The horizon is three weeks, not one.** Groups plan two to four weeks out. A signal covering only the next six days answers a question nobody asked. Weeks two and three are coarse (which nights, not which hours), which is all the precision a plan three weeks away can use anyway.

**Rule 2 — Calendar sync drafts, it never asserts.** A calendar shows what is *scheduled*, not what someone is *up for*. Nobody puts "exhausted" or "broke" in Google Calendar, so calendar data reliably over-reports availability. Therefore: **sync can remove a night, never add one.** A hard conflict greys the night out; the absence of a conflict does nothing on its own. Every night that counts as free must be affirmatively tapped by a human.

**Rule 3 — One Signal, all groups.** A person in three friend groups performs the ritual once. Vibe and availability are global. Per-group overrides exist for people who genuinely live different lives in different circles, but they are opt-in and never prompted. The ten-second cost must not scale with the number of groups you belong to, because the people in the most groups are the most valuable users and would churn first.

### 2.3 Why this specific design works

Each element addresses a named failure. This is not decoration.

**a) Synchrony creates social gravity.**
BeReal's real insight was never the dual camera. It was that *everyone acts at the same moment*, which turns a solitary chore into a shared event. When six friends get the same push at 7:00 PM Sunday, the ritual becomes a group behavior rather than an individual task. Individual habits decay; group rituals are enforced by the group.

**b) Effort is asymmetric and tiny.**
Ten seconds of input from one person creates value for every other member. This is the only sustainable ratio for a multiplayer utility. Anything requiring more than ~15 seconds weekly will not survive contact with a busy adult.

**c) The payoff is immediate and non-obvious.**
The user submits and instantly learns something they did not know and could not have computed: *the group's best night.* Every ritual must end in a reward. A ritual that ends in "thanks, saved" is dead within three weeks.

**d) Decay creates loss aversion, not guilt.**
Signals decay progressively rather than snapping to zero. A confirmation is only as good as the moment it was made: **seven days after you signal, everything you tapped stops counting as a hard yes and becomes merely unconfirmed** — still shown in the heatmap, at reduced weight, but excluded from headline counts. Skip repeatedly and you fade out of the picture entirely. You are never scolded; plans simply get made without you. This is more motivating than a nag and more honest than one: the app cannot represent you if you have not told it anything.

> **Clarified 2026-09-04 (v0.3).** This paragraph previously said "the current week expires Saturday night, while weeks two and three persist but are marked unconfirmed," which read to the implementer as *only* week one decaying — and the engineering spec had encoded exactly that. The effect was that an abandoned signal kept asserting hard confirmations for its later two weeks for a fortnight, so skipping had no consequence and the heatmap over-reported availability (the A2 failure). One timer, applied to the whole signal, is both simpler and what this section always intended. See `engineering-spec.md` §4.0.

**e) It defeats the Dead Interval by design.**
The app no longer needs a plan in flight to be opened. It has a heartbeat: 52 guaranteed sessions per user per year, each one refreshing the exact data the product runs on. The Signal *is* the retention loop.

**f) It defeats the Maintenance Tax.**
Vibe and budget carry more planning signal than a precise calendar, and cost one tap. Calendar sync removes known conflicts passively, so the human is confirming a short list rather than constructing one.

**g) Cadence adapts to the group's real tempo.**
Most groups plan once or twice a month, so a weekly ask can outrun the behaviour it supports. The three-week horizon means each Signal now feeds several planning windows rather than one. Beyond that, a group with sustained low plan volume is **automatically stepped down to a fortnightly Signal** rather than being left to decay into silence. Better to ask less often than to be ignored.

### 2.4 The supporting loops

The Signal is the spine. Four secondary loops reinforce it.

**Loop 2 — The Poke (peer-driven, highest-potency).**
Friend groups already nag each other, and it works. The design constraint is that **the nagging must come from a person, not from the app.**

- *"You're the only one who hasn't signalled"* → the app is a cop, one person is publicly behind, and it reads as a chore tracker.
- *"Deniz wants you in on Thursday"* → a friend reached out and the app was just faster than typing it.

Identical nudge, opposite emotional register. Rules:

1. **Always attributed to a named sender.** Never anonymous, never system-voiced.
2. **Always tied to real overlap**, never administrative. Not *"add your availability"* but *"Nadia and 3 others are free Thursday — are you in?"* The recipient is being invited, not audited.
3. **Scarce by design.** One send per person per week; hard cap of two received per person per week regardless of how many friends fire. Scarcity is what keeps it feeling like affection rather than spam.
4. **No shaming surface.** Group Home shows a count (`5 of 7 signalled`), never a list of who is missing. Poking requires deliberately opening a member's card — a small friction so it is a choice, not a one-tap pile-on.
5. **Responds inline.** The notification expands directly into the Signal. Dumping someone into the app to go find a screen loses half of them.
6. **A shush exists.** Anyone can mute pokes for two weeks. Friends see a soft state — *"Sam's heads-down until the 20th"* — so it reads as context rather than avoidance. This matters most for exactly the people the product must handle gently: the genuinely overloaded, and the quietly broke.

**Health metric:** track poke concentration. If one member receives more than ~60% of a group's pokes, that group is forming a dynamic the product should not be the engine of; damp the mechanic for that group.

This is also plausibly a stronger *acquisition* lever than a retention one. *"Nadia wants you in on Thursday"* is the most openable notification the product can send and the best possible re-entry point for a lapsed user. Test it on dormant members, not only active ones.

**Loop 2b — The Nudge (automated fallback).**
When three or more people are free on the same night and no plan exists, and nobody has poked anyone, one rotating member gets:

> *"Thursday is wide open for 5 of you. Want to start something?"*

Max one per group per week, and **it yields to the Poke** — a real friend's message will always outperform an app-generated one, and both firing in the same week exceeds the notification budget. Rotate the recipient so no single person becomes the group's default planner and burns out.

**Loop 3 — The Recap (emotional, retrospective).**
The Monday after a plan happens, a small auto-generated card: who came, photos dropped in the plan thread, how long since the last hang. This is the memory layer. It builds emotional switching cost, which is the only kind that holds in a social app. Partiful's recaps are quietly a large part of why people return.

**Loop 4 — The Occasion (calendar-driven).**
Birthdays, someone's last week before moving, an anniversary of a trip. The app knows these and prompts action, tying directly into the wishlist and group-gifting features. High-emotion, high-conversion, and naturally revenue-adjacent.

**Loop 5 — The Invite (acquisition, not retention, but load-bearing).**
Every plan invite is a public, no-account link. Recipients see the plan and RSVP with zero friction. The account prompt appears only when they want to *see the heatmap* or *add their own availability*. Every plan is therefore a distribution event, and the thing you sign up for is the thing that has already demonstrated value.

### 2.5 The cold start protocol

Retention mechanics are useless if the room is empty on day one. Overlap is therefore **group-seeded, never individually seeded.**

- A group is "live" at **3+ members with current signals.** v0.1 set this at four; that imposed a fourfold coordination cost at the moment of lowest motivation. Three is the smallest number at which "overlap" is a meaningful concept, and it is materially easier to reach. Below it the app says so plainly: *"Overlap works once 3 of you are in. 1 to go."* Honest scarcity beats a broken empty heatmap.
- Onboarding is a **group import**, not a solo signup: create the group, drop a link into the existing chat, done.
- The first Signal is triggered manually by the group's founder, so the ritual begins with a real moment rather than waiting up to six days for Sunday.
- **Below the threshold, the app produces a shareable availability card**, not an invite tool. v0.1 proposed falling back to Partiful-equivalent invites, which picks a fight on the one surface where we are guaranteed to lose. Instead: a rendered image of whatever overlap exists so far — *"Mobi, Deniz and Nadia: Thursday and Saturday look open"* — that gets dropped straight into the existing group chat. It works for people who never install anything, it demonstrates the value proposition in the place the group already lives, and it is a fundamentally different artifact from an invite.

### 2.6 What we deliberately do not build

- **No feed.** No infinite scroll, no likes, no follower counts. A feed invites comparison, requires moderation, and competes with Instagram. Overlap is a utility with warmth, not an attention product.
- **No streaks with punishment.** Streaks are visible and celebratory, never guilt-inducing. Guilt mechanics in a friendship app poison the emotional register the product depends on.
- **No general-purpose chat.** Conversation is scoped to a plan and auto-archives when the plan ends. We do not try to beat iMessage; we do the one thing iMessage cannot, which is hold structured state.

### 2.7 Retention success criteria

The v1 test is a single number:

> **W4 Signal Completion Rate ≥ 55%** — the share of active group members who complete the Sunday Signal in week four, with no manual prompting from the founder.

Secondary: **≥ 1.5 real-world plans per group per month** by week eight. If a group's plan rate is zero, the app is a toy regardless of how good the completion rate looks.

If W4 Signal Completion falls below 35% in the pilot, **the mechanic is wrong and must be redesigned before any further feature work.** Do not build the wishlist, the commerce layer, or the mobile apps until this number holds.

---

## 3. Goals, Objectives & Success Metrics

### 3.1 Mission

Make it easy for adult friend groups to keep seeing each other, by removing the scheduling work that quietly ends friendships.

### 3.2 Strategic goals

| # | Goal | Why it matters |
|---|---|---|
| G1 | Own the "when are we all free" moment | It is the highest-frequency unsolved problem in social planning |
| G2 | Convert overlap into real-world plans | Plans are the only outcome that matters; everything else is vanity |
| G3 | Build a durable weekly habit | Without habit, the data is stale and the product is fiction |
| G4 | Become the highest-intent local demand signal | This is the entire business model |
| G5 | Preserve trust absolutely | One privacy failure kills a product built on friends' calendars |

### 3.3 Objectives by phase

**Phase 0 — Prove the mechanic (Weeks 1–8)**
- O0.1: 5 real friend groups, minimum 5 members each, using it unprompted
- O0.2: W4 Signal Completion ≥ 55%
- O0.3: ≥ 8 real-world plans that would not otherwise have happened
- O0.4: Qualitative: at least 3 users independently describe the heatmap as the reason they use it

**Phase 1 — Prove the loop (Months 3–6)**
- O1.1: 100 active groups
- O1.2: Plan Conversion Rate ≥ 25% (see §17)
- O1.3: Organic group creation ≥ 40% of new groups
- O1.4: Median time from "open app" to "invite sent" under 60 seconds

**Phase 2 — Prove the business (Months 6–12)**
- O2.1: First $1 of booking-derived revenue
- O2.2: ≥ 15% of plans route through a monetizable action
- O2.3: 3 local supply partnerships in one launch city
- O2.4: Contribution margin positive per active group

### 3.4 The North Star Metric

> **Confirmed Hangs Per Group Per Month (CHPGM)**

Not signups. Not DAU. Not messages.

v0.1 defined this as "plans happened," which we cannot observe — a plan where everyone flaked would have counted as a success, meaning the primary metric could rise while the product failed. A hang is **confirmed** only when a plan had a date, ≥3 RSVPs, was not cancelled, **and** produced at least one post-event attendance signal: a photo in the thread, a message sent after the start time, or a one-tap *"we made it"* in the Recap card.

This undercounts. Real hangs will happen with no digital trace and go unrecorded. That is the correct direction to be wrong in — a metric that undercounts keeps you honest, while one that overcounts lets you celebrate a dying product.

### 3.5 Guardrail metrics

Watched to ensure growth is not bought with harm:

- Push notifications sent per user per week (**hard cap: 4**)
- Calendar-permission revocation rate (**alert if > 5%**)
- Group churn: groups going 30 days with zero signals
- Reported discomfort with wishlist visibility (qualitative, every cohort)

---

## 4. Users, Personas & Jobs To Be Done

### 4.1 Target segment

**Primary:** Ages 23–35, post-university, urban or suburban, employed, friend group of 5–12 that formed in school and is now geographically scattered across a metro. The defining trait is that they *want* to see each other and are failing to.

**Secondary:** Ages 28–45 with children — where scheduling difficulty is severe and the payoff for solving it is highest, but availability is more constrained and less spontaneous.

**Explicitly not the target at launch:** university students (already co-located, low scheduling pain), professional networking (that is Calendly's market), dating.

### 4.2 Personas

**The Organizer — "Nadia," 27**
Ends up planning everything. Holds the group's schedule in her head. Experiences planning as unpaid labor and is quietly resentful.
*Needs:* to stop being the only one doing the work.
*Overlap gives her:* the computation done for her, and a rotation mechanic so she isn't always the one asked.

**The Willing But Passive — "Deniz," 30**
Says yes to everything, initiates nothing. Not lazy — genuinely does not know when others are free, and does not want to be the one who proposes and gets left on read.
*Needs:* a low-risk way to signal availability.
*Overlap gives him:* a ten-second weekly action that makes him visible without requiring him to propose anything.

**The Genuinely Overloaded — "Sam," 34**
Two jobs, or a kid, or both. Wants in, is legitimately unavailable most of the time, feels guilty declining.
*Needs:* to communicate constraints without repeated apology.
*Overlap gives her:* a `Slammed` tap that says it once, for everyone, with no emotional overhead.

**The Quietly Broke — "Jonah," 25**
The real blocker is money, not time. Declines plans and lets everyone assume he's busy, because saying "I can't afford that" in a group chat is humiliating.
*Needs:* to shape plans toward his budget without disclosing his finances.
*Overlap gives him:* the `Broke this week` vibe, aggregated so the group sees a mood, not an individual's bank balance. **This is one of the most emotionally valuable features in the product and should be handled with care in the UI — never show who is broke, only how many.**

### 4.3 Jobs To Be Done

| When… | I want to… | So I can… |
|---|---|---|
| I miss my friends but the chat is dead | see when we're collectively free | propose something that will actually work |
| I have a free Thursday | know if anyone else does | not waste it alone |
| I'm invited to something | say yes without downloading anything | not feel friction at the moment of commitment |
| My friend's birthday is coming | know what they'd actually want | not give a bad gift or ask an awkward question |
| I'm broke or exhausted | say so once, softly | stop performing availability I don't have |

---

## 5. Competitive Landscape

| Product | Does well | Gap Overlap exploits |
|---|---|---|
| **Partiful** | Beautiful invites, zero-friction RSVP, no account needed | Assumes the date is already chosen. Solves the invite, not the scheduling |
| **Calendly** | Effortless 1:1 booking | Professional register; 1:many, not many:many; nobody sends a Calendly link to friends |
| **When2Meet / Doodle** | Group availability solved | Per-event, disposable, ugly, requires everyone to fill a grid every time. No persistence, no relationship |
| **Elfster / Giftster** | Wishlists without awkwardness | Seasonal, gift-only, no planning dimension |
| **Group chat (iMessage/WhatsApp)** | Universal, zero adoption cost | Cannot hold structured state. This is the real competitor and the reason to stay narrow |
| **The graveyard** (Down to Lunch, Free, Kickback) | Correct instinct on the problem | Died on retention. Manual status entry, no ritual, no decay, empty rooms |

**Positioning statement:**
> Partiful is for the party. Overlap is for the six weeks before it, when nobody can figure out a date.

**Defensibility.** Features here are copyable in a quarter. The moat is (a) group-level network effects, since a group must move together and rarely does, (b) accumulated memory — recaps, wishlists, hang history — which raises emotional switching cost, and (c) supply-side relationships in launch cities once the commerce layer is live.

---

## 6. Product Scope

### 6.1 v1 — The Wedge (build this and nothing else)

- Group creation and join-by-link
- Calendar sync, **free/busy only**, Google + Apple
- The Sunday Signal (vibe, nights, one-liner)
- The Overlap heatmap
- Plan creation from a heatmap slot
- Shareable, no-account invite page with RSVP
- Plan-scoped chat thread
- Progressive availability decay and the Sunday dispatch (SMS-first)

### 6.2 v2 — The Depth

- The Nudge (idle-overlap detection with rotating recipient)
- The Recap card
- Someday List (do-list and want-list)
- Occasion detection (birthdays, departures)
- Photo drop in plan threads
- Recurring plans

### 6.3 v3 — The Business

- Venue and activity suggestions matched to vibe + budget + date
- Booking handoff and affiliate attribution
- Group gift pooling via Stripe Connect
- Organizer cosmetic upgrades
- Native iOS/Android shells

### 6.4 Out of scope, permanently

Public profiles · follower graphs · a discovery feed · dating features · location tracking · read receipts on availability · anything that reveals *who* is broke or *what* is on someone's calendar

---

## 7. Design Document

### 7.1 Design principles

1. **The answer, not the data.** Never show a grid and ask the user to interpret it. Show "Thursday, 5 of 7." Interpretation is the product's job.
2. **Zero-keyboard core loop.** The Signal and plan creation must be completable entirely by tapping.
3. **Ambiguity is a feature.** Free/busy without event names. Aggregate vibe without attribution. Privacy through abstraction is what makes the app safe to keep installed.
4. **Warm utility.** Feels like a good friend who is organized, not like enterprise software and not like a party app screaming at you.
5. **Never guilt.** Absence has consequences (invisibility), never scolding.

### 7.2 Information architecture

```
Overlap
├── Groups (switcher, if >1)
│   └── Group Home  ← the app's center of gravity
│       ├── Overlap Heatmap (rolling 3-week horizon)
│       ├── Live Plans
│       ├── Signal state ("5 of 7 have signalled")
│       └── Occasions strip
│
├── Signal (weekly modal, push-triggered)
│   ├── Vibe
│   ├── Nights
│   └── One-liner
│
├── Plan Detail
│   ├── Header (title, when, where, cover)
│   ├── RSVP row
│   ├── Thread
│   ├── Suggestions (v3)
│   └── Cost split / pool (v3)
│
├── Someday List (v2)
│   ├── Things I'd do
│   └── Things I'd want
│
└── Me
    ├── Calendar connections
    ├── Notification prefs
    └── Privacy controls
```

### 7.3 Key screens

**Group Home**
The heatmap owns the top 60% of the viewport. Days as columns, the current week by default, horizontally scrollable across the full three-week horizon. Each day is a saturation block: darker = more people confirmed free. The single best night is called out in plain language above the grid.

**Confirmed and soft availability must be visually distinct** (A2). Confirmed free renders as solid saturation; *no known conflict* renders as a hatched or outlined state that reads clearly as provisional. The headline count above the grid uses confirmed only. A user should never be able to glance at this screen and mistake calendar silence for a friend saying yes.

Beneath: live plans as cards. Beneath that: the Signal state row, showing group completion as a soft progress indicator (`5 of 7 signalled`) — a count only, never a list of who has not.

Primary action: a persistent **"Start something"** button anchored bottom-right.

**The Signal modal**
Full-screen, three sections, no scroll on a standard phone. Vibe as five large tap targets. Nights as seven pills, pre-selected from calendar data with a visible "we filled these in from your calendar" affordance so the sync never feels invisible or creepy. Submit reveals the heatmap with a short animation — the reveal is the reward and should be the most polished moment in the app.

**Plan Detail / Public Invite**
Same layout, two states. Logged-out visitors see the plan, the attendee list, and an RSVP field requiring only a first name. The account prompt appears *after* RSVP, framed around what they gain: *"Want to see when this group is free next?"*

### 7.4 Visual direction

- **Type:** one confident geometric or grotesque sans for UI; a distinct display face for plan titles and invite headers, where personality is welcome. Invites are the shareable surface and should look designed, not generated.
- **Colour:** a restrained neutral base so the heatmap saturation carries all the visual weight. One accent for actions. Vibe states get their own small, warm palette — never red/green traffic-light semantics, since "busy" is not failure.
- **Motion:** used only for the heatmap reveal and RSVP confirmation. Everywhere else, motion is a cost.
- **Dark mode:** required at launch. This app is opened at night.
- **Accessibility:** heatmap intensity must never be conveyed by colour alone — pair saturation with a numeric label. WCAG AA minimum on all text.

### 7.5 Notification design

Hard cap of four pushes per user per week, **enforced by a central dispatcher in code, not by policy.** v0.1's list was already oversubscribed once the Poke was added; the ladder below resolves contention explicitly.

| Rank | Notification | Cadence | Displaces |
|---|---|---|---|
| 1 | **Sunday Signal** | Weekly, fixed | Nothing. Never crowded out under any circumstance |
| 2 | **Direct plan invite** | Event-driven | — |
| 3 | **Plan starting soon** | Event-driven, ~3h before | — |
| 4 | **The Poke** | Max 2 received/user/week | Suppresses the Nudge for that group-week |
| 5 | **The Nudge** | Max 1/group/week | Fires only if no Poke occurred and budget remains |

Every dispatch passes through a single service that checks the user's weekly count before sending. If the budget is exhausted, lower-ranked notifications are dropped, not queued — a stale nudge delivered Wednesday is worse than none.

Everything else is in-app only. Notification volume is the fastest way to get uninstalled, and the Signal is the one push that must never be lost.

---

## 8. Data Model

Conceptual schema. Postgres, snake_case tables.

**user** — `id`, `phone_e164` (unique), `display_name`, `avatar_url`, `timezone`, `created_at`

**group** — `id`, `name`, `avatar_url`, `created_by`, `signal_day` (default 0=Sun), `signal_hour` (default 19), `is_live` (bool, derived from member threshold), `created_at`

**group_member** — `group_id`, `user_id`, `role` (member|admin), `joined_at`, `last_signal_at`

**calendar_connection** — `id`, `user_id`, `provider` (google|apple|caldav), `refresh_token_encrypted`, `sync_status`, `last_synced_at`, `scope_granted`

**busy_block** — `id`, `user_id`, `starts_at`, `ends_at`, `source` (calendar|manual). **No title, no location, no attendees. These fields are never fetched and never stored.**

**signal** — `id`, `user_id`, `group_id` (**nullable — NULL means global, the default**), `week_start_date`, `vibe` (enum), `note` (varchar 140), `submitted_at`
*Unique constraint on (user_id, group_id, week_start_date), with NULLs treated as a single global row.*
*A nullable `group_id` is what makes Rule 3 work: one Signal serves every group unless the user explicitly creates an override.*

**signal_night** — `id`, `signal_id`, `date`, `state` (`confirmed_free` | `no_known_conflict` | `blocked`), `horizon_week` (0, 1, or 2), `confirmed_at`
*Replaces v0.1's `available_nights` array. Three weeks of nights per signal, each carrying its own confirmation state.*
*Only `confirmed_free` counts toward headline overlap numbers. `no_known_conflict` renders at reduced weight and is never used in the plain-language summary — this is finding A2 enforced at the schema level, so no future feature can accidentally treat calendar silence as consent.*

**plan** — `id`, `group_id`, `created_by`, `title`, `description`, `starts_at`, `ends_at`, `location_text`, `location_place_id`, `cover_asset`, `status` (draft|live|happened|cancelled), `public_slug` (unique), `visibility`

**rsvp** — `id`, `plan_id`, `user_id` (nullable for guests), `guest_name`, `status` (going|maybe|out), `plus_ones`, `responded_at`

**message** — `id`, `plan_id`, `author_id`, `body`, `attachment_url`, `created_at`, `archived_at`

**someday_item** — `id`, `user_id`, `kind` (do|want), `title`, `url`, `price_cents`, `note`, `visibility` (group|close_friends), `claimed_by` (nullable, **never visible to owner**), `created_at`

**occasion** — `id`, `group_id`, `subject_user_id`, `kind` (birthday|departure|anniversary), `date`, `notified_at`

### 8.1 Derived: the overlap computation

Not a stored table. Computed per group per date range:

```
For each night N in the 3-week horizon:
  confirmed    = members with signal_night(N).state = 'confirmed_free'
  soft         = members with state = 'no_known_conflict'
  score        = confirmed  (soft is displayed, never scored)

  vibe_profile = distribution of vibes among confirmed members
                 → exact counts released only if len(confirmed) >= 5
                 → otherwise a qualitative band
                 → 'Broke this week' NEVER surfaces as a count at any size;
                   it only silently reweights suggested plans

Return nights ranked by score, plus a plain-language summary for the top night
built exclusively from confirmed members.
```

Two invariants worth stating explicitly, because both are load-bearing and both are easy to erode later:

1. **Soft availability is never scored.** It can invite a person to confirm; it can never make the group think someone is free.
2. **The k-anonymity floor of 5 is enforced here, in the computation** — not in the UI. A privacy guarantee implemented at the presentation layer is one refactor away from being lost.

Cached in Redis per `(group_id, week)`, invalidated on any new signal or calendar sync. Target compute time under 50ms for a 12-member group.

---

## 9. Software Architecture & Engineering Plan

### 9.1 Stack

Chosen to match the builder's existing strengths (Next.js, Python, REST integrations) and to reach a testable v1 without app-store review.

| Layer | Choice | Rationale |
|---|---|---|
| Client | **Next.js 15 (App Router), React, TypeScript** | PWA-first. Installable, push-capable on modern iOS/Android, no review cycle. Native shells deferred to v3 |
| Styling | **Tailwind + a small custom component layer** | Speed without a heavy design-system dependency |
| API | **Next.js Route Handlers + tRPC** | End-to-end type safety, one deployable, minimal ops |
| Async jobs | **Python worker service** (FastAPI + Celery/RQ) | Calendar sync, Signal dispatch, overlap precompute, occasion detection. Plays to existing Python strength; keeps long-running work off the web tier |
| Database | **Postgres (Supabase or Neon)** | Relational fit is exact. Row-level security available if using Supabase |
| Cache/queue | **Redis (Upstash)** | Overlap cache, rate limiting, job queue |
| Auth | **Phone OTP** (Twilio Verify or Supabase Auth) | Friend groups are phone-graph, not email-graph. Also the natural bridge to contact-based invites |
| Push | **SMS (Twilio) as the guaranteed channel** + Web Push (VAPID) as an upgrade | See A3. iOS web push requires Home Screen installation first — a step most users skip. The retention mechanic cannot rest on a channel that silently fails. SMS is the floor; web push is the cheaper path once earned. Native FCM/APNs immediately post-M5 |
| Realtime | **Supabase Realtime or Pusher** | Plan threads and live RSVP only. Not needed for the heatmap |
| Payments | **Stripe Connect** (v3) | Never custody funds directly |
| Media | **Cloudflare R2 or Supabase Storage** | Cover images, plan photos |
| Analytics | **PostHog** (self-host or cloud) | Funnels, cohort retention, feature flags in one tool |
| Errors | **Sentry** | |
| Hosting | **Vercel** (web) + **Fly.io / Railway** (Python worker) | |

### 9.2 Service boundaries

```
┌─────────────────────────────────────────┐
│  Next.js App (Vercel)                   │
│  · UI (RSC + client components)         │
│  · tRPC API                             │
│  · Public invite pages (SSR, cacheable) │
└──────────────┬──────────────────────────┘
               │
     ┌─────────┴─────────┬──────────────┐
     ▼                   ▼              ▼
┌──────────┐      ┌────────────┐   ┌─────────┐
│ Postgres │      │   Redis    │   │   R2    │
└──────────┘      └────────────┘   └─────────┘
     ▲                   ▲
     └─────────┬─────────┘
               │
┌──────────────┴──────────────────────────┐
│  Python Worker (Fly.io)                 │
│  · calendar_sync      (every 6h/user)   │
│  · signal_dispatch    (cron, per tz)    │
│  · overlap_precompute (on invalidation) │
│  · occasion_scan      (daily)           │
│  · nudge_evaluator    (daily)           │
└──────────────┬──────────────────────────┘
               │
     ┌─────────┴──────────┬─────────────┐
     ▼                    ▼             ▼
 Google Cal API      Apple/CalDAV    Twilio
```

### 9.3 Critical implementation notes

**Calendar sync — request the minimum.**
Google Calendar's FreeBusy API returns busy intervals *without* event details. Use it rather than the Events API. This is both a privacy commitment and a smaller OAuth scope, which materially improves consent rates. Apple requires CalDAV or a native EventKit bridge; if CalDAV proves painful in v1, ship Google-only and treat Apple as a fast-follow, since manual night-tapping is a viable fallback.

**Delivery must be instrumented separately from completion.**
The M5 gate asks whether the ritual works. If pushes silently fail to arrive, the gate will report "the mechanic doesn't work" when the truth is "the message never landed" — and the wrong lesson gets learned at the most expensive possible moment. Log `dispatched → delivered → opened → completed` as four distinct events per user per week. Signal Completion Rate must always be reported alongside **Signal Delivery Rate**, and any completion figure quoted without its delivery figure should be treated as unreliable.

**Calendar sync must be write-restricted at the query layer.**
Enforce A2 in code, not convention: the sync job may only write `signal_night.state = 'blocked'` or `'no_known_conflict'`. It is never permitted to write `'confirmed_free'` — that value is settable only by an authenticated user action. Add a database constraint or trigger so a future contributor cannot quietly "improve" pre-fill into assertion.

**Signal dispatch must be timezone-correct.**
A cron running hourly checks: for each group, which members are currently at 19:00 local on the group's signal day and have not yet received this week's push. Group members can be in different timezones; the dispatch is per-user, the deadline is per-group-week. Idempotency key: `signal:{user_id}:{week_start_date}` — **not** per-group. Keying it per group would send a user in three groups three Sunday Signals, which is exactly the ritual-multiplication A4 corrected, and would consume three of the four notification slots FIX-3 reserves one of. Where a user's groups disagree on `signal_dow` / `signal_hour` / `cadence_weeks`, dispatch at the **earliest** local slot among them, in any week where **any** of their groups is due.

**Decay is a read-time concern, not a write-time job.**
Do not run a job that deletes signals, and do not filter them either. Decay is computed in `resolveSignals()` at read time: a stale confirmation is **downgraded** to unconfirmed, never removed — it must still render at reduced weight (§2.3d), because a member who fades is different from a member who vanishes. There is no `expires_at` column and no expiry job; see `engineering-spec.md` §4.0.

**Public invite pages must be fast and unauthenticated.**
`/p/[slug]` server-rendered, cached at the edge, with OG image generation (Vercel OG) so links preview beautifully in iMessage. This page is the entire acquisition engine — it deserves disproportionate polish and a sub-1s LCP target on 4G.

**Rate limiting from day one.**
Group creation, invite sends, and OTP requests are all abuse vectors. Redis-backed limits before public launch, not after.

### 9.4 Build sequence

**Sprint 1 — Foundations (Weeks 1–2)**
Repo, CI, Postgres schema, phone OTP auth, group create/join-by-link. Deliverable: two devices can join the same group.

**Sprint 2 — Signal + Heatmap (Weeks 3–4)**
Signal modal, signal storage with expiry, overlap computation, heatmap UI, group home. Deliverable: *the core value prop is demonstrable.* Manual signal entry is fine here; calendar sync comes next.

**Sprint 3 — Calendar sync (Weeks 5–6)**
Google OAuth, FreeBusy polling, busy_block storage, pre-fill in Signal, Python worker deployed. Deliverable: zero-effort availability.

**Sprint 4 — Plans + Invites (Weeks 7–8)**
Plan creation from a heatmap slot, public invite page, RSVP, OG images, plan thread. Deliverable: **v1 complete. Begin the pilot.**

**Sprint 5 — Loop instrumentation (Weeks 9–10)**
Web push, Sunday dispatch cron, PostHog funnels, the retention dashboard. Deliverable: the numbers in §3 are measurable.

**Sprints 6–8 — v2** per §6.2, gated on the W4 Signal Completion result.

### 9.5 Testing

- Unit: overlap computation (edge cases — all busy, all free, single member, timezone boundaries, DST transitions)
- Integration: OAuth flows against Google sandbox; signal expiry across week boundaries
- E2E (Playwright): the two paths that matter — signal→heatmap→plan→invite, and invite→RSVP→signup
- Manual: the pilot groups are the real test suite. Instrument heavily and talk to them weekly.

---

## 10. Privacy, Trust & Safety

This product asks for access to friends' calendars and information about their money and energy. Trust is not a section, it is a precondition.

**Commitments, stated in-product in plain language:**

1. **We never see your event titles.** Only busy/free intervals are requested and stored. Enforced technically by using FreeBusy scopes.
2. **Nobody sees who is broke.** v0.1 promised aggregation, but aggregation does not protect anyone in a group of six — "3 of 7 are broke" is trivially solvable if you know a few people's plans. Corrected commitment, enforced in the overlap computation rather than the UI:
   - Exact vibe counts appear only when the responding cohort is **five or larger**.
   - Below five, the group sees a qualitative band only: *"the group is leaning low-key this week."*
   - **`Broke this week` is never shown as a count at any group size.** It silently reweights suggested plans toward low-cost options and is otherwise invisible. Individual vibe is visible only to the person who set it.
3. **No calendar data leaves the group.** Availability is scoped per group; a member of Group A cannot infer anything about Group B.
4. **Wishlist claims are hidden from the owner.** Standard secret-santa mechanic; prevents the awkwardness that kills gift features.
5. **Deleting a group deletes its data**, and disconnecting a calendar purges stored busy blocks immediately, not on a schedule.

**Compliance posture:** PIPEDA (Canada) and GDPR-shaped defaults — explicit consent, data export, deletion on request, documented retention windows. Third-party pen test before any paid acquisition spend. Google OAuth verification is required for the calendar scopes and takes several weeks; **start that process in Week 1** (A11, §13 M0) so it runs in parallel rather than blocking Sprint 3.

**Safety:** groups are private and invite-only. No discovery, no public search. Block and leave-group must be one tap and must remove the leaver from all future heatmaps immediately.

---

## 11. Monetization Strategy

**Core principle: users never pay for access.** A paywall on a multiplayer product is a growth kill switch — one holdout breaks the group. Revenue comes from the transaction the group was already going to make.

### 11.1 The asset

When a group declares *8 people · Saturday the 14th · this city · low-key vibe · moderate budget*, that is a purchase decision that has not yet been made. It is the highest-value pre-transaction signal in local commerce, and it is generated as a byproduct of the core loop rather than extracted from users.

### 11.2 Revenue streams, ordered by controllability

**This ordering was inverted in v0.2.** v0.1 ranked streams by projected size and put booking take-rate first — a stream that depends entirely on partners who may not accept us. A pre-revenue solo product cannot build its economics on a channel it does not control. Streams are now ordered by **how much of the outcome we own**, which for an early product is the only ordering that survives contact with reality.

**Stream 1 — Organizer upgrades** *(v2, fully controlled)*
Sell only to the person who cares most: the planner. Custom invite designs, animated covers, group themes, polls, larger guest caps, recurring plans, exportable recaps. **Everyone who receives an invite stays free forever**, which protects the acquisition loop. Partiful's approach, and it works because the buyer is purchasing status and aesthetics, not access. No partner required, no integration risk, shippable the moment there is demand.

**Stream 2 — Group gifting and pooling** *(v3, fully controlled)*
Occasion detection → wishlist → group pool. Platform fee on pooled contributions, the model used by group-gift and crowdfunding services. High margin, emotionally native, and it makes the Someday List commercially load-bearing rather than a nice-to-have. Requires only Stripe Connect, which is self-serve. Do not custody funds directly.

**Stream 3 — Booking take-rate** *(v3, ⚠️ UNVALIDATED — partner-dependent)*
When a plan needs a venue or tickets, route the booking: reservations, tickets, activities. Earn affiliate or CPA revenue per completed booking, at no cost to the user.

> **Explicit warning.** v0.1 treated this as the primary business and modelled the unit economics on it. That was unsound. The major reservation platforms largely do not operate open, self-serve affiliate programs — access is partnership-gated, terms are negotiated, and a pre-revenue product has little leverage. Ticketing and activities platforms are more accessible but cover a smaller share of friend-group plans. **Assume nothing here until a signed or self-serve program is confirmed in writing.**

*Validation method, to run during the pilot at zero engineering cost:* when a pilot group makes a plan needing a booking, make the booking manually on their behalf and record whether they would have used an in-app option. That produces a real monetizable-action rate before a line of integration code is written.

**Stream 4 — Native local supply** *(v3, requires sales motion)*
When the heatmap surfaces an open night, fill it: *"5 of you are free Thursday — this place has an 8-top at 7:30."* Charge venues for placement, priced against filled seats rather than impressions. Because the slot matches a declared date, party size, and budget, value per placement should far exceed display advertising. Harder than it sounds: local sales is a headcount business, and a solo founder can realistically service a handful of venues in one neighbourhood. Treat as a post-traction motion.

**Rule governing Streams 3 and 4: suggestions must be labelled, must match the group's stated constraints, and must never appear inside the Signal flow.** Contaminating the ritual with commerce would destroy the retention mechanic that makes the business possible.

**Stream 5 — Anonymized demand data** *(post-scale, handle with caution)*
Aggregate, non-identifiable demand signals for venues, hospitality groups, and city tourism boards. Genuinely valuable, but a misstep here destroys the trust the entire product rests on. Do not touch this before the privacy posture in §10 is audited and the brand is established. If in doubt, don't.

### 11.3 Unit economics — a test to run, not a projection

v0.1 presented the numbers below as a forecast. They are not one. Every input is an assumption, and the two that matter most are entirely unverified. Restated honestly:

| Input | Assumed | Confidence | How to verify |
|---|---|---|---|
| Members per active group | 7 | Medium | Pilot data |
| Plans per group per month | 1.5 | **Low** | Pilot data — could easily be 0.5 |
| Monetizable-action rate | 20% | **Very low** | Concierge test during pilot |
| Share of plans at someone's home | not modelled | **Unmodelled in v0.1** | Pilot data. Home hangs monetize at zero and may be the majority of all plans |
| Average booking value | $180 | Medium | Observable |
| Take rate | 8% | **Very low — may be 0%** | Requires a confirmed partner program |
| Infra + SMS cost per group/month | ~$0.40–0.90 | Medium | Revised upward from v0.1; SMS-first delivery costs more than web push |

Multiplying through gives roughly $4–5 per active group per month, and therefore something near $500K ARR at 10,000 active groups. **Treat that number as a hypothesis with two multiplicative unknowns, either of which could be zero.** If home hangs dominate and no booking partner materialises, Streams 3 and 4 collapse entirely and the business is Streams 1 and 2 — a smaller, slower, but genuinely controllable business, and one worth building anyway.

**The first commercial thing to prove is not revenue. It is the monetizable-action rate**, measured by hand, during the pilot, with no code.

### 11.4 What we will not do

Sell contact data · run interruptive display ads · paywall RSVP or invite viewing · dark-pattern the Signal into a sales surface · charge per group member

---

## 12. Go-To-Market

**Beachhead:** one metro (Toronto/GTA is the natural home-field choice), one demographic (25–32, post-grad friend groups), one wedge (the group that used to see each other weekly and now sees each other twice a year).

**Phase 1 — Concierge (Weeks 8–16).** Recruit during weeks 8–12; the pilot itself runs from M4 (week 12) to the M5 verdict (week 16). Five groups the founder can talk to directly. Personally onboard each one. Weekly interviews. The goal is not growth, it is discovering exactly where the Signal breaks.

**Phase 2 — Referral by artifact (Months 3–6).** Growth comes from invite links, not marketing. Every invite is branded, beautiful, and previews well in iMessage. Add a soft "made with Overlap" footer. Target: each active group produces 0.4 new groups per quarter.

**Phase 3 — Content and craft (Months 4–12).** The founder's own creative practice is a distribution asset here, not a distraction — build-in-public documentation, essays on friendship logistics in adulthood, and short video on the *problem* rather than the app. The theme ("adult friendship is failing on logistics, not affection") is genuinely resonant and under-covered, and it recruits exactly the demographic being targeted.

**Phase 4 — Supply-side (Months 6–12).** Approach 20 local venues with a concrete offer: filled tables on your slow nights, pay only on arrival. Venue partnerships also become a second acquisition channel.

**Seasonality to exploit:** early January (reconnection intent peaks), late spring (patio/summer planning), and December (gifting + reunions). Plan launches around these.

---

## 13. Roadmap & Milestones

**Revised in v0.2 (finding A11).** v0.1's eight-week v1 assumed no friction from Google OAuth verification, no iOS push quirks, and full-time availability. None of those hold for one person building alongside a job search. Timeline extended and the OAuth submission pulled forward to run in parallel rather than block.

| Milestone | Target | Gate to pass |
|---|---|---|
| **M0 — Google OAuth verification submitted** | **Week 1** | Filed. Runs in the background for weeks; must not sit on the critical path |
| M1 — Schema + auth + groups | Week 3 | Two devices in one group |
| M2 — Signal + heatmap (3-week horizon) | Week 6 | A real friend group reacts to their own heatmap |
| M3 — Calendar sync live (draft-only writes) | Week 9 | Conflict detection ≥ 90% precision. Precision matters more than recall — a false conflict is an annoyance, a false "free" is a broken promise |
| M4 — **v1 complete, pilot begins** | **Week 12** | 5 groups onboarded, SMS dispatch verified end-to-end |
| M5 — **Retention verdict** | **Week 16** | **W4 Signal Completion ≥ 55%**, reported alongside Signal Delivery Rate |
| M5b — Concierge monetization test | Week 16 | A real monetizable-action rate, measured by hand |
| M6 — Native shells | Month 5 | Moved earlier from v3. Only if M5 passes; delivery reliability is now known to be load-bearing |
| M7 — v2 features (Poke, Recap, Someday) | Month 6 | Only if M5 passes |
| M8 — 100 active groups | Month 8 | Organic group creation ≥ 40% |
| M9 — First revenue (Stream 1) | Month 9 | Organizer upgrades live — chosen because it needs no partner |

**M5 is a hard gate.** If it fails, the correct action is to redesign the mechanic and re-run the pilot, not to add features. Most apps in this category died by building v2 on top of a broken v1 loop.

---

## 14. Naming & Brand

`Overlap` is the working name and is strong: it names the exact thing the product computes, is a real English word, and is memorable. Trademark and domain availability must be checked before any spend.

Alternates worth checking, roughly in order of strength:

- **Overlap** — precise, ownable-sounding, describes the core screen
- **Freetime** — plain and warm, likely contested
- **Roster** — implies the group; slightly sporty
- **Kindred** — warm, less descriptive
- **Bandwidth** — knowing, matches the energy/vibe framing
- **Signal** — matches the core ritual, but collides with Signal Messenger. Avoid.

**Tone:** dry, warm, a little self-aware. The product's emotional thesis is *"we still like each other, we're just bad at calendars"* — the copy should sound like the funniest organized person in the group chat, never like a brand.

---

## 15. Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| The ritual doesn't stick | **Critical** | M5 gate. Test with 5 groups before building anything else. If <35%, redesign |
| Empty-room cold start | **Critical** | Group-seeded onboarding, **3-member** liveness threshold (A10), honest UI below it, and a **shareable availability card** below the threshold — explicitly *not* a solo invite tool, which would pick a fight with Partiful on their strongest surface |
| Google OAuth verification delays | High | Begin in Week 1 (A11/M0). Ship with manual night entry as fallback so the timeline never blocks on it |
| Group chat gravity pulls users back | High | Don't compete on chat. Be the thing the chat can't do. Make invite links live *inside* the chat |
| Notification fatigue | High | Hard cap of 4/week, enforced in code, not policy |
| Privacy incident | **Critical** | FreeBusy-only scopes, aggregation by default, pen test before paid growth |
| Partiful ships availability | Medium | They're anchored to the invite moment. Move fast on the ritual and the accumulated memory layer, which is the harder thing to copy |
| Monetization contaminates the loop | High | Suggestions never appear in the Signal flow. Hard product rule |
| Founder bandwidth (solo build + job search) | High | PWA-first, managed services, ruthless v1 scope. The four-sprint plan is deliberately sized for one person |
| Seasonal usage collapse (summer travel, winter hibernation) | Medium | Occasion loop and recap loop carry engagement through low-planning periods |
| **Push never arrives (iOS PWA)** — A3 | **Critical** | SMS as guaranteed channel; delivery instrumented separately from completion; native shells moved to Month 5 |
| **Heatmap over-reports availability** — A2 | **Critical** | Calendar drafts, humans confirm; enforced at the schema level so it cannot regress |
| **Booking affiliate programs are inaccessible** — A7 | High | Revenue order inverted to controllable streams first; booking marked unvalidated; concierge test before any integration |
| **Home hangs dominate and monetize at zero** | High | Unmodelled in v0.1. Measure the share during the pilot. If it exceeds ~60%, Streams 3–4 are not the business and the plan reduces to Streams 1–2 |
| **Poke becomes a friendship performance review** | Medium | Attribution to a person, scarcity caps, the shush, and poke-concentration monitoring. Highest-variance feature in the product |
| **The three-week horizon makes the Signal feel long** | Medium | Weeks 2–3 pre-filled from prior pattern; measure median completion time in the pilot and cut the horizon to two weeks if it exceeds 15 seconds |

---

## 16. Open Questions

**Resolved in v0.2:**

- ~~Per-group or global vibe?~~ → **Global**, with opt-in override (A4).
- ~~Four-member threshold or three?~~ → **Three** (A10).

**Still open:**

1. Is Sunday 7 PM right, or should the group choose its own signal time? Sunday evening is also a crowded, low-mood hour competing with every other weekly digest. *Test both; a group-set time may increase ownership at the cost of the cross-group synchrony that makes the ritual work.*
2. Does the Poke feel like affection or surveillance? Highest-variance feature in the product. Ship behind a flag; measure whether poked members complete the Signal at a higher rate **and** whether poke recipients churn faster.
3. Should the Someday List be always visible, or surfaced only at occasions? Always-visible risks the "asking" feeling Elfster carefully avoids.
4. Do groups want plan history visible within the group, or is that quietly judgmental about who shows up?
5. Phone-only auth excludes some users and complicates international. Accepted for v1; revisit before expansion.
6. Is three weeks the right horizon, or does four match how groups actually plan? Three is a guess informed by the completion-time constraint, not by data.
7. What share of friend-group plans happen at someone's home? This single number determines whether Streams 3 and 4 exist at all, and nobody has measured it. **Instrument it from day one of the pilot.**

---

## 17. Appendix: Metric Definitions

- **Signal Delivery Rate:** notifications confirmed delivered ÷ notifications dispatched, per channel. **Never report completion without this.** A low completion rate paired with a low delivery rate is a plumbing problem, not a product problem, and confusing the two would cause the M5 gate to reach the wrong verdict.
- **Signal Completion Rate (weekly):** members submitting a signal ÷ active group members, per group-week.
- **W4 Signal Completion:** the above in a cohort's fourth week, excluding groups where the founder manually prompted.
- **Plan Conversion Rate:** plans created ÷ weeks in which a group had ≥3 members **confirmed** free on a shared night. Soft availability is excluded from the denominator.
- **Confirmed Hangs Per Group Per Month (CHPGM):** *(North Star)* plans with a date, ≥3 RSVPs, not cancelled, past their end time, **and** carrying at least one post-event attendance signal. Deliberately undercounts.
- **Active Group:** ≥3 members with ≥1 signal in the trailing 14 days. *(Threshold lowered from 4 per A10.)*
- **Home Hang Share:** plans with no external venue ÷ total plans. Determines whether Streams 3–4 are viable.
- **Poke Concentration:** max share of a group's pokes received by any single member. Alert above 60%.
- **Organic Group Creation:** new groups whose founder first encountered Overlap through an invite link rather than direct outreach.
- **Monetizable Action Rate:** plans containing a booking, ticket, or pool action ÷ total plans.

---

*End of document. Revisit after M5 — the retention verdict should rewrite half of this.*
