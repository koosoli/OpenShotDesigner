import { describe, expect, it } from 'vitest';
import type { GridSettings, LightElement, PlanLayer } from '../../types';
import { resolveBeamAim } from '../lighting/beamAim';
import { lightPreview } from '../plan/lightPreview';
import { sceneOrbitPose } from '../plan/scenePreviewMesh';
import {
  AIM_HANDLE_LENGTH_MM, aimedLightParts, aimFromDirection, aimHeadParts, directionFromScreen, headPivot,
  lightAimTargets, placeLightPoint, projectOrthographic,
} from '../plan/lightAim';
import type { EquipmentPart } from '../plan/equipmentPreviewGeometry';

type Vec3 = [number, number, number];
const grid: GridSettings = { unit: 'm', pixelsPerUnit: 1000, size: 20, snap: true, showGrid: true };
const light: LightElement = { id: 'lamp', type: 'light', name: 'Lamp', x: 1000, y: -400, rotation: 0,
  fixtureType: 'led_panel', intensity: 100, colorTemp: 5600, beamAngle: 60, throwDistance: 3000 };
const unit = (v: Vec3): Vec3 => { const m = Math.hypot(...v); return v.map(c => c / m) as Vec3; };
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe('light aim', () => {
  it('turns stored pan and tilt into a direction and back, across wrap-around', () => {
    for (const [rotation, pan, tilt] of [[30, -70, 25], [300, 170, 40], [0, -120, -15], [90, 0, 88]] as const) {
      const direction = resolveBeamAim({ rotation, beamPanDeg: pan, beamTiltDeg: tilt }, 20).direction;
      const aim = aimFromDirection(direction, rotation);
      expect(aim.beamPanDeg).toBeCloseTo(pan, 1);
      expect(aim.beamTiltDeg).toBeCloseTo(tilt, 1);
    }
  });

  it('turns the lamp head by the same direction the beam uses, and leaves stands alone', () => {
    const head: EquipmentPart = { color: '#fff', head: true, corners: [{ x: 0, y: 0, z: 1000 }, { x: 200, y: 0, z: 1000 }] };
    const stand: EquipmentPart = { color: '#000', corners: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1000 }] };
    const pivot = headPivot([head, stand])!;
    expect(pivot).toEqual([100, 0, 1000]);
    for (const [pan, tilt] of [[0, 0], [35, 0], [0, 40], [-120, 25]]) {
      const [aimed, untouched] = aimHeadParts([head, stand], pivot, pan, tilt);
      expect(untouched).toBe(stand);
      const [a, b] = aimed.corners;
      const modelled = unit([b.x - a.x, b.y - a.y, b.z - a.z]);
      const beam = resolveBeamAim({ rotation: 0, beamPanDeg: pan, beamTiltDeg: tilt }, 0).direction;
      expect(dot(modelled, beam)).toBeCloseTo(1, 9);
    }
  });

  it('aims a placed light head in world space with the element rotation', () => {
    const element: LightElement = { ...light, rotation: 90, beamPanDeg: 20, beamTiltDeg: 30 };
    const head: EquipmentPart = { color: '#fff', head: true, corners: [{ x: 0, y: 0, z: 1700 }, { x: 300, y: 0, z: 1700 }] };
    const [aimed] = aimedLightParts(element, [head], 20);
    const [a, b] = aimed.corners.map(p => placeLightPoint(element, 1, [p.x, p.y, p.z]));
    const forward = unit([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    expect(dot(forward, resolveBeamAim(element, 20).direction)).toBeCloseTo(1, 9);
  });

  it('round-trips a beam handle through the orthographic view and keeps the depth side', () => {
    const pose = sceneOrbitPose([], { angle: 30, tilt: 35, zoom: 1, panX: 0, panY: 0 }, 4 / 3);
    const pivot: Vec3 = [200, -100, 1700];
    const direction = unit([.3, -.5, -.6]);
    const tip = pivot.map((v, i) => v + AIM_HANDLE_LENGTH_MM * direction[i]) as Vec3;
    const pixel = projectOrthographic(pose, 800, 600, tip);
    const solved = directionFromScreen(pose, 800, 600, pivot, pixel, direction, AIM_HANDLE_LENGTH_MM);
    solved.forEach((v, i) => expect(v).toBeCloseTo(direction[i], 6));
    // Dragged to the same spot with the opposite depth side on record: the beam stays on that side.
    const flipped = directionFromScreen(pose, 800, 600, pivot, pixel, direction.map(v => -v) as Vec3, AIM_HANDLE_LENGTH_MM);
    expect(Math.sign(dot(flipped, pose.forward))).toBe(-Math.sign(dot(direction, pose.forward)));
    const projected = projectOrthographic(pose, 800, 600, flipped.map((v, i) => pivot[i] + AIM_HANDLE_LENGTH_MM * v) as Vec3);
    expect(projected[0]).toBeCloseTo(pixel[0], 6);
    expect(projected[1]).toBeCloseTo(pixel[1], 6);
  });

  it('lists beam handles for selected, visible light fixtures only', () => {
    const hiddenLayer: PlanLayer = { id: 'hidden', name: 'Hidden', visible: false, locked: false, order: 0 };
    const elements = [light, { ...light, id: 'other', layerId: 'hidden' }, { ...light, id: 'off', visible: false }];
    expect(lightAimTargets(elements, [hiddenLayer], grid, ['lamp', 'other', 'off'], 20).map(t => t.id)).toEqual(['lamp']);
    expect(lightAimTargets(elements, [hiddenLayer], grid, [], 20)).toEqual([]);
    const [target] = lightAimTargets(elements, [], grid, ['lamp'], 20);
    expect(target.pivot[0]).toBeCloseTo(1000, -2);
    expect(target.pivot[2]).toBeGreaterThan(1000);
    expect(Math.hypot(...target.direction)).toBeCloseTo(1);
  });

  it('marks lamp heads for aiming and keeps the stand separate', () => {
    const parts = lightPreview({ ...light, fixtureType: 'led_panel' });
    expect(parts.some(part => part.head)).toBe(true);
    expect(parts.some(part => !part.head)).toBe(true);
  });
});
