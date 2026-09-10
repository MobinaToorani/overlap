'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { copy } from '@/lib/copy';
import { browserTimeZone } from '@/lib/dateUtils';
import { trpc } from '@/lib/trpc/client';

type Mode = 'create' | 'join' | null;

export default function GroupsIndexPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const groupsQuery = trpc.group.listMine.useQuery();
  // T25 / X-12: the first-run name step. Folded into these two forms
  // rather than given a screen of its own, because a group is the first
  // place a name is needed and an extra screen between "join" and "in"
  // is a step nobody asked for.
  const profileQuery = trpc.me.get.useQuery();
  const [mode, setMode] = useState<Mode>(null);
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [joinCode, setJoinCode] = useState('');

  const needsName = profileQuery.data?.needsDisplayName ?? false;

  const updateProfile = trpc.me.updateProfile.useMutation({
    // Keep the cached profile in step, so a name saved before a failed
    // create/join isn't asked for a second time.
    onSuccess: (profile) => utils.me.get.setData(undefined, profile),
  });
  const create = trpc.group.create.useMutation({
    onSuccess: (group) => router.push(`/g/${group.id}`),
  });
  const join = trpc.group.joinByCode.useMutation({
    onSuccess: (group) => router.push(`/g/${group.id}`),
  });

  // Scoped to the currently visible form, not just "whichever mutation
  // last had an error" — switching from create to join without
  // resubmitting create shouldn't leave create's stale error message
  // showing under the join form. The name save shares whichever form it
  // was submitted from, so its error belongs to both.
  const error =
    updateProfile.error?.message ??
    (mode === 'create' ? create.error?.message : mode === 'join' ? join.error?.message : undefined);

  const pending = updateProfile.isPending || create.isPending || join.isPending;

  // The name save is shared by both forms, so unlike create/join its error
  // can't be scoped by `mode` — it has to be cleared when the form the
  // user is looking at changes.
  function switchMode(next: Mode) {
    updateProfile.reset();
    setMode(next);
  }

  /**
   * Name first, then the group action. The order matters on partial
   * failure: a saved name with no group is a harmless, correct state the
   * user keeps, whereas a group joined under "New member" is exactly the
   * outcome X-12 exists to prevent.
   *
   * The browser's timezone rides along on the same submit — it costs no
   * tap and is the only chance to replace the schema's Toronto default
   * with something true before the first Signal is computed.
   */
  async function withName(action: () => void) {
    if (needsName) {
      const timezone = browserTimeZone();
      try {
        await updateProfile.mutateAsync({
          displayName,
          ...(timezone ? { timezone } : {}),
        });
      } catch {
        return; // surfaced through updateProfile.error below
      }
    }
    action();
  }

  const nameField = needsName ? (
    <>
      <label className="text-sm text-text-muted" htmlFor="displayName">
        {copy.nameLabel}
      </label>
      <input
        id="displayName"
        required
        maxLength={40}
        autoComplete="given-name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        placeholder={copy.namePlaceholder}
        className="rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-text"
      />
      <p className="-mt-1 text-xs text-text-muted">{copy.namePrompt}</p>
    </>
  ) : null;

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
            onClick={() => switchMode('create')}
            className="flex-1 rounded-[var(--radius)] bg-accent px-3 py-2 text-white"
          >
            Create a group
          </button>
          <button
            type="button"
            onClick={() => switchMode('join')}
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
            void withName(() => create.mutate({ name }));
          }}
        >
          {nameField}
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
            disabled={pending}
            className="rounded-[var(--radius)] bg-accent px-3 py-2 text-white disabled:opacity-50"
          >
            {create.isPending ? 'Creating…' : 'Create'}
          </button>
          <button type="button" onClick={() => switchMode(null)} className="text-sm text-text-muted underline">
            Back
          </button>
        </form>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void withName(() => join.mutate({ joinCode }));
          }}
        >
          {nameField}
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
            disabled={pending}
            className="rounded-[var(--radius)] bg-accent px-3 py-2 text-white disabled:opacity-50"
          >
            {join.isPending ? 'Joining…' : 'Join'}
          </button>
          <button type="button" onClick={() => switchMode(null)} className="text-sm text-text-muted underline">
            Back
          </button>
        </form>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </main>
  );
}
