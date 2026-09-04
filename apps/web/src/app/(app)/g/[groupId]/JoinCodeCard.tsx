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
          await navigator.clipboard.writeText(joinCode);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="text-sm text-accent underline"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
