import { describe, expect, it } from 'vitest';
import type { GridSettings, PropElement, ShapeElement } from '../../types';
import { buildAssetPreview } from '../plan/assetPreview';

const grid: GridSettings = { unit: 'm', pixelsPerUnit: 100, size: 20, snap: true, showGrid: true };
const prop: PropElement = { id: 'vehicle', type: 'prop', name: 'Vehicle', x: 0, y: 0, rotation: 0,
  width: 200, height: 520, propType: 'car', color: '#bf7857' };

describe('vehicle preview', () => {
  it.each(['car', 'vehicle_suv', 'vehicle_police', 'vehicle_truck', 'broadcast_truck', 'broadcast_van', 'sat_truck'] as const)(
    'renders %s as a ground-level model following its rotated footprint', (propType) => {
      const solids = buildAssetPreview([{ ...prop, propType, rotation: 90 }], undefined, grid);
      const points = solids.flatMap(({ corners }) => corners);
      expect(solids.length).toBeGreaterThan(10);
      expect(Math.min(...points.map(({ z }) => z))).toBeCloseTo(0);
      expect(Math.max(...points.map(({ x }) => x)) - Math.min(...points.map(({ x }) => x))).toBeCloseTo(5200);
      expect(Math.max(...points.map(({ y }) => y)) - Math.min(...points.map(({ y }) => y))).toBeCloseTo(2000);
      const headlights = solids.filter(({ color }) => color === '#fff0cc');
      expect(headlights).toHaveLength(2);
      expect(headlights.every(({ corners }) => corners.every(({ x }) => x > 0))).toBe(true);
    },
  );

  it.each(['broadcast.ob-van', 'broadcast.eng-van', 'broadcast.satellite-truck'])(
    'also renders the %s library placement', (symbolId) => {
      const shape: ShapeElement = { id: 'symbol', name: 'Vehicle symbol', type: 'shape', shapeType: 'rectangle',
        x: 0, y: 0, rotation: 0, width: 200, height: 520, color: '#bf7857', symbolId };
      expect(buildAssetPreview([shape], undefined, grid).length).toBeGreaterThan(10);
    },
  );
});
