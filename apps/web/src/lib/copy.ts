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
  // {day} is an ordinal ("17th") — see ordinal() below. engineering-spec.md
  // §9's literal string had a bare "{day}", but the master doc's own example
  // (§2.2, "Thursday the 17th — 5 of 7 free") reads the way a person would
  // actually say it, and that's the one Mobina confirmed.
  headline: '{weekday} the {day} — {n} of {m} free',
  headlineBand: '{weekday} the {day} — {n} of {m} free. {bandClause}',
  // §9 had one template with a "{band}" slot, which forced every band
  // through "The group is leaning ___" — fine for low-key, but "leaning
  // mixed" isn't a sentence anyone says. A clause per band lets each read
  // naturally; low-key keeps §9's exact wording.
  bandClauses: {
    expansive: 'The group is leaning expansive.',
    low_key: 'The group is leaning low-key.',
    mixed: 'The vibe is split.',
  },
  softHint: "No conflict on their calendar, but they haven't confirmed.",
  // Deliberately not softHint. They DID confirm; it aged out. Telling them
  // otherwise is the pessimistic half of the A2 failure.
  lapsedHint: 'They said yes to this night, but not in the last week.',
  belowThreshold: 'Overlap works once 3 of you are in. {n} to go.',
  noOverlap: "Nothing lines up in the next three weeks. That's useful to know too.",
  signalledCount: '{n} of {m} signalled',
  pokeSend: 'Nudge {name}',
  pokeReceived: '{sender} wants you in on {weekday}.',
  pokeMuted: '{name} is heads-down until {date}',
  nudge: '{weekday} is wide open for {n} of you. Want to start something?',
  // T25 / X-12. Asked at group create/join, not at login: signing in
  // alone gives nobody a reason to name themselves, and walking into a
  // room with six friends obviously does. Framed as what your friends
  // will see, because that is the actual reason it is being asked.
  namePrompt: 'What should your friends see?',
  nameLabel: 'Your name',
  namePlaceholder: 'First name is plenty',
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

/**
 * 17 → "17th", 21 → "21st". Needed because the headline says "the 17th",
 * and a naive `${day}th` would produce "the 21th" and "the 3th".
 *
 * The 11-13 carve-out is the whole trick: they end in 1/2/3 but still take
 * "th". Only days 1-31 reach this, but the %100 check costs nothing and
 * keeps the function correct for any number.
 */
export function ordinal(n: number): string {
  const teens = n % 100;
  if (teens >= 11 && teens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
