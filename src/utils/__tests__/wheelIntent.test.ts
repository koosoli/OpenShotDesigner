import { describe, expect, it } from 'vitest';
import { wheelIntent } from '../wheelIntent';

const wheel = (deltaY: number, extra: Partial<{ deltaX: number; deltaMode: number; ctrlKey: boolean }> = {}) => ({
  deltaX: 0,
  deltaMode: 0,
  ctrlKey: false,
  deltaY,
  ...extra,
});

describe('wheelIntent', () => {
  it('pans on a touchpad two-finger scroll', () => {
    expect(wheelIntent(wheel(3.5, { deltaX: 1.2 }))).toEqual({ kind: 'pan', dx: 1.2, dy: 3.5 });
    expect(wheelIntent(wheel(12))).toMatchObject({ kind: 'pan' });
  });

  it('zooms gently on a pinch, in proportion to it', () => {
    const small = wheelIntent(wheel(-2, { ctrlKey: true }));
    const large = wheelIntent(wheel(-10, { ctrlKey: true }));
    expect(small.kind).toBe('zoom');
    if (small.kind !== 'zoom' || large.kind !== 'zoom') return;
    expect(small.factor).toBeGreaterThan(1);
    expect(small.factor).toBeLessThan(1.03);
    expect(large.factor).toBeGreaterThan(small.factor);
    // Thirty small pinch events (half a second of gesture) stay well under 2×.
    expect(small.factor ** 30).toBeLessThan(2);
  });

  it('zooms about one notch per mouse wheel click, never more than 25% per event', () => {
    const notch = wheelIntent(wheel(-100));
    expect(notch.kind).toBe('zoom');
    if (notch.kind === 'zoom') expect(notch.factor).toBeCloseTo(1.16, 2);
    const lines = wheelIntent(wheel(3, { deltaMode: 1 }));
    if (lines.kind === 'zoom') expect(lines.factor).toBeLessThan(1);
    const huge = wheelIntent(wheel(-5000, { ctrlKey: true }));
    if (huge.kind === 'zoom') expect(huge.factor).toBe(1.25);
  });
});
