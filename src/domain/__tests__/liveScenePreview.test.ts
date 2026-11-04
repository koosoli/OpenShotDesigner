import { describe, expect, it } from 'vitest';
import type { ActorElement, GridSettings, PropElement, ShapeElement, WallElement } from '../../types';
import { buildAssetPreview } from '../plan/assetPreview';
import { resolveStraightWallJoins, wallLines, wallSpanCorners } from '../plan/straightWallJoins';
import { projectWallPreview } from '../plan/wallPreview';

const wall: WallElement = { id: 'a', type: 'wall', name: 'Wall', x: 0, y: 0, x2: 1000, y2: 0, thickness: 200, rotation: 0 };
const grid: GridSettings = { unit: 'm', pixelsPerUnit: 100, size: 20, snap: true, showGrid: true };

describe('straight wall join port', () => {
  it('uses the same miter edge for both walls in an L', () => {
    const lines = wallLines([wall, { ...wall, id: 'b', x: 1000, x2: 1000, y2: 1000 }]);
    const joins = resolveStraightWallJoins(lines);
    const a = wallSpanCorners(lines[0], 0, 1, joins.get('a'));
    const b = wallSpanCorners(lines[1], 0, 1, joins.get('b'));
    expect(a[1]).toEqual(b[0]);
    expect(a[2]).toEqual(b[3]);
    expect(a[1]).toEqual({ x: 1100, y: -100 });
    expect(a[2]).toEqual({ x: 900, y: 100 });
  });

  it('cuts the branch against the near face of a T host', () => {
    const lines = wallLines([wall, { ...wall, id: 'b', x: 500, x2: 500, y2: 1000 }]);
    const joins = resolveStraightWallJoins(lines);
    const branch = wallSpanCorners(lines[1], 0, 1, joins.get('b'));
    expect([branch[0].y, branch[3].y]).toEqual([100, 100]);
    expect(joins.get('a')).toEqual({ start: [0, 0], end: [0, 0] });
  });
});

describe('live scene projection', () => {
  it('uses actor height and asset footprints at plan scale, and skips hidden assets', () => {
    const actor: ActorElement = {
      id: 'actor', type: 'actor', name: 'Actor', characterLetter: 'A', color: '#fff', heightCm: 180,
      x: 100, y: 0, rotation: 0, isStanding: true, path: [],
    };
    const shape: ShapeElement = {
      id: 'asset', type: 'shape', name: 'DJ booth', x: 0, y: 0, rotation: 0,
      color: '#fff', shapeType: 'rectangle', width: 140, height: 60, symbolId: 'audio.dj-booth',
    };
    const solids = buildAssetPreview([actor, shape, { ...shape, id: 'hidden', visible: false }], undefined, grid);
    expect(solids).toHaveLength(5);
    expect(Math.max(...solids[3].corners.map((corner) => corner.z))).toBeCloseTo(1800);
    expect(solids[4].corners[1].x - solids[4].corners[0].x).toBe(1400);
    expect(projectWallPreview(solids, 35, 70)?.viewBox).not.toBe(projectWallPreview(solids, 35, 25)?.viewBox);
  });
});

describe('ConstructCAD furniture', () => {
  const prop: PropElement = {
    id: 'furniture', type: 'prop', propType: 'chair', name: 'Furniture',
    x: 0, y: 0, rotation: 90, width: 110, height: 55,
  };

  it.each([
    ['table_rect', 5, 750],
    ['chair', 6, 900],
    ['sofa', 4, 850],
    ['armchair', 4, 850],
    ['bed', 3, 1100],
    ['bed_king', 3, 1100],
    ['nightstand', 5, 550],
    ['desk', 3, 750],
    ['wardrobe', 2, 2300],
    ['bookshelf', 8, 1800],
    ['kitchen_counter', 3, 900],
    ['kitchen_island', 3, 900],
  ] as const)('uses %s geometry and matches the rotated plan footprint', (propType, count, height) => {
    const solids = buildAssetPreview([{ ...prop, propType }], undefined, grid);
    const points = solids.flatMap((solid) => solid.corners);
    const xs = points.map(({ x }) => x);
    const ys = points.map(({ y }) => y);
    expect(solids).toHaveLength(count);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(550);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(1100);
    expect(Math.max(...points.map(({ z }) => z))).toBe(height);

    const resized = buildAssetPreview([{ ...prop, propType, width: 175 }], undefined, grid);
    const resizedYs = resized.flatMap(({ corners }) => corners.map(({ y }) => y));
    expect(Math.max(...resizedYs) - Math.min(...resizedYs)).toBeCloseTo(1750);
  });

  it('renders the pedestal table with circular parts and preserves chairs in the dining set', () => {
    const table: ShapeElement = {
      id: 'table', type: 'shape', name: 'Round Pedestal Table', symbolId: 'arch.round-table',
      shapeType: 'rectangle', x: 0, y: 0, rotation: 0, width: 100, height: 100, color: '#78350f',
    };
    const pedestal = buildAssetPreview([table], undefined, grid);
    expect(pedestal.map(({ corners }) => corners.length)).toEqual([48, 48, 48]);
    expect(projectWallPreview(pedestal, 35)?.faces.length).toBeGreaterThan(10);

    const diningSet = buildAssetPreview([{ ...prop, propType: 'table_round', rotation: 0, width: 150, height: 150 }], undefined, grid);
    expect(diningSet).toHaveLength(27);
    expect(diningSet[0].corners[0].x).toBeCloseTo(435);
    expect(diningSet.slice(3).every(({ corners }) => corners.length === 8)).toBe(true);
  });

  it('places the wall cabinet above the floor at the source elevation', () => {
    const cabinet: ShapeElement = {
      id: 'cabinet', type: 'shape', name: 'Wall Cabinet', symbolId: 'arch.wall-cabinet',
      shapeType: 'rectangle', x: 0, y: 0, rotation: 0, width: 80, height: 35, color: '#78350f',
    };
    const corners = buildAssetPreview([cabinet], undefined, grid)[0].corners;
    expect(Math.min(...corners.map(({ z }) => z))).toBe(1500);
    expect(Math.max(...corners.map(({ z }) => z))).toBe(2200);
  });

  it('renders the existing sofa symbol with its back facing the same way as in plan', () => {
    const sofa: ShapeElement = {
      id: 'sofa', type: 'shape', name: 'Sofa', symbolId: 'arch.sofa', shapeType: 'rectangle',
      x: 0, y: 0, rotation: 0, width: 210, height: 90, color: '#475569',
    };
    const pieces = buildAssetPreview([sofa], undefined, grid);
    expect(pieces).toHaveLength(4);
    const back = pieces.flatMap(({ corners }) => corners).filter(({ z }) => z === 850);
    expect(back).toHaveLength(4);
    expect(back.every(({ y }) => y < 0)).toBe(true);
  });
});
