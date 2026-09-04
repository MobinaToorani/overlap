'use client';

import type { NightOverlap } from '@overlap/shared';
import { dayOfMonth, weekdayName } from '@/lib/dateUtils';
import { copy, ordinal } from '@/lib/copy';
import { heatStep } from '@/lib/heat';

/**
 * The heatmap: days as columns, horizontally scrollable across the full
 * three-week horizon, current week first (master doc §7.3).
 *
 * Two rules from the spec govern how a night is drawn, and both exist
 * because of audit finding A2 — the heatmap must never let calendar
 * silence read as a friend saying yes:
 *
 *   1. Confirmed availability is solid saturation. Soft availability
 *      (`no_known_conflict`) renders hatched and is NEVER given a heat
 *      step — §8's tokens are explicit that `--soft-stroke` is a separate
 *      visual language, not a lighter shade of the same one.
 *   2. Every cell carries its confirmed count as text. §7.4: "heatmap
 *      intensity must never be conveyed by colour alone." The number is
 *      the accessible channel; the colour is decoration on top of it.
 */

function NightCell({ night }: { night: NightOverlap }) {
  const step = heatStep(night.confirmedCount);
  const hasSoft = night.softCount > 0;
  const hasLapsed = night.lapsedCount > 0;

  const label =
    `${weekdayName(night.date)} the ${ordinal(dayOfMonth(night.date))}: ` +
    `${night.confirmedCount} of ${night.totalMembers} confirmed free` +
    (hasLapsed ? `, ${night.lapsedCount} said yes earlier but not lately` : '') +
    (hasSoft ? `, ${night.softCount} no known conflict` : '') +
    (night.isBestNight ? ' — best night' : '');

  return (
    <div
      aria-label={label}
      className={`relative flex w-12 shrink-0 flex-col items-center gap-1 rounded-[var(--radius)] border px-1 py-2 ${
        night.isBestNight ? 'border-accent' : 'border-border'
      }`}
      style={{ backgroundColor: `var(--heat-${step})` }}
    >
      {/* Soft availability, hatched — deliberately a different visual
          language from saturation, never a heat step (A2). */}
      {hasSoft && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[var(--radius)] opacity-60"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, var(--soft-stroke) 0 2px, transparent 2px 6px)',
          }}
        />
      )}

      <span className="relative text-[10px] text-text-muted">
        {weekdayName(night.date).slice(0, 1)}
      </span>
      <span className="relative text-[11px] text-text-muted">{dayOfMonth(night.date)}</span>

      {/* The accessible channel: the count itself, always present. */}
      <span className="relative text-sm font-medium text-text">{night.confirmedCount}</span>

      {/* Lapsed reads as an outline, not a hatch: these people did answer,
          and the hatch means "never said anything". Distinct glyph, distinct
          claim. */}
      {hasLapsed && (
        <span className="relative text-[10px] text-vibe-lowkey">↺{night.lapsedCount}</span>
      )}
      {hasSoft && (
        <span className="relative text-[10px] text-text-muted">+{night.softCount}</span>
      )}
    </div>
  );
}

export function Heatmap({ nights }: { nights: NightOverlap[] }) {
  return (
    <div>
      <div
        className="flex gap-1 overflow-x-auto pb-2"
        role="group"
        aria-label="Availability over the next three weeks"
      >
        {nights.map((night) => (
          <NightCell key={night.date} night={night} />
        ))}
      </div>

      {/* Without this, the hatch and the saturation are just two textures.
          Confirmed vs soft has to be legible at a glance, not learned. */}
      <div className="mt-2 flex items-center gap-4 text-xs text-text-muted">
        <span className="flex items-center gap-1">
          <span
            aria-hidden
            className="inline-block h-3 w-3 rounded border border-border"
            style={{ backgroundColor: 'var(--heat-4)' }}
          />
          confirmed free
        </span>
        <span className="flex items-center gap-1">
          <span
            aria-hidden
            className="inline-block h-3 w-3 rounded border border-border"
            style={{
              backgroundImage:
                'repeating-linear-gradient(45deg, var(--soft-stroke) 0 2px, transparent 2px 6px)',
            }}
          />
          {/* The spec's own wording for this state (§9's softHint) rather
              than a paraphrase — copy.ts is where the voice lives. */}
          <span title={copy.softHint}>no conflict, not confirmed</span>
        </span>
        <span className="flex items-center gap-1">
          <span aria-hidden className="text-vibe-lowkey">↺</span>
          <span title={copy.lapsedHint}>said yes, needs re-confirming</span>
        </span>
      </div>
    </div>
  );
}
