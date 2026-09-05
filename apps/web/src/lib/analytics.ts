'use client';

/**
 * The single client-side analytics seam. PostHog itself is T18 — this
 * exists now because T6 is asked to "instrument seconds_to_complete", and
 * measuring it is useless if there's nowhere to send it.
 *
 * Event names and payloads mirror engineering-spec.md §11 exactly, so T18
 * is a matter of implementing `track()` against PostHog rather than
 * revisiting every call site. Until then this deliberately no-ops in
 * production rather than buffering: dropping pre-T18 analytics is fine,
 * silently accumulating events in memory would not be.
 *
 * Why the client and not the server: seconds_to_complete can only be
 * measured where the modal opens, and several other §11 events
 * (heatmap_viewed, invite_viewed) are inherently client-side too — so this
 * is where that seam belongs. Keeping the timing out of signal.submit's
 * input also keeps that procedure's signature exactly as §5 specifies.
 */

/** Payloads for the §11 events emitted so far. Extend as tickets add them. */
export type AnalyticsEvent = {
  signal_completed: {
    seconds_to_complete: number;
    nights_confirmed: number;
    horizon_weeks_touched: number;
    /** How many of the confirmed nights were pre-filled and left standing
     * rather than tapped (A1 / X-19). Beyond §11's original three fields:
     * the three-week horizon is only affordable if pre-fill is accurate,
     * and without this the effect is invisible — a correct pre-fill and a
     * user who taps everything by hand produce identical numbers. */
    nights_prefilled: number;
  };
};

export function track<K extends keyof AnalyticsEvent>(
  event: K,
  properties: AnalyticsEvent[K],
): void {
  if (process.env.NODE_ENV === 'development') {
    console.debug('[analytics]', event, properties);
  }
  // T18: PostHog capture goes here. §11 also requires that Signal
  // Completion is always reported against Signal Delivery Rate — that
  // pairing is a dashboard concern, but the events feeding it start here.
}
