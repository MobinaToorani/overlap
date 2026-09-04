import { describe, expect, it } from 'vitest';
import { isUniqueViolation } from '@/server/db/errors';

describe('isUniqueViolation', () => {
  it('recognizes Postgres error code 23505', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
  });

  it('rejects other error codes and non-error values', () => {
    expect(isUniqueViolation({ code: '23503' })).toBe(false); // foreign_key_violation
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation('a string')).toBe(false);
  });
});
