/**
 * All user-facing strings live here — engineering-spec.md §9. The voice is
 * the funniest organized person in the group chat: dry, warm, never a
 * brand. Do not inline copy elsewhere; import from here so a voice change
 * is a one-file edit.
 */
export const copy = {
  signalPush: "Signal time. How's your week looking?",
  signalPushSms: "Overlap: signal time. How's the next few weeks looking? {link}",
  vibeLabels: {
    down_for_anything: 'Down for anything',
    low_key: 'Low-key only',
    slammed: 'Slammed',
    broke: 'Broke this week',
    out_of_town: 'Out of town',
  },
  headline: '{weekday} the {day} — {n} of {m} free',
  headlineBand: '{weekday} the {day} — {n} of {m} free. The group is leaning {band}.',
  softHint: "No conflict on their calendar, but they haven't confirmed.",
  belowThreshold: 'Overlap works once 3 of you are in. {n} to go.',
  noOverlap: "Nothing lines up in the next three weeks. That's useful to know too.",
  signalledCount: '{n} of {m} signalled',
  pokeSend: 'Nudge {name}',
  pokeReceived: '{sender} wants you in on {weekday}.',
  pokeMuted: '{name} is heads-down until {date}',
  nudge: '{weekday} is wide open for {n} of you. Want to start something?',
  rsvpPrompt: 'Are you in?',
  postSignup: 'Want to see when this group is free next?',
  attendanceCheck: 'Did you make it?',
  calendarConsent: 'We only ever see when you’re busy — never what you’re doing.',
} as const;

/** `template("{a} of {b}", { a: 1, b: 2 })` → `"1 of 2"`. */
export function fillTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
