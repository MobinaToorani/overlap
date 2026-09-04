'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { VIBES, type Vibe } from '@overlap/shared';
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

  const [vibe, setVibe] = useState<Vibe | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);

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
  }, [existing]);

  const submit = trpc.signal.submit.useMutation({
    onSuccess: async () => {
      track('signal_completed', {
        seconds_to_complete: (Date.now() - openedAt.current) / 1000,
        nights_confirmed: selected.size,
        horizon_weeks_touched: countWeeksTouched(current.data?.weekStartDate, selected),
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
                  return (
                    <button
                      key={date}
                      type="button"
                      disabled={isPast}
                      aria-pressed={isOn}
                      aria-label={`${weekdayName(date)} the ${dayOfMonth(date)}`}
                      onClick={() => toggleNight(date)}
                      className={`flex flex-col items-center rounded-[var(--radius)] border py-2 text-xs ${
                        isPast
                          ? 'border-transparent text-text-muted opacity-30'
                          : isOn
                            ? 'border-accent bg-accent text-white'
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
            // Only tapped nights are sent, each as confirmed_free. An
            // untapped night is an absence of information, not an assertion
            // of a conflict — sending it as 'blocked' would claim something
            // the user never said.
            nights: [...selected].map((date) => ({ date, state: 'confirmed_free' as const })),
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
