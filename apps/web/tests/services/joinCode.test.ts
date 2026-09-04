import { describe, expect, it } from 'vitest';
import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH, generateJoinCode } from '@/server/services/joinCode';

describe('JOIN_CODE_ALPHABET', () => {
  it('is exactly 32 characters (FIX-12)', () => {
    expect(JOIN_CODE_ALPHABET).toHaveLength(32);
  });

  it('excludes the ambiguous characters 0, O, 1, I', () => {
    for (const forbidden of ['0', 'O', '1', 'I']) {
      expect(JOIN_CODE_ALPHABET).not.toContain(forbidden);
    }
  });

  it('has no duplicate characters', () => {
    expect(new Set(JOIN_CODE_ALPHABET).size).toBe(JOIN_CODE_ALPHABET.length);
  });
});

describe('generateJoinCode', () => {
  it('produces a code of the configured length (>=10, FIX-12)', () => {
    expect(generateJoinCode()).toHaveLength(JOIN_CODE_LENGTH);
    expect(JOIN_CODE_LENGTH).toBeGreaterThanOrEqual(10);
  });

  it('only ever uses characters from the alphabet', () => {
    const code = generateJoinCode();
    for (const char of code) {
      expect(JOIN_CODE_ALPHABET).toContain(char);
    }
  });

  it('does not repeat across many calls (statistical, not a uniqueness guarantee)', () => {
    const codes = new Set(Array.from({ length: 1000 }, () => generateJoinCode()));
    expect(codes.size).toBe(1000);
  });
});
