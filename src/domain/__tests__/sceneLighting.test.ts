import { describe, expect, it } from 'vitest';
import type { LightElement, WallElement, WindowElement } from '../../types';
import { buildPreviewLights, buildLightBlockers, isLightBlocked, samplePreviewLighting, type LightBlocker, type Vec3 } from '../plan/sceneLighting';
import { buildWallPreview } from '../plan/wallPreview';
import { buildAssetPreview } from '../plan/assetPreview';
import { previewReflectorBounces } from '../plan/previewReflectorBounce';
import { buildScenePreviewMesh, LIT_LIMITS, LIT_STRIDE, litLimitNote, sceneOrbitPose, sceneFallbackViewBox, type LitScene } from '../plan/scenePreviewMesh';

const grid = { unit: 'm' as const, pixelsPerUnit: 1000, size: 20, snap: true, showGrid: true };
const light: LightElement = { id: 'lamp', type: 'light', name: 'Lamp', x: 0, y: 0, rotation: 0,
  fixtureType: 'led_panel', intensity: 100, colorTemp: 5600, beamAngle: 60, throwDistance: 3000 };

/**
 * Test-only mirror of the lit fragment shader in viewfinderWebGL.ts, reading the packed uniforms.
 * It checks that the packing layout and the shader arithmetic agree with the CPU reference model.
 */
function evaluatePacked(lit: LitScene, point: Vec3, normal: Vec3, surface: number): Vec3 {
  const L = lit.lightData;
  const B = lit.blockerData;
  const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const blocked = (from: Vec3, to: Vec3, source: number): boolean => {
    const delta = to.map((v, i) => v - from[i]) as Vec3;
    const segmentMin = from.map((v, i) => Math.min(v, to[i]));
    const segmentMax = from.map((v, i) => Math.max(v, to[i]));
    for (let b = 0; b < lit.blockerCount; b++) {
      const o = b * 48;
      const low = [B[o], B[o + 1], B[o + 2]];
      const surfaceOfBlocker = B[o + 3];
      const high = [B[o + 4], B[o + 5], B[o + 6]];
      const planeCount = B[o + 7];
      if (surfaceOfBlocker === source || surfaceOfBlocker === surface) continue;
      if (segmentMax.some((v, i) => v < low[i]) || segmentMin.some((v, i) => v > high[i])) continue;
      let near = .001, far = .999, clear = false;
      for (let p = 0; p < planeCount; p++) {
        const k = o + 8 + p * 4;
        const planeNormal = [B[k], B[k + 1], B[k + 2]];
        const denominator = dot(planeNormal, delta);
        const offset = B[k + 3] - dot(planeNormal, from);
        if (Math.abs(denominator) < 1e-9) { if (offset < -.01) { clear = true; break; } continue; }
        const t = offset / denominator;
        if (denominator < 0) near = Math.max(near, t); else far = Math.min(far, t);
        if (near > far) { clear = true; break; }
      }
      if (!clear && near <= far) return true;
    }
    return false;
  };
  const light: Vec3 = [lit.ambient, lit.ambient, lit.ambient];
  for (let i = 0; i < lit.lightCount; i++) {
    const o = i * 16;
    const origin: Vec3 = [L[o], L[o + 1], L[o + 2]];
    const outer = L[o + 3];
    const aim: Vec3 = [L[o + 4], L[o + 5], L[o + 6]];
    const inner = L[o + 7];
    const emission: Vec3 = [L[o + 8], L[o + 9], L[o + 10]];
    const omni = L[o + 11] > .5;
    const source = L[o + 12];
    const delta = point.map((v, j) => v - origin[j]) as Vec3;
    const distance = Math.hypot(...delta);
    if (distance < 1) continue;
    const direction = delta.map(v => v / distance) as Vec3;
    const cone = omni ? 1 : Math.max(0, Math.min(1, (dot(direction, aim) - outer) / Math.max(.001, inner - outer)));
    const incidence = Math.max(0, -dot(normal, direction));
    if (!cone || !incidence || blocked(origin, point, source)) continue;
    for (let c = 0; c < 3; c++) light[c] += emission[c] * cone * incidence / (1 + (distance / 2000) ** 2);
  }
  return light;
}

describe('qualitative scene lighting', () => {
  it('adds bounced fill from an illuminated wall without a reflector board', () => {
    const wall: WallElement = { id: 'wall', type: 'wall', name: 'Wall', x: 0, y: -1000, x2: 0, y2: 1000, rotation: 0, thickness: 100 };
    const solids = buildWallPreview([wall], undefined, grid, true);
    const blockers = buildLightBlockers(solids, [wall]);
    const source = { ...buildPreviewLights([light], undefined, grid, 0)[0],
      position: [2000, 0, 1300] as Vec3, direction: [-1, 0, 0] as Vec3 };
    const bounced = previewReflectorBounces(solids, [source], blockers);
    expect(bounced.some(fill => fill.direction[0] > .9)).toBe(true);
    expect(samplePreviewLighting([1000, 0, 0], [0, 0, 1], bounced, blockers, 0)[0]).toBeGreaterThan(0);
    expect(samplePreviewLighting([-1000, 0, 0], [0, 0, 1], bounced, blockers, 0)).toEqual([0, 0, 0]);
  });

  it('bounces only direct light that reaches the front of a reflector', () => {
    const reflector: LightElement = { ...light, id: 'board', fixtureType: 'reflector' };
    const solids = buildAssetPreview([reflector], undefined, grid);
    const source = { ...buildPreviewLights([light], undefined, grid, 0)[0],
      position: [2000, 0, 1800] as Vec3, direction: [-1, 0, 0] as Vec3, color: [1, 0, 0] as Vec3 };
    const bounces = previewReflectorBounces(solids, [source], []);
    expect(bounces).toHaveLength(1);
    expect(bounces[0].direction).toEqual([1, 0, 0]);
    expect(samplePreviewLighting([1000, 0, 1800], [-1, 0, 0], bounces, [], 0)[0]).toBeGreaterThan(0);
    expect(samplePreviewLighting([-1000, 0, 1800], [1, 0, 0], bounces, [], 0)).toEqual([0, 0, 0]);
    expect(previewReflectorBounces(solids, [{ ...source, direction: [1, 0, 0] }], [])).toEqual([]);
    const wall: WallElement = { id: 'wall', type: 'wall', name: 'Wall', x: 1000, y: -1000, x2: 1000, y2: 1000, rotation: 0, thickness: 100 };
    const blockers = buildLightBlockers(buildWallPreview([wall], undefined, grid, true), [wall]);
    expect(previewReflectorBounces(solids, [source], blockers)).toEqual([]);
  });

  it('packs dimmed fixture emission only on the emitting geometry', () => {
    const panel: LightElement = { ...light, rgbColor: '#ff0000', intensity: 25 };
    const solids = buildAssetPreview([panel], undefined, grid);
    const face = solids.find(solid => solid.emitting)!;
    const body = solids.find(solid => !solid.emitting)!;
    const lights = buildPreviewLights([panel], undefined, grid, 20);
    const emission = (solid: typeof face, sources = lights) =>
      Array.from(buildScenePreviewMesh([solid], { lights: sources, blockers: [], ambient: 0 })
        .vertices.slice(LIT_STRIDE - 3, LIT_STRIDE));
    expect(emission(face)).toEqual([1, 0, 0]);
    expect(emission(body)).toEqual([0, 0, 0]);
    expect(emission(face, [])).toEqual([0, 0, 0]);
    expect(buildAssetPreview([{ ...panel, fixtureType: 'reflector' }], undefined, grid)
      .some(solid => solid.emitting)).toBe(false);
  });

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
  it('builds a finite lit mesh with packed lights and an orthonormal orbit pose', () => {
    const mesh = buildScenePreviewMesh([], { lights: buildPreviewLights([light], undefined, grid, 20), blockers: [], ambient: .2 });
    expect(mesh.vertices.length).toBeGreaterThan(36);
    expect(mesh.vertices.length % LIT_STRIDE).toBe(0);
    expect([...mesh.vertices].every(Number.isFinite)).toBe(true);
    expect(mesh.lit?.lightCount).toBe(1);
    expect(mesh.lit?.ambient).toBeCloseTo(.2);
    const pose = sceneOrbitPose([], { angle: 65, tilt: 40, zoom: 1, panX: 0, panY: 0 }, 1.6);
    expect(pose.orthographicSpan).toBeGreaterThan(0);
    for (const axis of [pose.right, pose.up, pose.forward]) expect(Math.hypot(...axis)).toBeCloseTo(1);
    expect(pose.up.reduce((sum, v, i) => sum + v * pose.forward[i], 0)).toBeCloseTo(0);
  });
  it('packs per-pixel lighting that agrees with the reference model, including wall shadows', () => {
    const wall: WallElement = { id: 'wall', type: 'wall', name: 'Wall', x: 0, y: -1000, x2: 0, y2: 1000, rotation: 0, thickness: 100 };
    const aimed: LightElement = { ...light, id: 'aimed', x: -1000, y: 0, rotation: 0, beamAngle: 90, throwDistance: 3000 };
    const practical: LightElement = { ...light, id: 'practical', x: 2000, y: 300, fixtureType: 'practical', beamAngle: 0 };
    const elements = [wall, aimed, practical];
    const solids = buildWallPreview(elements, undefined, grid, true);
    const lights = buildPreviewLights([aimed, practical], undefined, grid, 20);
    const blockers = buildLightBlockers(solids, elements);
    const ambient = .2;
    const lit = buildScenePreviewMesh(solids, { lights, blockers, ambient }).lit!;
    const surfaceOf = (id: string) => [...new Set(solids.map(solid => solid.wallId))].indexOf(id);
    const samples: [Vec3, Vec3, string][] = [
      [[-500, 0, 0], [0, 0, 1], '__floor'],
      [[500, 0, 0], [0, 0, 1], '__floor'],
      [[-500, -800, 0], [0, 0, 1], '__floor'],
      [[1500, 200, 0], [0, 0, 1], '__floor'],
      [[-200, 0, 1500], [-1, 0, 0], 'wall'],
      [[200, 0, 1500], [1, 0, 0], 'wall'],
      [[300, 500, 800], [1, 0, 0], 'wall'],
    ];
    for (const [point, normal, surfaceId] of samples) {
      const reference = samplePreviewLighting(point, normal, lights, blockers, ambient, surfaceId);
      const packed = evaluatePacked(lit, point, normal, surfaceId === '__floor' ? -1 : surfaceOf(surfaceId));
      reference.forEach((channel, i) => expect(Math.abs(packed[i] - channel)).toBeLessThanOrEqual(1e-4 * (1 + Math.abs(channel))));
    }
    // The shadow test has to change something, or the parity above proves nothing about walls.
    const behindWall = samplePreviewLighting([500, 0, 0], [0, 0, 1], lights, [], ambient, '__floor')[0];
    const shadowed = samplePreviewLighting([500, 0, 0], [0, 0, 1], lights, blockers, ambient, '__floor')[0];
    expect(shadowed).toBeLessThan(behindWall);
  });
  it('caps packed lighting, reports what it dropped and leaves unlimited scenes unannotated', () => {
    const template = buildPreviewLights([light], undefined, grid, 20)[0];
    const lights = Array.from({ length: 10 }, (_, i) => ({ ...template, id: `lamp${i}` }));
    const plane = { normal: [0, 0, 1] as Vec3, distance: 0 };
    const box = (id: string, planes: number): LightBlocker => ({ id, min: [0, 0, 0], max: [1, 1, 1], planes: Array.from({ length: planes }, () => plane) });
    const blockers = [...Array.from({ length: 14 }, (_, i) => box(`wall${i}`, 6)), box('round', LIT_LIMITS.planes + 2)];
    const capped = buildScenePreviewMesh([], { lights, blockers, ambient: .2 }).lit!;
    expect(capped.lightCount).toBe(LIT_LIMITS.lights);
    expect(capped.dropped.lights).toBe(2);
    expect(capped.blockerCount).toBe(LIT_LIMITS.blockers);
    expect(capped.dropped.blockers).toBe(blockers.length - LIT_LIMITS.blockers);
    expect(litLimitNote(capped)).toContain(`first ${LIT_LIMITS.lights} lights`);
    expect(litLimitNote(buildScenePreviewMesh([], { lights: lights.slice(0, 1), blockers: [], ambient: .2 }).lit)).toBe('');
    expect(litLimitNote(buildScenePreviewMesh([]).lit)).toBe('');
  });
});
