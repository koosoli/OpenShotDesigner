import { describe, expect, it } from 'vitest';
import type { ActorElement, CameraElement, GridSettings, WallElement, WindowElement } from '../../types';
import { migrateProject } from '../migrations';
import { buildViewfinderMesh, getViewfinderPose, getViewfinderTilt, VIEWFINDER_FLOOR, VIEWFINDER_SKY } from './viewfinderScene';

const grid: GridSettings = { unit: 'm', pixelsPerUnit: 100, size: 20, snap: true, showGrid: true };
const camera: CameraElement = {
  id: 'camera', type: 'camera', name: 'Camera', x: 10, y: 25, rotation: 0,
  cameraLabel: 'A', color: '#0284c7', focalLength: 35, fovAngle: 48, sensorFormat: 'Super35',
  aspectRatio: '16:9', cameraHeight: 'Eye Level', rigType: 'Tripod', throwDistance: 200, path: [],
};

describe('3D viewfinder scene', () => {
  it('migrates schema 39 projects without replacing existing framing or wall defaults', () => {
    const legacyCamera = { ...camera, cameraHeight: 'High Angle' as const };
    const legacy = { schemaVersion: 39, setups: [{ elements: [legacyCamera, { id: 'wall', type: 'wall' }] }] };
    const { project, migratedFrom } = migrateProject(legacy);
    expect(migratedFrom).toBe(39);
    expect(project).toEqual({ ...legacy, schemaVersion: 40 });
    expect(getViewfinderTilt(legacyCamera)).toBe(-24);
  });

  it('applies signed tilt independently of the height preset and restores the preset on reset', () => {
    const raised = { ...camera, cameraHeight: 'High Angle' as const, tiltDeg: 30 };
    const pose = getViewfinderPose(raised, grid, 'start')!;
    expect(pose.eye[2]).toBe(2350);
    expect(pose.forward[2]).toBeCloseTo(.5);
    expect(getViewfinderTilt({ ...raised, tiltDeg: 0 })).toBe(0);
    expect(getViewfinderTilt({ ...raised, tiltDeg: -100 })).toBe(-90);
    expect(getViewfinderTilt({ ...raised, tiltDeg: null })).toBe(-24);
  });
  it('converts the plan position and aims at the selected waypoint', () => {
    const moving = { ...camera, path: [{ id: 'end', x: 50, y: 100, rotation: 90, beat: 2 }] };
    expect(getViewfinderPose(moving, grid, 'start')?.eye).toEqual([100, 250, 1535]);
    expect(getViewfinderPose(moving, grid, 'start')?.forward).toEqual([1, 0, 0]);
    const end = getViewfinderPose(moving, grid, 'end');
    expect(end?.eye).toEqual([500, 1000, 1535]);
    expect(end?.forward[0]).toBeCloseTo(0);
    expect(end?.forward[1]).toBeCloseTo(1);
    expect(getViewfinderPose(moving, { ...grid, pixelsPerUnit: 0 }, 'start')).toBeNull();
  });

  it('responds to focal length, sensor size and framing presets', () => {
    const base = getViewfinderPose(camera, grid, 'start')!;
    const tight = getViewfinderPose({ ...camera, focalLength: 85 }, grid, 'start')!;
    const fullFrame = getViewfinderPose({ ...camera, sensorFormat: 'FullFrame' }, grid, 'start')!;
    expect(tight.tanHalfHorizontal).toBeLessThan(base.tanHalfHorizontal);
    expect(fullFrame.tanHalfHorizontal).toBeGreaterThan(base.tanHalfHorizontal);
    const overhead = getViewfinderPose({ ...camera, cameraHeight: "Overhead / Bird's Eye" }, grid, 'start')!;
    expect(overhead.forward[2]).toBeCloseTo(-1);
    expect(overhead.eye[2]).toBeGreaterThan(base.eye[2]);
  });

  it('increases barrel distortion as the lens or sensor widens the field of view', () => {
    const distortion = (focalLength: number, sensorFormat = camera.sensorFormat) =>
      getViewfinderPose({ ...camera, focalLength, sensorFormat }, grid, 'start')!.barrelDistortion;
    expect(distortion(50)).toBe(0);
    expect(distortion(24)).toBeGreaterThan(distortion(50));
    expect(distortion(14)).toBeGreaterThan(distortion(24));
    expect(distortion(24, 'FullFrame')).toBeGreaterThan(distortion(24));
    expect(distortion(8)).toBeCloseTo(distortion(4));
  });

  it('excludes the viewing camera and uses cast positions at the chosen beat', () => {
    const actor: ActorElement = {
      id: 'actor', type: 'actor', name: 'Actor', characterLetter: 'A', color: '#fff', heightCm: 180,
      x: 100, y: 0, rotation: 0, isStanding: true, path: [{ id: 'move', x: 200, y: 0, beat: 2 }],
    };
    const setup = { elements: [camera, actor], gridSettings: grid };
    const first = buildViewfinderMesh(setup, camera.id);
    const second = buildViewfinderMesh(setup, camera.id, 2);
    expect(first).toEqual(buildViewfinderMesh({ ...setup, elements: [actor] }, camera.id));
    expect(first.length).toBeGreaterThan(0);
    expect(second[0] - first[0]).toBeCloseTo(1000);
  });

  it('keeps hosted window openings clear of opaque glass', () => {
    const wall: WallElement = { id: 'wall', type: 'wall', name: 'Wall', x: 0, y: 0, x2: 500, y2: 0, thickness: 12, rotation: 0 };
    const window: WindowElement = { id: 'window', type: 'window', name: 'Window', x: 250, y: 0, width: 100, depth: 12, rotation: 0, hostWallId: wall.id };
    const solid = buildViewfinderMesh({ elements: [wall], gridSettings: grid }, camera.id);
    const opening = buildViewfinderMesh({ elements: [wall, window], gridSettings: grid }, camera.id);
    expect(opening.length).toBe(solid.length * 4);
  });

  it.each([undefined, '#000', '#273446', '#b01040', '#ffe9c5'])('keeps every shaded face of a %s wall at least 3:1 against the background', (wallColor) => {
    const wall: WallElement = { id: 'wall', type: 'wall', name: 'Wall', x: 0, y: 0, x2: 500, y2: 0, thickness: 12, rotation: 0, wallColor };
    const mesh = buildViewfinderMesh({ elements: [wall], gridSettings: grid }, camera.id);
    expect(mesh.length).toBeGreaterThan(0);
    const luminance = (r: number, g: number, b: number) => {
      const linear = (value: number) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
      return .2126 * linear(r) + .7152 * linear(g) + .0722 * linear(b);
    };
    const backdrop = Math.max(luminance(...VIEWFINDER_SKY), luminance(...VIEWFINDER_FLOOR));
    for (let i = 0; i < mesh.length; i += 6) {
      expect((luminance(mesh[i + 3], mesh[i + 4], mesh[i + 5]) + .05) / (backdrop + .05)).toBeGreaterThanOrEqual(3);
    }
  });
});
