import { describe, expect, it } from 'vitest';
import { isoDateSchema, signalSubmitInputSchema, vibeSchema } from './schemas';

describe('vibeSchema', () => {
  it('accepts every vibe named in engineering-spec.md §9', () => {
    for (const vibe of [
      'down_for_anything',
      'low_key',
      'slammed',
      'broke',
      'out_of_town',
    ]) {
      expect(vibeSchema.safeParse(vibe).success).toBe(true);
    }
  });

  it('rejects an unknown vibe', () => {
    expect(vibeSchema.safeParse('vibing').success).toBe(false);
  });
});

describe('isoDateSchema', () => {
  it('accepts YYYY-MM-DD', () => {
    expect(isoDateSchema.safeParse('2026-09-03').success).toBe(true);
  });

  it('rejects anything else, including a full ISO datetime', () => {
    expect(isoDateSchema.safeParse('2026-09-03T00:00:00Z').success).toBe(false);
    expect(isoDateSchema.safeParse('09/03/2026').success).toBe(false);
  });
});

describe('signalSubmitInputSchema', () => {
  const base = {
    vibe: 'low_key' as const,
    nights: [{ date: '2026-09-03', state: 'confirmed_free' as const }],
  };

  it('accepts a minimal valid submission', () => {
    expect(signalSubmitInputSchema.safeParse(base).success).toBe(true);
  });

  it('rejects a client trying to write a night state only the worker may write (INV-1)', () => {
    const result = signalSubmitInputSchema.safeParse({
      ...base,
      nights: [{ date: '2026-09-03', state: 'no_known_conflict' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects more than 21 nights', () => {
    const nights = Array.from({ length: 22 }, () => ({
      date: '2026-09-03',
      state: 'confirmed_free' as const,
    }));
    expect(signalSubmitInputSchema.safeParse({ ...base, nights }).success).toBe(false);
  });

  it('rejects a note over 140 characters', () => {
    const result = signalSubmitInputSchema.safeParse({
      ...base,
      note: 'x'.repeat(141),
    });
    expect(result.success).toBe(false);
  });
});
