import { describe, expect, it } from 'vitest';
import type { PropType, ShapeElement } from '../../types';
import { PRODUCTION_PREVIEW_ALIASES, productionAssetPreview } from '../plan/productionAssetPreview';
import { buildAssetPreview } from '../plan/assetPreview';
import { projectWallPreview } from '../plan/wallPreview';

describe('production asset coverage', () => {
  it.each(Object.keys(PRODUCTION_PREVIEW_ALIASES))('renders %s with finite geometry and visible faces', (key) => {
    const model = key.includes('.') ? productionAssetPreview(undefined, key, '#64748b')
      : productionAssetPreview(key as PropType, undefined, '#64748b');
    expect(model).toBeDefined();
    expect(model!.parts.length).toBeGreaterThan(0);
    const solids = model!.parts.map((part) => ({ ...part, wallId: 'asset' }));
    expect(solids.every(({ corners }) => corners.every(({ x, y, z }) => [x, y, z].every(Number.isFinite)))).toBe(true);
    expect(projectWallPreview(solids, 35)?.faces.length).toBeGreaterThan(0);
  });

  it('uses the detailed model through normal placement and honors visibility', () => {
    const asset: ShapeElement = { id: 'dj', type: 'shape', shapeType: 'rectangle', name: 'DJ booth',
      x: 50, y: 100, rotation: 90, width: 140, height: 60, color: '#64748b', symbolId: 'audio.dj-booth' };
    const grid = { unit: 'm' as const, pixelsPerUnit: 100, size: 20, snap: true, showGrid: true };
    const solids = buildAssetPreview([asset], undefined, grid);
    expect(solids.length).toBeGreaterThan(5);
    expect(solids[0].corners[0].x).toBeCloseTo(800);
    expect(buildAssetPreview([{ ...asset, visible: false }], undefined, grid)).toEqual([]);
  });
});
