import { describe, expect, it } from 'vitest';
import { MAX_HEAT_STEP, heatStep } from '@/lib/heat';

describe('heatStep', () => {
  it('maps a confirmed count straight to a step until it saturates', () => {
    expect(heatStep(0)).toBe(0);
    expect(heatStep(1)).toBe(1);
    expect(heatStep(5)).toBe(5);
  });

  it('clamps above the top step rather than producing a nonexistent --heat-N', () => {
    // A step of 6+ would reference a CSS variable that doesn't exist and
    // the cell would render with no background — failing silently, and
    // exactly in the large groups where the heatmap matters most.
    expect(heatStep(6)).toBe(MAX_HEAT_STEP);
    expect(heatStep(12)).toBe(MAX_HEAT_STEP);
    expect(heatStep(999)).toBe(MAX_HEAT_STEP);
  });

  it('never returns a negative or fractional step', () => {
    expect(heatStep(-1)).toBe(0);
    expect(heatStep(2.7)).toBe(2);
    expect(heatStep(Number.NaN)).toBe(0);
  });
});
