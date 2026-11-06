import { describe, expect, it } from 'vitest';
import type { LightElement, WallElement, WindowElement } from '../../types';
import { buildPreviewLights, buildLightBlockers, isLightBlocked, samplePreviewLighting } from '../plan/sceneLighting';
import { buildWallPreview } from '../plan/wallPreview';
import { buildScenePreviewMesh, sceneOrbitPose, sceneFallbackViewBox } from '../plan/scenePreviewMesh';

const grid = { unit: 'm' as const, pixelsPerUnit: 1000, size: 20, snap: true, showGrid: true };
const light: LightElement = { id: 'lamp', type: 'light', name: 'Lamp', x: 0, y: 0, rotation: 0,
  fixtureType: 'led_panel', intensity: 100, colorTemp: 5600, beamAngle: 60, throwDistance: 3000 };
describe('qualitative scene lighting', () => {
  it('honors blackout, non-emitting fixtures, visibility and missing technical inputs', () => {
    expect(buildPreviewLights([{ ...light, intensity: 0 }, { ...light, id: 'flag', fixtureType: 'flag_solid' },
      { ...light, id: 'hidden', visible: false }, { ...light, id: 'invalid', intensity: NaN }], undefined, grid, 20)).toEqual([]);
    expect(buildPreviewLights([{ ...light, layerId: 'hidden' }], [{ id: 'hidden', name: '', visible: false, locked: false, order: 0 }], grid, 20)).toEqual([]);
  });
  it('derives direction, Kelvin/RGB/gel colour, dimmer and canonical elevation', () => {
    const result = buildPreviewLights([{ ...light, x: 1000, rotation: 90, elevationMm: 3000, intensity: 50,
      modifiers: [{ id: 'gel', kind: 'gel', symbolId: 'lighting.modifier.gel', enabled: true, colorHex: '#ff0000' }] }], undefined, grid, 30)[0];
    expect(result.position).toEqual([1000, 0, 4800]);
    expect(result.direction[0]).toBeCloseTo(0); expect(result.direction[1]).toBeCloseTo(Math.cos(Math.PI / 6));
    expect(result.direction[2]).toBeCloseTo(-.5);
    expect(result.color).toEqual([1, 0, 0]); expect(result.intensity).toBe(.5);
    const warm = buildPreviewLights([{ ...light, colorTemp: 2800 }], undefined, grid, 20)[0];
    expect(warm.color[0]).toBeGreaterThan(warm.color[2]);
  });
  it('lights named library fixtures with explicitly illustrative settings', () => {
    const symbols = buildPreviewLights([{ id: 'symbol', type: 'shape', shapeType: 'rectangle', symbolId: 'production.nanlite-2400b',
      name: 'Lamp', x: 0, y: 0, rotation: 0, width: 80, height: 80, color: '#fff' }], undefined, grid, 20);
    expect(symbols).toHaveLength(1); expect(symbols[0].assumed).toBe(true);
  });
  it('falls off with distance and excludes points outside the beam', () => {
    const source = buildPreviewLights([light], undefined, grid, 0);
    const near = samplePreviewLighting([1000, 0, 1800], [-1, 0, 0], source, [], 0);
    const far = samplePreviewLighting([4000, 0, 1800], [-1, 0, 0], source, [], 0);
    expect(near[0]).toBeGreaterThan(far[0]);
    expect(samplePreviewLighting([-1000, 0, 1800], [1, 0, 0], source, [], 0)).toEqual([0, 0, 0]);
    expect(samplePreviewLighting([1000, 0, 1800], [-1, 0, 0], [{ ...source[0], intensity: .5 }], [], 0)[0]).toBeCloseTo(near[0] / 2);
  });
  it('uses known modifier transmission without changing stored technical inputs', () => {
    const modifier = { id: 'diff', kind: 'diffusion' as const, symbolId: 'lighting.modifier.diffusion', enabled: true, transmissionPercent: 50 };
    const result = buildPreviewLights([{ ...light, modifiers: [modifier] }], undefined, grid, 20);
    expect(result[0].intensity).toBe(.5); expect(modifier.transmissionPercent).toBe(50);
  });
  it('keeps omnidirectional practicals emitting independently of cone angle', () => {
    const result = buildPreviewLights([{ ...light, fixtureType: 'practical', beamAngle: 0 }], undefined, grid, 20);
    expect(result).toHaveLength(1); expect(result[0].omni).toBe(true);
  });
  it('preserves zoom and pan in the SVG snapshot fallback', () => {
    const box = sceneFallbackViewBox('0 0 1000 500', { angle: 0, tilt: 30, zoom: 2, panX: .1, panY: .2 }, 2);
    expect(box.split(' ').map(Number)).toEqual([200, 75, 500, 250]);
  });
  it('casts wall shadows while allowing light through actual window openings', () => {
    const wall: WallElement = { id: 'wall', type: 'wall', name: 'Wall', x: 0, y: -1000, x2: 0, y2: 1000, rotation: 0, thickness: 100 };
    const window: WindowElement = { id: 'window', type: 'window', name: 'Window', x: 0, y: 0, rotation: 90, width: 800, depth: 100, hostWallId: 'wall' };
    const elements = [wall, window];
    const blockers = buildLightBlockers(buildWallPreview(elements, undefined, grid, true), elements);
    expect(isLightBlocked([-1000, 0, 1500], [1000, 0, 1500], blockers, 'lamp', 'actor')).toBe(false);
    expect(isLightBlocked([-1000, 0, 500], [1000, 0, 500], blockers, 'lamp', 'actor')).toBe(true);
    expect(isLightBlocked([-1000, 700, 1500], [1000, 700, 1500], blockers, 'lamp', 'actor')).toBe(true);
  });
  it('builds a finite depth-buffered mesh and an orthonormal orbit pose', () => {
    const mesh = buildScenePreviewMesh([], { lights: buildPreviewLights([light], undefined, grid, 20), blockers: [], ambient: .2 });
    expect(mesh.length).toBeGreaterThan(36); expect([...mesh].every(Number.isFinite)).toBe(true);
    const pose = sceneOrbitPose([], { angle: 65, tilt: 40, zoom: 1, panX: 0, panY: 0 }, 1.6);
    expect(pose.orthographicSpan).toBeGreaterThan(0);
    for (const axis of [pose.right, pose.up, pose.forward]) expect(Math.hypot(...axis)).toBeCloseTo(1);
    expect(pose.up.reduce((sum, v, i) => sum + v * pose.forward[i], 0)).toBeCloseTo(0);
  });
});
