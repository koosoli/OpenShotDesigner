import { describe, expect, it } from 'vitest';
import type { DoorElement, GridSettings, WallElement, WindowElement } from '../../types';
import { buildWallPreview, projectWallPreview } from '../plan/wallPreview';

const grid: GridSettings = { unit: 'm', pixelsPerUnit: 100, size: 20, snap: true, showGrid: true };
const wall: WallElement = {
  id: 'wall', type: 'wall', name: 'Wall', x: 0, y: 0, x2: 500, y2: 0, thickness: 20, rotation: 0,
};
const door: DoorElement = {
  id: 'door', type: 'door', name: 'Door', x: 100, y: 0, width: 90, rotation: 0,
  swingAngle: 90, swingDirection: 'left',
};
const window: WindowElement = {
  id: 'window', type: 'window', name: 'Window', x: 350, y: 0, width: 100, depth: 20, rotation: 0,
};

describe('wall preview', () => {
  it('preserves a lintel above a door and a sill and lintel around a window', () => {
    const solids = buildWallPreview([wall, door, window], undefined, grid);
    expect(solids.map(({ corners: [base, end, , , top] }) => [base.x, end.x, base.z, top.z])).toEqual([
      [0, 1000, 0, 2700],
      [1000, 1900, 2100, 2700],
      [1900, 3000, 0, 2700],
      [3000, 4000, 0, 900],
      [3000, 4000, 2100, 2700],
      [4000, 5000, 0, 2700],
    ]);
  });

  it('converts imperial calibration and preserves wall thickness', () => {
    const [solid] = buildWallPreview([wall], undefined, { ...grid, unit: 'ft', pixelsPerUnit: 50 });
    expect(solid.corners[1].x).toBeCloseTo(3048);
    expect(solid.corners[2].y - solid.corners[1].y).toBeCloseTo(121.92);
  });

  it('excludes hidden elements and rejects invalid scale', () => {
    expect(buildWallPreview([{ ...wall, visible: false }], undefined, grid)).toEqual([]);
    expect(buildWallPreview([wall], undefined, { ...grid, pixelsPerUnit: 0 })).toEqual([]);
    expect(buildWallPreview([wall, { ...door, visible: false }], undefined, grid)).toHaveLength(1);
  });

  it('projects visible faces and changes the projection when rotated', () => {
    const solids = buildWallPreview([wall], undefined, grid);
    const first = projectWallPreview(solids, 35);
    const rotated = projectWallPreview(solids, 125);
    expect(first?.faces).toHaveLength(3);
    expect(rotated?.faces).toHaveLength(3);
    expect(rotated?.faces[0].points).not.toBe(first?.faces[0].points);
    expect(projectWallPreview([], 0)).toBeNull();
  });
});
