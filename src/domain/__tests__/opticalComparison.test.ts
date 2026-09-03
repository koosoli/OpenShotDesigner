import { describe, expect, it } from 'vitest';
import { compareOpticalFraming } from '../camera/opticalComparison';

describe('optical framing comparison', () => {
  it('shows a 70mm lens as half the horizontal field and twice the magnification of 35mm', () => {
    const comparison = compareOpticalFraming(
      { focalLength: 35, sensorFormat: 'Super35' },
      { focalLength: 70, sensorFormat: 'Super35' },
    );
    expect(comparison.direction).toBe('tighter');
    expect(comparison.currentWidthPercent).toBeCloseTo(50);
    expect(comparison.fieldWidthRatio).toBeCloseTo(0.5);
    expect(comparison.magnificationRatio).toBeCloseTo(2);
  });

  it('shows the wider field produced by a larger sensor at the same focal length', () => {
    const comparison = compareOpticalFraming(
      { focalLength: 35, sensorFormat: 'Super35' },
      { focalLength: 35, sensorFormat: 'FullFrame' },
    );
    expect(comparison.direction).toBe('wider');
    expect(comparison.currentWidthPercent).toBe(100);
    expect(comparison.previousWidthPercent).toBeLessThan(100);
  });
});
