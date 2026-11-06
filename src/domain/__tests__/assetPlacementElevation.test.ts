import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getSymbolById } from '../assets';
import { symbolPlacementSize } from '../assets/symbolPlacement';
import { buildAssetPreview } from '../plan/assetPreview';
import { migrateProject } from '../migrations';
import { PlanSymbolGlyph } from '../../components/canvas/PlanSymbolGlyph';

describe('physical placement and suspension', () => {
  it.each(['m', 'ft'] as const)('places and suspends an 8x8 cloth to scale in %s', (unit) => {
    const symbol = getSymbolById('production.grid-cloth-8')!;
    const grid = { unit, pixelsPerUnit: 30, size: 20, snap: true, showGrid: true };
    const size = symbolPlacementSize(symbol, grid)!;
    const solids = buildAssetPreview([{ id: 'cloth', type: 'shape', shapeType: 'rectangle', name: symbol.name,
      symbolId: symbol.id, color: '#ddd', x: 0, y: 0, rotation: 0, elevationMm: 3000, ...size }], undefined, grid);
    const corners = solids[0].corners;
    expect(corners[1].x - corners[0].x).toBeCloseTo(2438.4);
    expect(corners[0].z).toBe(3000);
    expect(corners[4].z).toBe(3018);
    if (unit === 'ft') expect(size.width).toBeCloseTo(240);
  });

  it('preserves old placements when migrating and keeps explicit elevation', () => {
    const old = { schemaVersion: 40, setups: [{ elements: [{ id: 'a', elevationMm: 2500 }, { id: 'b' }] }] };
    expect(migrateProject(old).project).toEqual({ ...old, schemaVersion: 42 });
    expect(old.schemaVersion).toBe(40);
  });

  it('uses the existing fixture artwork for named lighting assets', () => {
    const symbol = getSymbolById('production.nanlite-2400b')!;
    expect(renderToStaticMarkup(createElement(PlanSymbolGlyph, { symbol }))).toContain('fixture-fresnel');
    expect(renderToStaticMarkup(createElement(PlanSymbolGlyph, { symbol: getSymbolById('production.amaran-f22c')! }))).toContain('fixture-');
  });
});
