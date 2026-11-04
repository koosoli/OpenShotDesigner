import { describe, expect, it } from 'vitest';
import type { DoorElement, WallElement, WindowElement } from '../../types';
import { fitOpeningOnWall, moveWallOpenings, snapOpeningToWall } from '../plan/editWallOpenings';
import { snapWallJunction, wallEndpointAtLength } from '../plan/wallDimensions';

const wall: WallElement = { id: 'wall', type: 'wall', name: 'Wall', x: 0, y: 0, x2: 200, y2: 0, rotation: 0, thickness: 12 };
const door: DoorElement = { id: 'door', type: 'door', name: 'Door', x: 40, y: 0, rotation: 0, width: 60, swingAngle: 90, swingDirection: 'left' };
const window: WindowElement = { id: 'window', type: 'window', name: 'Window', x: 150, y: 0, rotation: 0, width: 80, depth: 12 };

describe('wall opening edits', () => {
  it('fits the full opening and centers an inserted door around the requested point', () => {
    expect(fitOpeningOnWall(wall, 'door', 60, 100)).toEqual({ x: 70, y: 0, rotation: 0 });
    expect(snapOpeningToWall({ x: 195, y: 2 }, [wall], 'window', 60)?.point).toEqual({ x: 150, y: 0 });
    expect(snapOpeningToWall({ x: 30, y: 0 }, [{ ...wall, x2: 80 }], 'window', 60)).toBeNull();
  });

  it('moves both openings with a translated wall', () => {
    const moved = { ...wall, x: 10, y: 50, x2: 210, y2: 50 };
    expect(moveWallOpenings([wall, door, window], [moved, door, window])).toEqual([
      moved, { ...door, x: 50, y: 50 }, { ...window, x: 160, y: 50 },
    ]);
  });

  it('keeps the offset on rotation and clamps an opening on a shortened wall', () => {
    const rotated = { ...wall, x2: 0, y2: 130 };
    expect(moveWallOpenings([wall, door, window], [rotated, door, window])).toEqual([
      rotated, { ...door, x: 0, y: 40, rotation: 90 }, { ...window, x: 0, y: 90, rotation: 90 },
    ]);
  });

  it('leaves explicit edits and locked openings alone', () => {
    const locked = { ...window, locked: true };
    const moved = { ...wall, y: 10, y2: 10 };
    const explicitDoor = { ...door, y: 25 };
    expect(moveWallOpenings([wall, door, locked], [moved, explicitDoor, locked])).toEqual([moved, explicitDoor, locked]);
  });
});

describe('wall chain placement', () => {
  it('snaps a branch to the wall axis without extending past the wall ends', () => {
    expect(snapWallJunction({ x: 50, y: 5 }, [wall], 10)).toEqual({ x: 50, y: 0 });
    expect(snapWallJunction({ x: -5, y: 0 }, [wall], 10)).toBeNull();
  });

  it('places a calibrated length in the chosen direction', () => {
    expect(wallEndpointAtLength({ x: 10, y: 20 }, { x: 13, y: 24 }, 2, 50)).toEqual({ x: 70, y: 100 });
    expect(wallEndpointAtLength({ x: 10, y: 20 }, { x: 10, y: 20 }, 2, 50)).toBeNull();
  });
});
