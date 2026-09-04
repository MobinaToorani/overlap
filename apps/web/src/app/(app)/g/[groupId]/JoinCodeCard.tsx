'use client';

import { useState } from 'react';

export function JoinCodeCard({ joinCode }: { joinCode: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-center justify-between rounded-[var(--radius)] border border-border bg-surface px-3 py-2">
      <span className="font-mono text-lg tracking-widest text-text">{joinCode}</span>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(joinCode);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            // Clipboard access can be denied (permissions, insecure
            // context, some in-app browsers) — the code is still visible
            // and selectable in the span above, so this fails quietly
            // rather than throwing an unhandled rejection.
          }
        }}
        className="text-sm text-accent underline"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
