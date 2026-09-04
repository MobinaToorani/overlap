'use client';

import { useParams } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { copy, fillTemplate } from '@/lib/copy';
import { JoinCodeCard } from './JoinCodeCard';

// Same numeric floor as overlap.ts's LIVE_THRESHOLD, but a different
// metric: that one gates on SIGNALLED members (needs T6), this one gates
// on plain membership, since a group can exist here with zero Signals
// ever submitted. Not importing one constant for both — conflating "3
// people joined" with "3 people signalled this week" would be exactly the
// kind of blurred distinction the spec is careful about elsewhere.
const MEMBERS_NEEDED_FOR_OVERLAP = 3;

export default function GroupHomePage() {
  const params = useParams<{ groupId: string }>();
  const groupQuery = trpc.group.get.useQuery({ groupId: params.groupId });

  if (groupQuery.isLoading) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6">
        <p className="text-text-muted">Loading…</p>
      </main>
    );
  }

  if (groupQuery.error) {
    const code = groupQuery.error.data?.code;
    const message =
      code === 'NOT_FOUND'
        ? "This group doesn't exist, or was deleted."
        : code === 'FORBIDDEN'
          ? "You're not a member of this group."
          : groupQuery.error.message;
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6">
        <p className="text-red-400">{message}</p>
      </main>
    );
  }

  const group = groupQuery.data;
  if (!group) return null; // isLoading/error already handled above; satisfies TS narrowing below
  const belowThreshold = group.members.length < MEMBERS_NEEDED_FOR_OVERLAP;

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="font-display text-3xl text-text">{group.name}</h1>
        <p className="text-text-muted">
          {group.members.length} member{group.members.length === 1 ? '' : 's'}
        </p>
      </div>

      {/* The heatmap owns this space once T7 ships (engineering-spec.md
          §7.3) — this is the shell T4 asked for, not a stand-in heatmap. */}
      <div className="rounded-[var(--radius)] border border-border bg-surface px-4 py-6 text-center text-text-muted">
        {belowThreshold
          ? fillTemplate(copy.belowThreshold, {
              n: MEMBERS_NEEDED_FOR_OVERLAP - group.members.length,
            })
          : 'The heatmap and weekly Signal are coming in a future update.'}
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-text-muted">Invite people</h2>
        <JoinCodeCard joinCode={group.joinCode} />
      </div>

      <div>
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
    </main>
  );
}
