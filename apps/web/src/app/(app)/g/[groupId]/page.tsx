'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Heatmap } from '@/components/heatmap/Heatmap';
import { copy, fillTemplate } from '@/lib/copy';
import { trpc } from '@/lib/trpc/client';
import { JoinCodeCard } from './JoinCodeCard';

// A group is "live" at 3+ members *with current signals* (master doc §2.5,
// and Sprint 2's DoD: "Below 3 signalled members, group shows
// belowThreshold copy, not a broken grid"). Note this counts signals, not
// memberships — an earlier version of this screen keyed off member count,
// which is a different and wronger thing: five people who joined and never
// signalled is still an empty heatmap.
const SIGNALLED_NEEDED = 3;

export default function GroupHomePage() {
  const params = useParams<{ groupId: string }>();
  const groupQuery = trpc.group.get.useQuery({ groupId: params.groupId });
  const overlapQuery = trpc.group.overlap.useQuery({ groupId: params.groupId });

  if (groupQuery.isLoading) {
    return <Centered>Loading…</Centered>;
  }

  if (groupQuery.error) {
    const code = groupQuery.error.data?.code;
    return (
      <Centered tone="error">
        {code === 'NOT_FOUND'
          ? "This group doesn't exist, or was deleted."
          : code === 'FORBIDDEN'
            ? "You're not a member of this group."
            : groupQuery.error.message}
      </Centered>
    );
  }

  const group = groupQuery.data;
  if (!group) return null;

  const overlap = overlapQuery.data;
  const isLive = overlap?.isLive ?? false;

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-6 py-12 pb-24">
      <div>
        <h1 className="font-display text-3xl text-text">{group.name}</h1>
        {overlap && (
          <p className="text-text-muted">
            {fillTemplate(copy.signalledCount, {
              n: overlap.signalledCount,
              m: overlap.memberCount,
            })}
          </p>
        )}
      </div>

      {/* The heatmap owns the top of the screen (master doc §7.3). Below the
          liveness threshold it is replaced entirely rather than rendered
          empty — an all-zero grid would be the "broken grid" Sprint 2's DoD
          rules out, and would also imply the group is unavailable rather
          than merely quiet. */}
      <section>
        {overlapQuery.isLoading && <p className="text-text-muted">Loading availability…</p>}

        {overlap && !isLive && (
          <div className="rounded-[var(--radius)] border border-border bg-surface px-4 py-6 text-center text-text-muted">
            {fillTemplate(copy.belowThreshold, {
              n: Math.max(SIGNALLED_NEEDED - overlap.signalledCount, 0),
            })}
          </div>
        )}

        {overlap && isLive && (
          <>
            {/* The single best night, in plain language, above the grid —
                built from confirmed members only (INV-2). */}
            <p className="mb-3 font-display text-xl text-text">
              {overlap.headline ?? copy.noOverlap}
            </p>
            <Heatmap nights={overlap.nights} />
          </>
        )}
      </section>

      <div>
        <h2 className="mb-2 text-sm font-medium text-text-muted">Invite people</h2>
        <JoinCodeCard joinCode={group.joinCode} />
      </div>

      <div>
        {/* A count, never a list of who hasn't signalled (master doc §7.3,
            and §2.4's "no shaming surface"). */}
        <h2 className="mb-2 text-sm font-medium text-text-muted">Members</h2>
        <ul className="flex flex-col gap-1">
          {group.members.map((member) => (
            <li
              key={member.userId}
              className="flex items-center justify-between rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-text"
            >
              <span>{member.displayName}</span>
              {member.role === 'admin' && <span className="text-xs text-text-muted">admin</span>}
            </li>
          ))}
        </ul>
      </div>

      {/* §7.3 specifies a persistent "Start something" button in this slot,
          but that means plan creation, which is T11. Rather than park a
          dead button here, the slot holds the Signal CTA until then — the
          action that actually exists, and the one the group needs before a
          heatmap can say anything. Swap it back at T11. */}
      <Link
        href="/signal"
        className="fixed bottom-6 right-6 rounded-[var(--radius)] bg-accent px-4 py-3 text-white shadow-lg"
      >
        {overlap?.signalledCount ? 'Update my signal' : 'Send my signal'}
      </Link>
    </main>
  );
}

function Centered({ children, tone }: { children: React.ReactNode; tone?: 'error' }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6">
      <p className={tone === 'error' ? 'text-red-400' : 'text-text-muted'}>{children}</p>
    </main>
  );
}
