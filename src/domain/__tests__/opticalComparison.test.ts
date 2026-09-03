import { describe, expect, it } from 'vitest';
import { calculateLivePreviewFraming, compareOpticalFraming } from '../camera/opticalComparison';

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

describe('calculateLivePreviewFraming', () => {
  it('turns a longer focal length into a matching live-feed crop', () => {
    const framing = calculateLivePreviewFraming(
      { focalLength: 24, sensorFormat: 'Super35' },
      { focalLength: 50, sensorFormat: 'Super35' },
    );
    expect(framing.scale).toBeCloseTo(50 / 24, 5);
    expect(framing.sourceLimited).toBe(false);
  });

  it('never invents image beyond the physical live feed', () => {
    const framing = calculateLivePreviewFraming(
      { focalLength: 50, sensorFormat: 'Super35' },
      { focalLength: 24, sensorFormat: 'FullFrame' },
    );
    expect(framing.scale).toBe(1);
    expect(framing.sourceLimited).toBe(true);
  });
});
