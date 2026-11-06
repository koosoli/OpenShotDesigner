import { describe, expect, it } from 'vitest';
import { OFFER_EQUIPMENT, OFFER_SYMBOLS } from '../assets/offerEquipment';
import { getSymbolById, searchSymbols } from '../assets';
import { buildAssetPreview } from '../plan/assetPreview';
import { projectWallPreview } from '../plan/wallPreview';

describe('offer equipment library', () => {
  it('registers every named item with unique IDs and search terms', () => {
    expect(OFFER_SYMBOLS).toHaveLength(29);
    expect(new Set(OFFER_SYMBOLS.map(({ id }) => id)).size).toBe(OFFER_SYMBOLS.length);
    for (const symbol of OFFER_SYMBOLS) expect(getSymbolById(symbol.id)).toBe(symbol);
    expect(searchSymbols('Nanlite 2400B').some(({ symbol }) => symbol.id === 'production.nanlite-2400b')).toBe(true);
  });

  it.each(OFFER_EQUIPMENT)('renders $name through the normal asset preview entry point', (item) => {
    const solids = buildAssetPreview([{
      id: 'placed', type: 'shape', name: item.name, shapeType: 'rectangle', symbolId: `production.${item.key}`,
      x: 100, y: 100, rotation: 35, width: item.width / 10, height: item.depth / 10, color: '#ddd',
    }], undefined, { unit: 'm', pixelsPerUnit: 100, size: 20, snap: true, showGrid: true });
    expect(solids.length).toBeGreaterThan(0);
    expect(solids.every(({ corners }) => corners.every(({ x, y, z }) => [x, y, z].every(Number.isFinite)))).toBe(true);
    expect(projectWallPreview(solids, 35)?.faces.length).toBeGreaterThan(0);
  });
});
