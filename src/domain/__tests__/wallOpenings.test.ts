import { describe, expect, it } from 'vitest';
import type { DoorElement, WallElement, WindowElement } from '../../types';
import { resolveWallOpenings, solidWallSpans } from '../plan/wallOpenings';

const wall: WallElement = {
  id: 'wall', type: 'wall', name: 'Wall', x: 0, y: 0, x2: 200, y2: 0, thickness: 24, rotation: 0,
};
const door: DoorElement = {
  id: 'door', type: 'door', name: 'Door', x: 20, y: 0, width: 60, rotation: 0,
  swingAngle: 90, swingDirection: 'left',
};
const window: WindowElement = {
  id: 'window', type: 'window', name: 'Window', x: 100, y: 0, width: 60, depth: 12, rotation: 180,
};

describe('wall openings', () => {
  it('uses the jamb for doors and the center for windows, merging overlapping cuts', () => {
    const openings = resolveWallOpenings([wall], [door, window]).get(wall.id) ?? [];
    expect(openings).toEqual([
      { elementId: 'door', kind: 'door', start: 0.1, end: 0.4 },
      { elementId: 'window', kind: 'window', start: 0.35, end: 0.65 },
    ]);
    expect(solidWallSpans(openings)).toEqual([{ start: 0, end: 0.1 }, { start: 0.65, end: 1 }]);
  });

  it('supports a reversed door on a diagonal wall', () => {
    const diagonal = { ...wall, x2: 100, y2: 100 };
    const reversed = { ...door, x: 75, y: 75, width: Math.hypot(50, 50), rotation: 225 };
    const [opening] = resolveWallOpenings([diagonal], [reversed]).get(wall.id) ?? [];
    expect(opening.start).toBeCloseTo(0.25);
    expect(opening.end).toBeCloseTo(0.75);
  });

  it.each([
    { x: 180 },
    { y: 12 },
    { rotation: 90 },
  ])('leaves the wall intact when the door is not aligned and contained (%j)', (patch) => {
    const openings = resolveWallOpenings([wall], [{ ...door, ...patch }]);
    expect(openings.size).toBe(0);
    expect(solidWallSpans([])).toEqual([{ start: 0, end: 1 }]);
  });
});
