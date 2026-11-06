import { describe, expect, it } from 'vitest';
import { CAMERA_RIGS, PROP_CATALOG } from '../../constants/presets';
import { SYMBOL_REGISTRY } from '../assets/symbolRegistry';
import { getFurnitureModel } from '../assets/furnitureModels';
import { cameraPreview, cameraSymbolPreview } from '../plan/cameraPreview';
import { lightingSymbolPreview } from '../plan/lightPreview';
import { offerEquipmentPreview } from '../plan/offerEquipmentPreview';
import { vehiclePreview } from '../plan/vehiclePreview';
import { productionAssetPreview } from '../plan/productionAssetPreview';
import { buildAssetPreview } from '../plan/assetPreview';
import { pathAssetPreview, samplePreviewPath } from '../plan/pathAssetPreview';
import type { TrackElement } from '../../types';

describe('complete built-in asset coverage', () => {
  it('assigns every library symbol a dedicated model or furniture assembly', () => {
    const missing = SYMBOL_REGISTRY.filter(s => !offerEquipmentPreview(s.id) && !lightingSymbolPreview(s.id)
      && !cameraSymbolPreview(s.id) && !vehiclePreview(undefined, s.id, '#64748b')
      && !productionAssetPreview(undefined, s.id, '#64748b') && !getFurnitureModel(undefined, s.id)
      && !['arch.dining-table', 'arch.conference-table'].includes(s.id));
    expect(missing.map(s => s.id)).toEqual([]);
  });

  it('assigns every legacy prop a model instead of the generic block fallback', () => {
    const missing = PROP_CATALOG.filter(p => !getFurnitureModel(p.type) && !vehiclePreview(p.type, undefined, '#64748b')
      && !productionAssetPreview(p.type, undefined, '#64748b') && p.type !== 'dining_set');
    expect(missing.map(p => p.type)).toEqual([]);
  });

  it.each(SYMBOL_REGISTRY)('renders $id with finite placed geometry', s => {
    const solids = buildAssetPreview([{ type: 'shape', id: s.id, name: s.name, shapeType: 'rectangle',
      symbolId: s.id, x: 10, y: 20, width: 100, height: 60, rotation: 37, color: '#64748b', elevationMm: 500 }],
    undefined, { unit: 'm', pixelsPerUnit: 100, size: 20, snap: true, showGrid: true });
    expect(solids.length).toBeGreaterThan(0);
    expect(solids.flatMap(s => s.corners).every(p => [p.x, p.y, p.z].every(Number.isFinite))).toBe(true);
  });

  it.each(CAMERA_RIGS)('renders $value camera support with finite geometry', rig => {
    const parts = cameraPreview({ rigType: rig.value, cameraHeight: 'Eye Level', color: '#64748b' });
    expect(parts.length).toBeGreaterThan(5);
    expect(parts.flatMap(p => p.corners).every(p => [p.x, p.y, p.z].every(Number.isFinite))).toBe(true);
  });
});

describe('endpoint assets in the shared 3D scene', () => {
  const track: TrackElement = { id: 'track', type: 'track', name: 'Rails', x: 100, y: 200,
    x2: 400, y2: 200, rotation: 0 };
  it('uses plan endpoints and quadratic curvature in canonical mm', () => {
    const samples = samplePreviewPath({ ...track, isCurved: true, curveOffset: 100 }, 10);
    expect(samples[0].x).toBe(1000);
    expect(samples.at(-1)?.x).toBe(4000);
    expect(Math.max(...samples.map(p => p.y))).toBeCloseTo(2500, -1);
    expect(samples.every(p => Math.abs(Math.hypot(p.nx, p.ny) - 1) < 1e-9)).toBe(true);
  });
  it('renders two rails and sleepers, preserves elevation and hidden layers', () => {
    const grid = { unit: 'm' as const, pixelsPerUnit: 100, size: 20, snap: true, showGrid: true };
    const solids = buildAssetPreview([{ ...track, elevationMm: 1000 }], undefined, grid);
    expect(solids.length).toBeGreaterThan(10);
    expect(Math.min(...solids.flatMap(p => p.corners.map(p => p.z)))).toBeGreaterThanOrEqual(1000);
    expect(buildAssetPreview([{ ...track, visible: false }], undefined, grid)).toEqual([]);
    expect(samplePreviewPath({ ...track, x2: track.x, y2: track.y }, 10)).toEqual([]);
  });
  it('renders routed cables without generating degenerate segments', () => {
    const parts = pathAssetPreview({ ...track, type: 'cable', cableType: 'dmx', fromLabel: '', toLabel: '',
      path: [{ id: 'p', x: 100, y: 200 }, { id: 'q', x: 200, y: 300 }] }, 10);
    expect(parts.length).toBe(2);
    expect(parts.flatMap(p => p.corners).every(p => [p.x, p.y, p.z].every(Number.isFinite))).toBe(true);
  });
  it('renders curved roads with sidewalks and rail surfaces', () => {
    const parts = pathAssetPreview({ ...track, type: 'road', width: 300, isCurved: true,
      surface: 'rail', sidewalks: true }, 10);
    expect(parts.length).toBeGreaterThan(20);
    expect(parts.flatMap(p => p.corners).every(p => [p.x, p.y, p.z].every(Number.isFinite))).toBe(true);
  });
  it('keeps detached door/window assets visible without duplicating hosted panels', () => {
    const door = { id: 'door', type: 'door' as const, name: 'Door', x: 100, y: 200, rotation: 0,
      width: 90, swingAngle: 90, swingDirection: 'left' as const, hostWallId: null };
    const grid = { unit: 'm' as const, pixelsPerUnit: 100, size: 20, snap: true, showGrid: true };
    expect(buildAssetPreview([door], undefined, grid).length).toBeGreaterThan(1);
    const wall = { id: 'wall', type: 'wall' as const, name: 'Wall', x: 0, y: 200, x2: 400, y2: 200,
      thickness: 12, rotation: 0 };
    expect(buildAssetPreview([wall, { ...door, hostWallId: 'wall' }], undefined, grid)).toEqual([]);
  });
});
