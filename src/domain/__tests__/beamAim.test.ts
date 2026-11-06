import { describe, expect, it } from 'vitest';
import { resolveBeamAim, clampBeamPan, clampBeamTilt } from '../lighting/beamAim';
import { buildPreviewLights } from '../plan/sceneLighting';
import { migrateProject } from '../migrations';
import type { LightElement, ShapeElement } from '../../types';

const grid = { unit: 'm' as const, pixelsPerUnit: 100, size: 20, showGrid: true, snap: true };
const fixture: LightElement = { id: 'key', type: 'light', name: 'Key', x: 0, y: 0, rotation: 90,
  fixtureType: 'fresnel', beamAngle: 60, intensity: 100, colorTemp: 5600, throwDistance: 200 };
describe('fixture beam aim', () => {
  it('keeps legacy heading and inherits the scene tilt, while explicit zero stays horizontal', () => {
    const inherited = resolveBeamAim(fixture, 35);
    expect(inherited.panOffsetDeg).toBe(0); expect(inherited.tiltDeg).toBe(35);
    expect(resolveBeamAim({ ...fixture, beamTiltDeg: 0 }, 35).direction[2]).toBeCloseTo(0);
    expect(resolveBeamAim({ ...fixture, beamTiltDeg: NaN }, 35).tiltDeg).toBe(35);
  });
  it('combines body heading and relative pan without rotating the fixture body', () => {
    const light = { ...fixture, beamPanDeg: -90, beamTiltDeg: 30 };
    const aim = resolveBeamAim(light);
    expect(aim.direction[0]).toBeCloseTo(Math.cos(Math.PI / 6));
    expect(aim.direction[1]).toBeCloseTo(0); expect(aim.direction[2]).toBeCloseTo(-.5);
    expect(light.rotation).toBe(90);
    expect(Math.hypot(...aim.direction)).toBeCloseTo(1);
  });
  it('clamps finite ranges and supports beams aimed straight up or down', () => {
    expect(clampBeamPan(-250)).toBe(-180); expect(clampBeamPan(Infinity)).toBe(0);
    expect(clampBeamTilt(120)).toBe(90);
    expect(resolveBeamAim({ ...fixture, beamTiltDeg: 90 }).direction[2]).toBe(-1);
    expect(resolveBeamAim({ ...fixture, beamTiltDeg: -90 }).direction[2]).toBe(1);
  });
  it('uses independent aim in simulation for fixture objects and library symbols', () => {
    const light = { ...fixture, beamPanDeg: 45, beamTiltDeg: -20 };
    const symbol: ShapeElement = { ...light, type: 'shape', shapeType: 'rectangle', width: 80, height: 80,
      symbolId: 'production.nanlite-2400b', color: '#fff' };
    const outputs = buildPreviewLights([light, symbol], undefined, grid, 60);
    expect(outputs).toHaveLength(2);
    expect(outputs[0].direction).toEqual(resolveBeamAim(light).direction);
    expect(outputs[1].direction).toEqual(outputs[0].direction);
    expect(outputs[0].direction[2]).toBeGreaterThan(0);
  });
  it('migrates schema 41 losslessly without backfilling orientation or changing IDs and paths', () => {
    const old = { schemaVersion: 41, id: 'project', setups: [{ id: 'setup', elements: [fixture,
      { ...fixture, id: 'custom', beamPanDeg: 15, beamTiltDeg: 0, elevationMm: 3000, path: [{ id: 'move', x: 10, y: 20, beat: 2 }] }] }] };
    const source = structuredClone(old);
    const first = migrateProject(old).project;
    expect(first).toEqual({ ...source, schemaVersion: 42 }); expect(old).toEqual(source);
    expect(migrateProject(old).project).toEqual(first);
  });
});
