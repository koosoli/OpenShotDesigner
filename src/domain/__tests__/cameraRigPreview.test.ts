import { describe, expect, it } from 'vitest';
import { cameraRigPreview } from '../plan/cameraRigPreview';
import { buildAssetPreview } from '../plan/assetPreview';
import { DOLLY_TRACK, dollyTrackGaugeMm } from '../plan/dollyTrackDimensions';
import type { CameraElement, TrackElement } from '../../types';

describe('track dolly and slider geometry', () => {
  it.each([10, 1000 / 30, 304.8 / 12])('aligns track wheel tread centres with the plan rail gauge at %s mm/px', scale => {
    const gauge = dollyTrackGaugeMm(scale);
    const dolly = cameraRigPreview('Dana Dolly', 1450, gauge)!;
    const wheels = dolly.slice(0, 8);
    const railTop = DOLLY_TRACK.railCentreHeightMm + DOLLY_TRACK.railDiameterMm / 2;
    expect(wheels).toHaveLength(8);
    for (const wheel of wheels) {
      const centreY = wheel.corners.reduce((sum, p) => sum + p.y, 0) / wheel.corners.length;
      expect(Math.abs(centreY)).toBeCloseTo(gauge / 2);
      expect(Math.min(...wheel.corners.map(p => p.z))).toBeCloseTo(railTop);
    }
    expect(dolly).not.toEqual(cameraRigPreview('Slider', 1450, gauge));
  });

  it('places dolly wheels directly on separately drawn tracks, including elevation', () => {
    const track: TrackElement = { id: 'track', type: 'track', name: 'Track', x: -150, y: 0, x2: 150, y2: 0, rotation: 0, elevationMm: 500 };
    const camera = { id: 'camera', type: 'camera', name: 'Dolly', x: 0, y: 0, rotation: 0,
      rigType: 'Dana Dolly', cameraHeight: 'Eye Level', color: '#64748b', elevationMm: 500 } as CameraElement;
    const solids = buildAssetPreview([track, camera], undefined,
      { unit: 'm', pixelsPerUnit: 100, size: 20, showGrid: true, snap: true });
    const wheels = solids.filter(p => p.wallId === 'camera').slice(0, 8);
    const rails = solids.filter(p => p.wallId === 'track' && p.color === '#a2adb6');
    expect(Math.min(...wheels.flatMap(p => p.corners.map(p => p.z))))
      .toBeCloseTo(Math.max(...rails.flatMap(p => p.corners.map(p => p.z))));
    expect(wheels.every(p => Math.abs(Math.abs(p.corners.reduce((sum, v) => sum + v.y, 0) / p.corners.length) - 120) < 1e-8)).toBe(true);
  });
});
