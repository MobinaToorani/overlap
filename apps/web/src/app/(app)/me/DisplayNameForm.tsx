'use client';

import { useState } from 'react';
import { copy } from '@/lib/copy';
import { browserTimeZone } from '@/lib/dateUtils';
import { trpc } from '@/lib/trpc/client';

/**
 * The standing way to set or change a name, as opposed to `/g`'s one-time
 * first-run step. Both exist on purpose: X-12 noted that
 * `me.updateProfile` was "the only way to set one — reachable through a
 * /me route that no ticket builds", and a first-run step alone would
 * leave anyone who already joined a group stuck as "New member" forever.
 *
 * The rest of §7.2's Me screen — calendar connections, notification
 * prefs, privacy controls — belongs to T9, T15 and T22.
 */
export function DisplayNameForm() {
  const utils = trpc.useUtils();
  const profile = trpc.me.get.useQuery();
  const [draft, setDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const updateProfile = trpc.me.updateProfile.useMutation({
    onSuccess: (next) => {
      utils.me.get.setData(undefined, next);
      setDraft(null);
      setSaved(true);
    },
  });

  if (!profile.data) {
    return <p className="text-text-muted">{profile.isLoading ? 'Loading…' : null}</p>;
  }

  // An unnamed user sees an empty field rather than the placeholder text —
  // being asked to edit "New member" reads as a name they were given.
  const current = profile.data.needsDisplayName ? '' : profile.data.displayName;
  const value = draft ?? current;

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const timezone = browserTimeZone();
        updateProfile.mutate({ displayName: value, ...(timezone ? { timezone } : {}) });
      }}
    >
      <label className="text-sm text-text-muted" htmlFor="displayName">
        {copy.nameLabel}
      </label>
      <input
        id="displayName"
        required
        maxLength={40}
        autoComplete="given-name"
        value={value}
        onChange={(e) => {
          setDraft(e.target.value);
          setSaved(false);
        }}
        placeholder={copy.namePlaceholder}
        className="rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-text"
      />
      <p className="text-xs text-text-muted">{copy.namePrompt}</p>
      <button
        type="submit"
        disabled={updateProfile.isPending || value === current}
        className="rounded-[var(--radius)] bg-accent px-3 py-2 text-white disabled:opacity-50"
      >
        {updateProfile.isPending ? 'Saving…' : 'Save'}
      </button>
      {updateProfile.error && (
        <p className="text-sm text-red-400">{updateProfile.error.message}</p>
      )}
      {saved && !updateProfile.error && <p className="text-sm text-text-muted">Saved.</p>}
    </form>
  );
}
