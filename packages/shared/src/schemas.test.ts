import { describe, expect, it } from 'vitest';
import {
  groupCreateInputSchema,
  groupNameSchema,
  displayNameSchema,
  isoDateSchema,
  joinCodeSchema,
  meUpdateProfileInputSchema,
  phoneE164Schema,
  requestOtpInputSchema,
  signalSubmitInputSchema,
  timezoneSchema,
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

describe('groupNameSchema', () => {
  it('rejects empty or whitespace-only names', () => {
    expect(groupNameSchema.safeParse('').success).toBe(false);
    expect(groupNameSchema.safeParse('   ').success).toBe(false);
  });

  it('trims and accepts a reasonable name', () => {
    expect(groupNameSchema.safeParse('  The Crew  ').success).toBe(true);
  });

  it('rejects a name over 80 characters', () => {
    expect(groupNameSchema.safeParse('x'.repeat(81)).success).toBe(false);
  });
});

describe('groupCreateInputSchema', () => {
  it('accepts a valid name', () => {
    expect(groupCreateInputSchema.safeParse({ name: 'Book Club' }).success).toBe(true);
  });
});

describe('joinCodeSchema (FIX-12)', () => {
  it('accepts a 12-character code from the unambiguous alphabet', () => {
    expect(joinCodeSchema.safeParse('23456789ABCD').success).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(joinCodeSchema.safeParse('abcdefghjklm').success).toBe(true);
  });

  it('rejects the excluded ambiguous characters 0, O, 1, I', () => {
    for (const bad of ['0BCDEFGHJKLM', 'OBCDEFGHJKLM', '1BCDEFGHJKLM', 'IBCDEFGHJKLM']) {
      expect(joinCodeSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('rejects codes shorter than 10 characters', () => {
    expect(joinCodeSchema.safeParse('23456789A').success).toBe(false);
  });
});

describe('displayNameSchema (T25 / X-12)', () => {
  it('rejects empty or whitespace-only names', () => {
    expect(displayNameSchema.safeParse('').success).toBe(false);
    expect(displayNameSchema.safeParse('   ').success).toBe(false);
  });

  it('trims, so a padded name is stored the way it will be rendered', () => {
    expect(displayNameSchema.parse('  Mobina  ')).toBe('Mobina');
  });

  it('rejects a name too long for a member-list row', () => {
    expect(displayNameSchema.safeParse('x'.repeat(41)).success).toBe(false);
    expect(displayNameSchema.safeParse('x'.repeat(40)).success).toBe(true);
  });
});

describe('timezoneSchema', () => {
  it('accepts real IANA zones', () => {
    for (const tz of ['America/Toronto', 'America/Vancouver', 'Europe/London', 'UTC']) {
      expect(timezoneSchema.safeParse(tz).success).toBe(true);
    }
  });

  it('rejects anything Intl cannot resolve, which is what the engine will call it with', () => {
    for (const bad of ['', 'Toronto', 'Mars/Olympus_Mons', 'America/Torontoo']) {
      expect(timezoneSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('meUpdateProfileInputSchema', () => {
  it('accepts either field alone, or both', () => {
    expect(meUpdateProfileInputSchema.safeParse({ displayName: 'Mobina' }).success).toBe(true);
    expect(meUpdateProfileInputSchema.safeParse({ timezone: 'UTC' }).success).toBe(true);
    expect(
      meUpdateProfileInputSchema.safeParse({ displayName: 'Mobina', timezone: 'UTC' }).success,
    ).toBe(true);
  });

  it('rejects a patch with nothing in it', () => {
    expect(meUpdateProfileInputSchema.safeParse({}).success).toBe(false);
  });
});
