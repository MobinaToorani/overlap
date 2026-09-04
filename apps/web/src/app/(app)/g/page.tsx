'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';

type Mode = 'create' | 'join' | null;

export default function GroupsIndexPage() {
  const router = useRouter();
  const groupsQuery = trpc.group.listMine.useQuery();
  const [mode, setMode] = useState<Mode>(null);
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState('');

  const create = trpc.group.create.useMutation({
    onSuccess: (group) => router.push(`/g/${group.id}`),
  });
  const join = trpc.group.joinByCode.useMutation({
    onSuccess: (group) => router.push(`/g/${group.id}`),
  });

  const error = create.error?.message ?? join.error?.message;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
      <h1 className="font-display text-3xl text-text">Your groups</h1>

      {groupsQuery.isLoading && <p className="text-text-muted">Loading…</p>}

      {groupsQuery.data && groupsQuery.data.length > 0 && (
        <ul className="flex flex-col gap-2">
          {groupsQuery.data.map((group) => (
            <li key={group.id}>
              <Link
                href={`/g/${group.id}`}
                className="block rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-text hover:bg-surface-raised"
              >
                {group.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {groupsQuery.data && groupsQuery.data.length === 0 && mode === null && (
        <p className="text-text-muted">
          No groups yet. Overlap is group-seeded — create one, or join with a code someone sent
          you.
        </p>
      )}

      {mode === null ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode('create')}
            className="flex-1 rounded-[var(--radius)] bg-accent px-3 py-2 text-white"
          >
            Create a group
          </button>
          <button
            type="button"
            onClick={() => setMode('join')}
            className="flex-1 rounded-[var(--radius)] border border-border px-3 py-2 text-text"
          >
            Join with a code
          </button>
        </div>
      ) : mode === 'create' ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate({ name });
          }}
        >
          <label className="text-sm text-text-muted" htmlFor="name">
            Group name
          </label>
          <input
            id="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-text"
          />
          <button
            type="submit"
            disabled={create.isPending}
            className="rounded-[var(--radius)] bg-accent px-3 py-2 text-white disabled:opacity-50"
          >
            {create.isPending ? 'Creating…' : 'Create'}
          </button>
          <button type="button" onClick={() => setMode(null)} className="text-sm text-text-muted underline">
            Back
          </button>
        </form>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            join.mutate({ joinCode });
          }}
        >
          <label className="text-sm text-text-muted" htmlFor="joinCode">
            Join code
          </label>
          <input
            id="joinCode"
            required
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="e.g. 23456789ABCD"
            className="rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-text"
          />
          <button
            type="submit"
            disabled={join.isPending}
            className="rounded-[var(--radius)] bg-accent px-3 py-2 text-white disabled:opacity-50"
          >
            {join.isPending ? 'Joining…' : 'Join'}
          </button>
          <button type="button" onClick={() => setMode(null)} className="text-sm text-text-muted underline">
            Back
          </button>
        </form>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </main>
  );
}
