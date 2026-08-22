import { describe, expect, it } from 'vitest';
import type { ActorElement, CableElement, CablePathPoint, FloorPlanElement, Waypoint } from '../../types';
import {
  hasWaypointPath,
  patchWaypoint,
  translatePath,
  translateStrokePoints,
} from '../plan/translate';

const waypoints: Waypoint[] = [
  { id: 'wp1', x: 10, y: 20, beat: 1, rotation: 90, dialogueCue: 'Enters' },
  { id: 'wp2', x: 40, y: 60, beat: 2 },
];

const cableRoute: CablePathPoint[] = [
  { id: 'cp1', x: 5, y: 5 },
  { id: 'cp2', x: 15, y: 25 },
];

describe('translatePath', () => {
  it('moves every point by the delta', () => {
    expect(translatePath(waypoints, 5, -5).map((p) => [p.x, p.y])).toEqual([
      [15, 15],
      [45, 55],
    ]);
  });

  it('keeps everything a waypoint carries besides its position', () => {
    const [first] = translatePath(waypoints, 1, 1);
    expect(first).toMatchObject({ id: 'wp1', beat: 1, rotation: 90, dialogueCue: 'Enters' });
  });

  it('does not invent a beat when moving a cable route', () => {
    const moved = translatePath(cableRoute, 2, 3);
    expect(moved).toEqual([
      { id: 'cp1', x: 7, y: 8 },
      { id: 'cp2', x: 17, y: 28 },
    ]);
    expect(moved[0]).not.toHaveProperty('beat');
  });

  it('does not mutate the input', () => {
    translatePath(waypoints, 100, 100);
    expect(waypoints[0]).toMatchObject({ x: 10, y: 20 });
  });
});

describe('translateStrokePoints', () => {
  it('moves samples and keeps their pressure', () => {
    expect(translateStrokePoints([{ x: 1, y: 2, pressure: 0.4 }], 3, 4)).toEqual([
      { x: 4, y: 6, pressure: 0.4 },
    ]);
  });
});

describe('hasWaypointPath', () => {
  const actor = { id: 'a', type: 'actor', x: 0, y: 0, rotation: 0, name: 'A', path: waypoints } as ActorElement;
  const cable = { id: 'c', type: 'cable', x: 0, y: 0, x2: 1, y2: 1, rotation: 0, name: 'C', path: cableRoute } as unknown as CableElement;
  const pathless = { id: 'w', type: 'wall', x: 0, y: 0, x2: 1, y2: 1, rotation: 0, name: 'W', thickness: 10 } as FloorPlanElement;

  it('accepts a movement path', () => {
    expect(hasWaypointPath(actor)).toBe(true);
  });

  it('rejects a cable route, which answers the same `path in el` check', () => {
    expect(hasWaypointPath(cable)).toBe(false);
  });

  it('rejects an element with no path at all', () => {
    expect(hasWaypointPath(pathless)).toBe(false);
  });

  it('rejects a light that has never been given a path', () => {
    const light = { id: 'l', type: 'light', x: 0, y: 0, rotation: 0, name: 'L' } as unknown as FloorPlanElement;
    expect(hasWaypointPath(light)).toBe(false);
  });
});

describe('patchWaypoint', () => {
  it('changes only the named beat', () => {
    const next = patchWaypoint(waypoints, 'wp2', { rotation: 45 });
    expect(next[1]).toMatchObject({ id: 'wp2', beat: 2, rotation: 45 });
    expect(next[0]).toEqual(waypoints[0]);
  });

  it('leaves the path alone when the id is not in it', () => {
    expect(patchWaypoint(waypoints, 'missing', { x: 999 })).toEqual(waypoints);
  });
});
