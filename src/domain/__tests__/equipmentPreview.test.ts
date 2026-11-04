import { describe, expect, it } from 'vitest';
import type { CameraElement, GridSettings, LightElement, ShapeElement } from '../../types';
import { buildAssetPreview } from '../plan/assetPreview';
import { projectWallPreview } from '../plan/wallPreview';

const grid: GridSettings = { unit: 'm', pixelsPerUnit: 100, size: 20, snap: true, showGrid: true };
const camera: CameraElement = {
  id: 'camera', type: 'camera', name: 'Camera', x: 20, y: 30, rotation: 0,
  cameraLabel: 'A', color: '#0284c7', focalLength: 35, fovAngle: 48, sensorFormat: 'Super35',
  aspectRatio: '16:9', cameraHeight: 'Eye Level', rigType: 'Tripod', throwDistance: 200, path: [],
};
const light: LightElement = {
  id: 'light', type: 'light', name: 'Fresnel', x: 0, y: 0, rotation: 0,
  fixtureType: 'fresnel', colorTemp: 3200, intensity: 80, beamAngle: 45, throwDistance: 200,
};

describe('3D production equipment', () => {
  it('aims the lens along the plan heading and projects its face', () => {
    const solids = buildAssetPreview([camera], undefined, grid);
    const lens = solids.find(({ color }) => color === '#4e9aaf')!;
    expect(lens.corners.every(({ x }) => x > 200)).toBe(true);
    const rotated = buildAssetPreview([{ ...camera, rotation: 90 }], undefined, grid);
    const rotatedLens = rotated.find(({ color }) => color === lens.color)!;
    expect(rotatedLens.corners[0].y - 300).toBeCloseTo(lens.corners[0].x - 200);
    const lensIndex = solids.indexOf(lens);
    expect(projectWallPreview(solids, 90)?.faces.some(({ key }) => key === `${camera.id}-${lensIndex}-0`)).toBe(true);
  });

  it('uses distinct supports and honors the selected camera height', () => {
    const tripod = buildAssetPreview([camera], undefined, grid);
    const feet = (solids: typeof tripod) => solids.filter(({ corners }) => corners.some(({ z }) => z === 0));
    expect(feet(tripod)).toHaveLength(3);
    const pedestal = buildAssetPreview([{ ...camera, rigType: 'Broadcast Pedestal' }], undefined, grid);
    expect(feet(pedestal)).toHaveLength(4);
    const low = buildAssetPreview([{ ...camera, rigType: 'Handheld', cameraHeight: 'Ground' }], undefined, grid);
    expect(feet(low)).toHaveLength(0);
    expect(Math.max(...low.flatMap(({ corners }) => corners.map(({ z }) => z)))).toBeLessThan(500);
  });

  it('builds different fixture silhouettes and applies barn doors and gel color', () => {
    const fresnel = buildAssetPreview([light], undefined, grid);
    const withDoors = buildAssetPreview([{
      ...light, hasBarnDoors: true, modifiers: [{ id: 'gel', kind: 'gel', enabled: true, symbolId: 'lighting.modifier.gel', colorHex: '#dd33ff' }],
    }], undefined, grid);
    expect(withDoors).toHaveLength(fresnel.length + 4);
    expect(withDoors.some(({ color }) => color === '#dd33ff')).toBe(true);
    const panel = buildAssetPreview([{ ...light, fixtureType: 'led_panel', rgbColor: '#eeeeee' }], undefined, grid);
    const face = panel.find(({ color }) => color === '#eeeeee')!;
    expect(face.corners).toHaveLength(8);
    expect(Math.max(...face.corners.map(({ y }) => y))).toBeGreaterThan(240);
    const softbox = buildAssetPreview([{ ...light, fixtureType: 'softbox', rgbColor: '#eeeeee' }], undefined, grid);
    expect(Math.max(...softbox.find(({ color }) => color === '#eeeeee')!.corners.map(({ x }) => x))).toBeGreaterThan(450);
  });

  it.each(['lighting.led-par', 'lighting.moving-head-spot', 'lighting.moving-head-wash', 'broadcast.ptz-camera'])(
    'draws %s library placements as multiple parts on the floor', (symbolId) => {
      const symbol: ShapeElement = { id: 'symbol', type: 'shape', name: symbolId, shapeType: 'rectangle', symbolId,
        width: 40, height: 40, x: 0, y: 0, rotation: 90, color: '#ffffff' };
      const solids = buildAssetPreview([symbol], undefined, grid);
      expect(solids.length).toBeGreaterThan(3);
      const points = solids.flatMap(({ corners }) => corners);
      expect(Math.min(...points.map(({ z }) => z))).toBe(0);
      expect(points.every(({ x, y, z }) => [x, y, z].every(Number.isFinite))).toBe(true);
    },
  );
});
