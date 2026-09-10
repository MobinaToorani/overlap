/**
 * The placeholder that marks an unnamed user is written by SQL (FIX-1's
 * signup trigger) and read by TypeScript (`needsDisplayName`). Nothing
 * about the language boundary makes those two agree, so this pins them:
 * if the trigger's literal is ever edited, the first-run name step would
 * otherwise stop firing silently and a pilot group would fill up with
 * unnamed members again — X-12 exactly, minus the audit that caught it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLACEHOLDER_DISPLAY_NAME, needsDisplayName } from '@/server/services/profile';

describe('the unnamed-user placeholder', () => {
  it('is the literal FIX-1s signup trigger actually inserts', () => {
    const sql = readFileSync(
      join(__dirname, '../../src/server/db/sql/0002_create_app_user_on_signup.sql'),
      'utf8',
    );
    expect(sql).toContain(`'${PLACEHOLDER_DISPLAY_NAME}'`);
  });

  it('never leaks the phone number as a name (X-12s original defect)', () => {
    const sql = readFileSync(
      join(__dirname, '../../src/server/db/sql/0002_create_app_user_on_signup.sql'),
      'utf8',
    );
    // The INSERT's VALUES list, not the file: the comments above it discuss
    // NEW.phone at length, and rightly so.
    const values = sql.slice(sql.indexOf('INSERT INTO app_user'), sql.indexOf('ON CONFLICT'));
    expect(values).toContain('NEW.phone');   // phone_e164, which is correct
    expect(values).toContain(PLACEHOLDER_DISPLAY_NAME);
    // display_name is the third column, and it is the constant.
    expect(values).toMatch(/VALUES\s*\(NEW\.id,\s*NEW\.phone,\s*'New member'\)/);
  });
});

describe('needsDisplayName', () => {
  it('is true only for the untouched placeholder', () => {
    expect(needsDisplayName(PLACEHOLDER_DISPLAY_NAME)).toBe(true);
    expect(needsDisplayName(`  ${PLACEHOLDER_DISPLAY_NAME}  `)).toBe(true); // whitespace is not a name
    expect(needsDisplayName('Mobina')).toBe(false);
    expect(needsDisplayName('New members')).toBe(false);
  });
});
