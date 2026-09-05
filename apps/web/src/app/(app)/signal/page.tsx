'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { VIBES, type DraftSource, type Vibe } from '@overlap/shared';
import { track } from '@/lib/analytics';
import { copy } from '@/lib/copy';
import { trpc } from '@/lib/trpc/client';
import { buildWeeks, countWeeksTouched } from '@/lib/signalGrid';
import { dayOfMonth, weekdayName } from '@/lib/dateUtils';

/** Sun…Sat initials for the compact rows. */
const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function SignalForm() {
  const router = useRouter();
  // Which group's heatmap to reveal afterwards. The Signal itself is
  // global (master doc §2.2, Rule 3) — this only decides where the payoff
  // is shown, not what gets submitted.
  const searchParams = useSearchParams();
  const fromGroupId = searchParams.get('from');
  const myGroups = trpc.group.listMine.useQuery(undefined, { enabled: !fromGroupId });
  const current = trpc.signal.getCurrent.useQuery();
  const utils = trpc.useUtils();

  // Pre-fill (A1 / X-19). Fetched alongside getCurrent rather than after it
  // — tRPC batches the two into one request, so this costs no extra round
  // trip on the screen with the tightest latency budget in the product.
  const draft = trpc.signal.getDraft.useQuery();

  const [vibe, setVibe] = useState<Vibe | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  // Nights the *app* proposed and the person hasn't touched yet. Kept apart
  // from `selected` so the grid can show what is being suggested on their
  // behalf rather than presenting it as something they said. Tapping a night
  // removes it from here: once they've touched it, it's their answer.
  const [proposed, setProposed] = useState<Map<string, DraftSource>>(new Map());

  // The ten-second budget is the product (master doc §2.3b), so the clock
  // starts when the screen becomes usable, not when the mutation fires.
  const openedAt = useRef<number>(Date.now());

  // Re-opening the Signal mid-week should show what you already submitted,
  // not a blank slate that silently overwrites it on submit.
  const existing = current.data?.signal;
  useEffect(() => {
    if (!existing) return;
    setVibe(existing.vibe);
    setNote(existing.note ?? '');
    if (existing.note) setNoteOpen(true);
    setSelected(
      new Set(existing.nights.filter((n) => n.state === 'confirmed_free').map((n) => n.date)),
    );
    setProposed(new Map()); // a real submission outranks any proposal
  }, [existing]);

  // Pre-fill only ever applies to a week with no signal yet. Once someone
  // has submitted, what they submitted is the truth for that week and the
  // app has no business proposing anything over the top of it.
  const draftNights = draft.data?.nights;
  useEffect(() => {
    if (existing || !draftNights || draftNights.length === 0) return;
    setProposed(new Map(draftNights.map((n) => [n.date, n.source])));
  }, [existing, draftNights]);

  /** Everything that will be submitted as confirmed_free: what they tapped,
   * plus anything still proposed that they saw and chose not to remove.
   * Declared above the early returns — it's a hook. */
  const confirming = useMemo(() => {
    const all = new Set(selected);
    for (const date of proposed.keys()) all.add(date);
    return all;
  }, [selected, proposed]);

  const submit = trpc.signal.submit.useMutation({
    onSuccess: async () => {
      track('signal_completed', {
        seconds_to_complete: (Date.now() - openedAt.current) / 1000,
        // What was actually submitted, not just what was tapped — otherwise
        // pre-fill would show up in the data as people confirming fewer
        // nights, which is the opposite of what it does.
        nights_confirmed: confirming.size,
        horizon_weeks_touched: countWeeksTouched(current.data?.weekStartDate, confirming),
        // Whether pre-fill is earning its place: how many of those nights
        // the person never had to tap. A1's correction claims weeks two and
        // three cost about one tap; this is the number that shows it.
        nights_prefilled: proposed.size,
      });
      await utils.signal.getCurrent.invalidate();
      // Submitting must reveal the heatmap — that reveal IS the reward
      // that ends the ritual (master doc §2.3c: "a ritual that ends in
      // 'thanks, saved' is dead within three weeks"; §7.3 calls it the
      // most polished moment in the app). So land on a group home, not the
      // group list: prefer the group the user came from, otherwise their
      // first one, and only fall back to the list if they have none.
      await utils.group.overlap.invalidate();
      const destination = fromGroupId ?? myGroups.data?.[0]?.id;
      router.push(destination ? `/g/${destination}` : '/g');
    },
  });

  const weekStartDate = current.data?.weekStartDate;
  const weeks = useMemo(() => (weekStartDate ? buildWeeks(weekStartDate) : []), [weekStartDate]);
  const todayIso = useMemo(() => localToday(), []);

  if (current.isLoading) {
    return <Centered>Loading…</Centered>;
  }
  if (current.error) {
    return <Centered tone="error">{current.error.message}</Centered>;
  }

  function toggleNight(date: string) {
    // A proposed night becomes a real one on first touch. Tapping it once
    // says "yes, still true" (it moves into `selected`); tapping again
    // clears it. Either way the app stops speaking for them about it.
    const wasProposed = proposed.has(date);
    if (wasProposed) {
      setProposed((prev) => {
        const next = new Map(prev);
        next.delete(date);
        return next;
      });
      setSelected((prev) => new Set(prev).add(date));
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-10">
      <h1 className="font-display text-3xl text-text">{copy.signalPush}</h1>

      {/* 1 — Vibe. Five large tap targets, no keyboard. */}
      <section>
        <h2 className="mb-2 text-sm font-medium text-text-muted">How&apos;s your week?</h2>
        <div className="flex flex-col gap-2">
          {VIBES.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={vibe === v}
              onClick={() => setVibe(v)}
              className={`rounded-[var(--radius)] border px-4 py-3 text-left text-text ${
                vibe === v ? 'border-accent bg-surface-raised' : 'border-border bg-surface'
              }`}
            >
              {copy.vibeLabels[v]}
            </button>
          ))}
        </div>
      </section>

      {/* 2 — Nights, across the rolling three-week horizon. */}
      <section>
        <h2 className="mb-2 text-sm font-medium text-text-muted">
          Which nights could you do something?
        </h2>
        {/* Pre-filled nights are explained rather than silently present.
            Selecting nights on someone's behalf without saying so is how a
            product ends up asserting things nobody agreed to. */}
        {proposed.size > 0 && (
          <p className="mb-2 text-xs text-text-muted">
            {proposed.size} {proposed.size === 1 ? 'night is' : 'nights are'} carried over from
            your last signal. Tap to confirm or clear — they&apos;ll be sent as-is if you
            leave them.
          </p>
        )}
        <div className="flex flex-col gap-3">
          {weeks.map((week, weekIndex) => (
            <div key={week[0]}>
              <p className="mb-1 text-xs text-text-muted">
                {weekIndex === 0 ? 'This week' : weekIndex === 1 ? 'Next week' : 'The week after'}
              </p>
              <div className="grid grid-cols-7 gap-1">
                {week.map((date, dayIndex) => {
                  const isPast = date < todayIso;
                  const isOn = selected.has(date);
                  const isProposed = proposed.has(date);
                  return (
                    <button
                      key={date}
                      type="button"
                      disabled={isPast}
                      aria-pressed={isOn || isProposed}
                      aria-label={
                        `${weekdayName(date)} the ${dayOfMonth(date)}` +
                        (isProposed ? ' — carried over from your last signal, tap to confirm' : '')
                      }
                      onClick={() => toggleNight(date)}
                      className={`flex flex-col items-center rounded-[var(--radius)] border py-2 text-xs ${
                        isPast
                          ? 'border-transparent text-text-muted opacity-30'
                          : isOn
                            ? 'border-accent bg-accent text-white'
                            : isProposed
                              ? // Outlined, not filled: visibly a proposal
                                // rather than something they said. A2's
                                // principle applied to the input side —
                                // the app may suggest, but it must not
                                // look like the person already agreed.
                                'border-accent border-dashed bg-surface text-accent'
                              : 'border-border bg-surface text-text'
                      }`}
                    >
                      <span>{DAY_INITIALS[dayIndex]}</span>
                      <span className="text-sm">{dayOfMonth(date)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3 — Optional one-liner. Collapsed by default: the core path must
          never require a keyboard (T6), so typing is opt-in. */}
      <section>
        {noteOpen ? (
          <>
            <label className="mb-1 block text-sm text-text-muted" htmlFor="note">
              Anything to add?
            </label>
            <input
              id="note"
              value={note}
              maxLength={140}
              onChange={(e) => setNote(e.target.value)}
              placeholder="free after 8 most nights, car is dead"
              className="w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-text"
            />
          </>
        ) : (
          <button
            type="button"
            onClick={() => setNoteOpen(true)}
            className="text-sm text-text-muted underline"
          >
            Add a one-liner (optional)
          </button>
        )}
      </section>

      <button
        type="button"
        disabled={!vibe || submit.isPending}
        onClick={() =>
          vibe &&
          submit.mutate({
            vibe,
            // Tapped nights plus any pre-filled night they left standing,
            // each as confirmed_free. Leaving a proposal in place and
            // pressing submit is an affirmative act — the person saw the
            // grid, saw what was marked, and agreed to it — which is the
            // human confirmation INV-1 and A2 require. An *untapped* night
            // is still an absence of information, not an assertion of a
            // conflict: sending it as 'blocked' would claim something the
            // user never said.
            nights: [...confirming].map((date) => ({ date, state: 'confirmed_free' as const })),
            ...(note.trim() ? { note: note.trim() } : {}),
          })
        }
        className="rounded-[var(--radius)] bg-accent px-4 py-3 text-white disabled:opacity-50"
      >
        {submit.isPending ? 'Sending…' : existing ? 'Update my signal' : 'Send my signal'}
      </button>

      {submit.error && <p className="text-sm text-red-400">{submit.error.message}</p>}
    </main>
  );
}

function Centered({ children, tone }: { children: React.ReactNode; tone?: 'error' }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <p className={tone === 'error' ? 'text-red-400' : 'text-text-muted'}>{children}</p>
    </main>
  );
}

/** Today's calendar date in the browser's own timezone, used only to grey
 * out nights that have already passed. The authoritative week anchor still
 * comes from the server. */
function localToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export default function SignalPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<Centered>Loading…</Centered>}>
      <SignalForm />
    </Suspense>
  );
}
