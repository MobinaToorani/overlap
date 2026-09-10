/**
 * The one place that knows what an unnamed user looks like.
 *
 * FIX-1's signup trigger has to write *something* into
 * `app_user.display_name` (it is NOT NULL, and the only thing known at
 * signup is a phone number, which must never be the fallback — that was
 * X-12's defect). It writes a neutral placeholder, and this module is the
 * TypeScript half of that contract.
 *
 * Kept here rather than in @overlap/shared on purpose: the client is told
 * `needsDisplayName: boolean` by the server and never sees the string, so
 * the placeholder can change without a client deploy, and it can never be
 * rendered by accident.
 *
 * Recognising an unnamed user by value rather than by a
 * `display_name_set_at` column is a deliberate trade. The column would be
 * the more honest record of an affirmative act, but it is a migration and
 * two spec bumps for one consequence: someone who genuinely types the
 * placeholder as their name is asked for it once more. The literal is
 * pinned to the migration by a test (tests/services/profile.test.ts), so
 * the two cannot drift silently, which was the real risk.
 */
export const PLACEHOLDER_DISPLAY_NAME = 'New member';

/** True while nobody has ever named this person. */
export function needsDisplayName(displayName: string): boolean {
  return displayName.trim() === PLACEHOLDER_DISPLAY_NAME;
}
