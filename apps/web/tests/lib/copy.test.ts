import { describe, expect, it } from 'vitest';
import { fillTemplate, ordinal } from '@/lib/copy';

describe('ordinal', () => {
  it('handles the ones that trip a naive `${n}th`', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
    expect(ordinal(21)).toBe('21st');
    expect(ordinal(22)).toBe('22nd');
    expect(ordinal(23)).toBe('23rd');
    expect(ordinal(31)).toBe('31st');
  });

  it('gives the 11-13 teens "th" despite their last digit', () => {
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(13)).toBe('13th');
  });

  it('covers every remaining day of a month', () => {
    for (const n of [4, 5, 6, 7, 8, 9, 10, 14, 17, 20, 24, 30]) {
      expect(ordinal(n)).toBe(`${n}th`);
    }
  });
});

describe('fillTemplate', () => {
  it('substitutes named slots', () => {
    expect(fillTemplate('{a} of {b}', { a: 1, b: 2 })).toBe('1 of 2');
  });

  it('leaves an unknown slot intact rather than printing "undefined"', () => {
    expect(fillTemplate('{a} of {b}', { a: 1 })).toBe('1 of {b}');
  });
});
