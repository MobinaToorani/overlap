import { describe, expect, it } from 'vitest';
import {
  isoDateSchema,
  phoneE164Schema,
  requestOtpInputSchema,
  signalSubmitInputSchema,
  verifyOtpInputSchema,
  vibeSchema,
} from './schemas';

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

describe('phoneE164Schema', () => {
  it('accepts a well-formed E.164 number', () => {
    expect(phoneE164Schema.safeParse('+15195551234').success).toBe(true);
  });

  it('rejects numbers missing the country code, with punctuation, or without a leading +', () => {
    for (const bad of ['5195551234', '+1 519 555 1234', '+1-519-555-1234', '0195551234']) {
      expect(phoneE164Schema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('requestOtpInputSchema / verifyOtpInputSchema', () => {
  it('requestOtp accepts a valid phone', () => {
    expect(requestOtpInputSchema.safeParse({ phone: '+15195551234' }).success).toBe(true);
  });

  it('verifyOtp requires exactly 6 digits', () => {
    expect(
      verifyOtpInputSchema.safeParse({ phone: '+15195551234', code: '123456' }).success,
    ).toBe(true);
    for (const bad of ['12345', '1234567', 'abcdef']) {
      expect(verifyOtpInputSchema.safeParse({ phone: '+15195551234', code: bad }).success).toBe(
        false,
      );
    }
  });
});
