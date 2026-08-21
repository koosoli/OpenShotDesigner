import { describe, expect, it } from 'vitest';
import { calibrateBackgroundImage, convertCalibrationLength } from '../plan';
import type { BackgroundImage, GridSettings } from '../../types';

const image: BackgroundImage = {
  id: 'bg-1', url: 'data:image/png;base64,test', x: 100, y: 50,
  width: 800, height: 400, opacity: 0.5, locked: false, visible: true,
};

const metricGrid: GridSettings = { size: 40, snap: true, showGrid: true, unit: 'm', pixelsPerUnit: 40 };

describe('background image scale calibration', () => {
  it('resizes around the first mark to make the marked distance exact', () => {
    const result = calibrateBackgroundImage(
      image,
      { x: 300, y: 150 },
      { x: 500, y: 150 },
      1,
      'm',
      metricGrid,
      '2026-08-21T00:00:00.000Z',
    );
    expect(result).not.toBeNull();
    expect(result?.desiredCanvasPixels).toBe(40);
    expect(result?.updates.width).toBe(160);
    expect(result?.updates.height).toBe(80);
    expect(result?.updates.x).toBe(260);
    expect(result?.updates.y).toBe(130);
    expect(result?.updates.calibration?.appliedScaleFactor).toBe(0.2);
  });

  it('converts entered feet to a metric grid explicitly', () => {
    expect(convertCalibrationLength(10, 'ft', 'm')).toBeCloseTo(3.048);
  });

  it('rejects zero-length marks and invalid real lengths', () => {
    expect(calibrateBackgroundImage(image, { x: 1, y: 1 }, { x: 1, y: 1 }, 1, 'm', metricGrid, 'now')).toBeNull();
    expect(calibrateBackgroundImage(image, { x: 1, y: 1 }, { x: 10, y: 1 }, 0, 'm', metricGrid, 'now')).toBeNull();
  });
});
