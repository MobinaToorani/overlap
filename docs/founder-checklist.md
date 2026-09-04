# Founder Checklist — Everything the Agent Cannot Do

An agent can write the whole codebase and still leave you unable to ship. These are the tasks that require your identity, your money, your signature, or your relationships.

**The critical realisation:** the two longest-lead items — Google OAuth verification and A2P 10DLC registration — are both *approval processes with queues*, and both sit directly on the critical path. If you start them in week 6, you ship in month 5. Start them in week 1 and they resolve while the code is being written.

The rest of this document is organised by **phase**. The section immediately below is organised by **dependency**, because those are different questions and the second one is the one that's live right now.

---

## ⚡ The critical path, as of 2026-09-04

*Updated as the build state changes. The phase sections below stay authoritative for **what** each task involves; this section is only about **order** and **what is blocked right now**.*

**The wall: no SMS means no login, and no login means four finished tickets can't be verified.** T3, T4, T6 and T7 are all code-complete with passing tests, and all four are 🟡 rather than ✅ in `backlog.md` for the same single reason — Supabase Auth has no built-in SMS, so nobody can sign in on a real phone. Their database layers *are* verified against live Postgres; what's unverified is every path that needs a session.

This is not a reason to rush the build. It is a reason to start the queue below today, because the queue is the schedule.

```
Legal entity ──▶ Privacy policy (live URL) ──▶ A2P 10DLC ──▶ Twilio live
   1–2 wks            same pass                 1–4 wks         │
                                                                ▼
                                          Upstash MUST be done before this point
                                                                │
                                                                ▼
                                    T3/T4/T6/T7 verifiable on a real phone
```

**Sequential — each genuinely blocks the next:**

1. **Register the business.** A2P won't accept a Brand without a legal entity. Everything downstream chains here, so this is the first domino, not a paperwork chore to do once the fun part is done.
2. **Publish the privacy policy at a live URL.** Prerequisite for *both* A2P (item 1 below) and Google verification (item 2 below). It must already contain the SMS consent text you'll submit as your opt-in evidence — writing it afterwards means submitting twice.
3. **Submit A2P 10DLC.** The long pole, 1–4 weeks, and rejection is normal rather than catastrophic. Submit the day items 1 and 2 clear.

**Parallel — start now, none of these block each other:**

4. **Upstash Redis** — ~30 minutes, and it is a **safety interlock, not infrastructure setup.** See the promoted item in Weeks 2–4 below; the short version is that it must be live *before* Twilio is, not merely before launch.
5. **Rotate the Supabase secret key and database password** if you haven't since they were first set. Ordinary hygiene for credentials that have been pasted around during setup.
6. **Google OAuth verification** — 2–6 weeks of queue, but "testing" mode with manual test users covers the *entire* pilot, so it blocks nothing. Start it so it isn't a surprise in month 3; don't let it hold up T9.
7. **Pilot recruitment.** Five real groups has its own lead time and no queue to hide behind. It is the task most likely to be left until it is suddenly urgent, and the one where being late quietly ruins the data.

**One decision that is yours and is currently unmade:** the kill criteria have a gap between 35% and 54% where the documents don't say what you do. See the pilot-recruitment section — decide it before the pilot, not during it.

---

## 🔴 Week 1 — Start immediately, these have queues

### 1. Twilio A2P 10DLC registration ⏱ 1–4 weeks, can be rejected
**This is the single most likely thing to delay your launch, and it did not exist as a concern until the audit made SMS the primary channel.**

Sending application-to-person SMS to US and Canadian numbers requires registering a Brand and a Campaign with the carriers. Unregistered traffic gets filtered or blocked outright — and it fails *silently*, which means you would see it as "the ritual doesn't work" rather than "the messages never arrived."

**It also gates more of the build than it looks like it should.** Supabase Auth has no built-in SMS provider, so phone OTP cannot send at all until Twilio exists — which means T3, T4, T6 and T7 stay unverifiable on a real phone no matter how finished their code is. Four green tickets are waiting on this one queue.

- [ ] Create Twilio account, buy a number
- [ ] Register Brand (needs a legal business entity — see item 3)
- [ ] Register Campaign, use case: **account notification / low volume mixed**
- [ ] Submit sample messages matching `copy.signalPushSms` exactly
- [ ] Document opt-in flow: users consent at phone signup; include the consent text in your privacy policy *before* submitting
- [ ] Set up the delivery-status webhook so `delivered_at` actually populates

> If registration is rejected or slow, the pilot fallback is a WhatsApp group where you send the Sunday reminder manually. Ugly, but it tests the mechanic rather than the plumbing. **Do not conflate the two.**

### 2. Google Cloud + OAuth verification ⏱ 2–6 weeks
- [ ] Create Google Cloud project, enable Calendar API
- [ ] Configure consent screen; request **`calendar.freebusy` scope only**
- [ ] Record the demo video Google requires, showing the consent flow and what the data is used for
- [ ] Publish privacy policy at a live URL first — verification requires it
- [ ] Submit for verification

> Under 100 users you can stay in "testing" mode with manually added test users. **That covers the entire pilot.** So this can run in parallel; just don't discover in month 3 that you never started it.

### 3. Legal entity + policies ⏱ 1–2 weeks
- [ ] Register the business (Ontario sole proprietorship is fast and cheap; incorporate later if you raise)
- [ ] Business bank account
- [ ] Privacy policy — must specifically cover calendar data, phone numbers, SMS consent, and retention windows. This is a prerequisite for items 1 and 2, not a nice-to-have.
- [ ] Terms of service
- [ ] PIPEDA compliance basics: stated purpose, consent, access, deletion on request

### 4. Domain + name clearance ⏱ 1 day
- [ ] Check "Overlap" for trademark conflicts in the app space (CIPO and USPTO free search)
- [ ] Buy the domain. If `.com` is gone, `.app` reads fine for this category
- [ ] Reserve the handle on Instagram, TikTok, X

---

## 🟠 Weeks 2–4 — Accounts and infrastructure

### ⚠️ Upstash Redis — must be live BEFORE Twilio is, not merely before launch

Listed first and separately because it spent this document's earlier drafts as one bullet in a list of ten, which is the wrong weight for it.

Measured during the Sprint 1 audit (2026-09-04): with no Upstash credentials, the rate limiter silently falls back to an in-memory counter that **resets whenever the module is re-instantiated — which is every request in some serverless environments.** `auth.requestOtp` is therefore effectively unthrottled today. The wiring is correct and tested (`rateLimitWiring` proves a 4th request trips `TOO_MANY_REQUESTS`); the limiter behind it is inert.

That is harmless while SMS is disabled and becomes a **billing-attack vector the moment Twilio goes live**, because every unthrottled OTP request is a paid SMS. This is precisely what FIX-9 exists to prevent, and the gap is credentials rather than code.

- [ ] Create the Upstash Redis database (~30 minutes, free tier is fine)
- [ ] Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in Vercel **and** `.env.local`
- [ ] Confirm the startup warning about the in-memory fallback no longer appears
- [ ] **Only then** enable Twilio sending

> See ADR-0004 and `traceability.md`'s FIX-9 row — it is the one row in that matrix marked 🔴, and this is why.

### The rest

- [ ] Supabase project (start free, Pro at ~$25/mo when the pilot begins)
- [ ] Vercel account
- [ ] Fly.io account for the worker
- [ ] Rotate the Supabase secret key and DB password once setup settles — they get pasted into terminals, env files and CI during provisioning, and rotating afterwards is cheaper than auditing where they landed
- [ ] PostHog (free tier covers the pilot)
- [ ] Sentry (free tier is fine)
- [ ] GitHub repo, private, with branch protection on `main`
- [ ] Password manager for all of the above — you will have fifteen credentials by month two
- [ ] Set a **spend alert on every service.** A runaway worker loop can cost real money overnight.

**Realistic monthly cost through the pilot: $40–80.** Twilio is usage-based; at 5 groups × 7 people × up to 4 messages **per week** (INV-5's cap, not per month) that is roughly 600 SMS/month plus OTP — still only a few dollars, but the per-week unit is what scales correctly when you extrapolate to 100 groups, but it scales linearly with users, so watch it.

---

## 🟡 Weeks 2–8 — Design and content, in parallel with the build

- [ ] Logo and app icon (needs to read at 48px)
- [ ] PWA manifest icons: 192, 512, maskable
- [ ] Confirm the type pairing. The spec suggests Inter + Instrument Serif — both free, both good, change if you have a stronger instinct
- [ ] Design the **invite page**. This is the one screen strangers see and the entire acquisition engine. Give it more time than feels proportionate
- [ ] Design the OG image template — test it in a real iMessage send, not a preview tool
- [ ] Write the empty states. They do more emotional work than the full states
- [ ] Screenshot set for a future app store listing

---

## 🟢 Weeks 8–12 — Pilot recruitment

**This is the part founders skip and then wonder why the data is meaningless.**

- [ ] Identify 5 real friend groups, 5+ people each. Criteria: they used to see each other regularly and now struggle to. **At least two should not include you** — your presence distorts the result, because you'll organise plans that would not otherwise happen.
- [ ] Get explicit buy-in from one "anchor" person per group who will do the initial onboarding
- [ ] Write the pilot ask — honest, short, no pitch: *"I'm building a thing to fix the scheduling problem we all have. Would your group try it for six weeks and tell me it's bad?"*
- [ ] Set up a weekly 15-minute call with each anchor
- [ ] Prepare the interview script. Ask about *last week's behaviour*, never about hypothetical intent
- [ ] **Decide your kill criteria in writing, now, before you have feelings about it.** W4 Signal Completion under 35% means redesign the mechanic, not add features. The M5 gate passes at 55%.
- [ ] **Close the 35–54% dead zone** (coherence audit **X-31**). The documents say what to do below 35% and what to do at 55%+, and say *nothing* about the twenty points in between — which, on five groups of seven, is a completely plausible place to land. An undefined outcome is not neutral: it is the range where you will be most tempted to reinterpret the result in the direction you want, on the day you are most invested and least objective. Write down now which of continue / extend the pilot / redesign each band means, and date it.

---

## 🔵 Ongoing — The measurements only you can make

The agent instruments the app. These require you to talk to people.

- [ ] **Home hang share.** Open Question 7. What fraction of plans happen at someone's apartment? This single number determines whether two of your four revenue streams exist. Count it manually during the pilot.
- [ ] **Concierge monetization test.** When a pilot group makes a plan needing a booking, make it for them by hand. Ask afterward whether they'd have used an in-app option. That gives you a real monetizable-action rate with zero engineering.
- [ ] **Booking partner reality check.** Actually email Resy, OpenTable, SevenRooms, DICE, Eventbrite, and Peek asking about affiliate or referral programs. Do this in month 2, not month 8. If they all say no, you learn early that Streams 3–4 don't exist and you build the business on Streams 1–2 instead.
- [ ] **Poke concentration.** Watch whether one person in each group is always the one being nudged. If so, the mechanic is creating a dynamic you don't want to power.

---

## ⚫ Deferred until after the retention gate

Do not do any of this before M5. It is all wasted effort if the mechanic fails.

- [ ] Stripe account and Connect onboarding
- [ ] Apple Developer Program ($99/yr)
- [ ] Google Play Console ($25 one-time)
- [ ] App store listings, screenshots, review submission
- [ ] Third-party penetration test (before any paid acquisition)
- [ ] Trademark filing
- [ ] Any fundraising material

---

## The honest time budget

Building alongside a job search, part-time:

| Phase | Your hours/week | Calendar time |
|---|---|---|
| Setup + approvals (weeks 1–2) | 8–10 | 2 weeks |
| Build supervision (weeks 3–12) | 10–15 | 10 weeks |
| Pilot operations (weeks 12–16) | 6–8 | 4 weeks |

**Approximately 150 hours to a real answer.** That is the honest number. The build itself is the smaller half — supervising an agent well, recruiting real groups, and running weekly interviews is where the time actually goes, and it is also where the value is.

One thing worth protecting: if the job search intensifies, **pause the build, not the pilot.** A working v1 in five groups' hands generating data is worth more than a more complete v1 nobody is using.
