import { randomInt } from 'node:crypto';

/**
 * FIX-12 (engineering-spec.md §3): ">=10 chars from a 32-char unambiguous
 * alphabet (no 0/O/1/I). Never sequential."
 *
 * The spec doesn't name the other 31 characters, so this is a decision
 * made here: digits 2-9 (8) plus A-Z minus I and O (24) = 32, chosen
 * because it's the standard "avoid characters people misread or mistype"
 * set (no 0/O or 1/I confusion, no lowercase/uppercase ambiguity since
 * codes are generated uppercase-only). packages/shared/src/schemas.ts's
 * joinCodeSchema regex must stay in sync with this string if it ever
 * changes.
 *
 * "Never sequential" is satisfied by construction: every character comes
 * from a cryptographically secure random source (node:crypto's randomInt,
 * not Math.random()), never a counter.
 */
export const JOIN_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const JOIN_CODE_LENGTH = 12; // comfortably above the >=10 floor

export function generateJoinCode(): string {
  let code = '';
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
  }
  return code;
}
