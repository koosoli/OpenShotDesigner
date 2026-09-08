/**
 * The maths under the canvas.
 *
 * `geometry.ts` had no tests, which made it the highest-leverage gap in the
 * tree: every FOV cone, every snap, every blocking-animation frame and every
 * light beam is computed here, and the canvas that consumes it is the surface
 * users manipulate their data on. A silent error in `calculateFovAngle` does
 * not throw — it draws a lens that does not exist, and the DP finds out on the
 * day.
 *
 * These are pure functions, so the tests are cheap and exact. Where a value is
 * checkable against optics or trigonometry rather than against the
 * implementation, it is: the 50mm-on-Super35 figure below comes from the lens
 * formula, not from running the code and pasting the output. A test that only
 * records current behaviour cannot tell a fix from a regression.
 */
import { describe, expect, it } from 'vitest';
import {
  SENSOR_SIZES,
  calculateFovAngle,
  degToRad,
  findNearestWall,
  getAngleBetweenPoints,
  getCameraFovPolygon,
  getClosestPointOnSegment,
  getDistance,
  getInterpolatedPositionAndRotation,
  getLightBeamPolygon,
  isPointInCameraFov,
  lerpAngleDeg,
  radToDeg,
  rotatePoint,
  smoothstepProgress,
  snapToGrid,
} from '../geometry';
import type { Waypoint } from '../../types';

const closeTo = (value: number, expected: number, precision = 1) =>
  expect(value).toBeCloseTo(expected, precision);

describe('calculateFovAngle', () => {
  it('matches the lens formula for a 50mm on Super 35', () => {
    // 2 * atan(24.89 / (2 * 50)) = 27.954°, reported to one decimal.
    expect(calculateFovAngle(50, 'Super35')).toBe(28);
  });

  it('matches the lens formula for a 50mm on full frame', () => {
    // 2 * atan(36 / (2 * 50)) = 39.60°
    closeTo(calculateFovAngle(50, 'FullFrame'), 39.6);
  });

  it('widens as focal length shortens', () => {
    const wide = calculateFovAngle(18, 'Super35');
    const normal = calculateFovAngle(50, 'Super35');
    const long = calculateFovAngle(135, 'Super35');
    expect(wide).toBeGreaterThan(normal);
    expect(normal).toBeGreaterThan(long);
  });

  it('gives a larger sensor a wider view at the same focal length', () => {
    // The crop-factor relationship every DP relies on when switching bodies.
    expect(calculateFovAngle(35, 'LargeFormat')).toBeGreaterThan(calculateFovAngle(35, 'FullFrame'));
    expect(calculateFovAngle(35, 'FullFrame')).toBeGreaterThan(calculateFovAngle(35, 'Super35'));
    expect(calculateFovAngle(35, 'Super35')).toBeGreaterThan(calculateFovAngle(35, 'MFT'));
  });

  it('defaults to Super 35 when no sensor is given', () => {
    expect(calculateFovAngle(50)).toBe(calculateFovAngle(50, 'Super35'));
  });

  it('knows a real width for every sensor format it offers', () => {
    for (const [name, size] of Object.entries(SENSOR_SIZES)) {
      expect(size.width, name).toBeGreaterThan(0);
      expect(size.height, name).toBeGreaterThan(0);
      expect(size.width, name).toBeGreaterThan(size.height);
    }
  });
});

describe('angle conversion and rotation', () => {
  it('round-trips degrees through radians', () => {
    for (const deg of [0, 30, 90, 179.5, 270, 360]) {
      closeTo(radToDeg(degToRad(deg)), deg, 6);
    }
  });

  it('rotates a point a quarter turn about a centre', () => {
    const rotated = rotatePoint({ x: 10, y: 0 }, { x: 0, y: 0 }, 90);
    closeTo(rotated.x, 0, 6);
    closeTo(rotated.y, 10, 6);
  });

  it('leaves the centre of rotation where it is', () => {
    const centre = { x: 42, y: -7 };
    const rotated = rotatePoint(centre, centre, 137);
    closeTo(rotated.x, centre.x, 6);
    closeTo(rotated.y, centre.y, 6);
  });

  it('preserves distance from the centre', () => {
    const centre = { x: 5, y: 5 };
    const point = { x: 25, y: 12 };
    const rotated = rotatePoint(point, centre, 63);
    closeTo(getDistance(centre, rotated), getDistance(centre, point), 6);
  });

  it('reports the angle between two points in [0, 360)', () => {
    const origin = { x: 0, y: 0 };
    closeTo(getAngleBetweenPoints(origin, { x: 10, y: 0 }), 0);
    closeTo(getAngleBetweenPoints(origin, { x: 0, y: 10 }), 90);
    closeTo(getAngleBetweenPoints(origin, { x: -10, y: 0 }), 180);
    // Never negative: the canvas feeds this straight into a rotation value.
    closeTo(getAngleBetweenPoints(origin, { x: 0, y: -10 }), 270);
  });
});

describe('snapToGrid', () => {
  it('snaps to the nearest step when enabled', () => {
    expect(snapToGrid(47, 20, true)).toBe(40);
    expect(snapToGrid(51, 20, true)).toBe(60);
  });

  it('passes the value through untouched when disabled', () => {
    expect(snapToGrid(47.3, 20, false)).toBe(47.3);
  });

  it('refuses to divide by a zero or negative grid', () => {
    // A zero grid size reaches here from a cleared settings field; returning
    // NaN would put an un-renderable element on the plan.
    expect(snapToGrid(47.3, 0, true)).toBe(47.3);
    expect(snapToGrid(47.3, -10, true)).toBe(47.3);
  });

  it('snaps negative coordinates symmetrically', () => {
    expect(snapToGrid(-47, 20, true)).toBe(-40);
  });
});

describe('getDistance and getClosestPointOnSegment', () => {
  it('measures a 3-4-5 triangle', () => {
    expect(getDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('drops a perpendicular onto the middle of a segment', () => {
    const result = getClosestPointOnSegment({ x: 50, y: 30 }, { x: 0, y: 0 }, { x: 100, y: 0 });
    closeTo(result.point.x, 50);
    closeTo(result.point.y, 0);
    closeTo(result.distance, 30);
  });

  it('keeps the foot inside the wall rather than on its corner', () => {
    // Deliberately clamped to t in [0.08, 0.92], not [0, 1]: a projection that
    // lands exactly on an endpoint makes an element snap to the corner where
    // two walls meet and then flicker between them. Pinned because the 8%
    // inset is surprising enough to look like a bug to the next reader.
    const before = getClosestPointOnSegment({ x: -40, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 });
    closeTo(before.point.x, 8);
    const after = getClosestPointOnSegment({ x: 400, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 });
    closeTo(after.point.x, 92);
    expect(before.t).toBeGreaterThan(0);
    expect(after.t).toBeLessThan(1);
  });

  it('handles a zero-length segment without producing NaN', () => {
    // Two wall endpoints can coincide while a user is still drawing the run.
    const result = getClosestPointOnSegment({ x: 10, y: 10 }, { x: 5, y: 5 }, { x: 5, y: 5 });
    expect(Number.isNaN(result.distance)).toBe(false);
    expect(Number.isNaN(result.point.x)).toBe(false);
  });
});

describe('findNearestWall', () => {
  const walls = [
    { id: 'north', x: 0, y: 0, x2: 400, y2: 0 },
    { id: 'east', x: 400, y: 0, x2: 400, y2: 300 },
  ];

  it('picks the closer of two walls', () => {
    const hit = findNearestWall({ x: 380, y: 150 }, walls, 60);
    expect(hit?.wallId).toBe('east');
  });

  it('returns null when nothing is within the snap threshold', () => {
    expect(findNearestWall({ x: 200, y: 150 }, walls, 40)).toBeNull();
  });

  it('respects a widened threshold', () => {
    expect(findNearestWall({ x: 200, y: 150 }, walls, 200)?.wallId).toBe('north');
  });

  it('returns null for an empty plan rather than throwing', () => {
    expect(findNearestWall({ x: 0, y: 0 }, [])).toBeNull();
  });
});

describe('isPointInCameraFov', () => {
  const camera = { x: 0, y: 0 };

  it('frames a subject on the lens axis dead centre', () => {
    const result = isPointInCameraFov({ x: 100, y: 0 }, camera, 0, 40, 500);
    expect(result.inFrame).toBe(true);
    closeTo(result.normalizedX, 0, 6);
    closeTo(result.distance, 100);
  });

  it('places a subject at the cone edge at the frame edge', () => {
    // 20° off axis with a 40° horizontal FOV is exactly the right-hand edge.
    const result = isPointInCameraFov({ x: 100, y: 100 * Math.tan(degToRad(20)) }, camera, 0, 40, 500);
    expect(result.inFrame).toBe(true);
    closeTo(result.normalizedX, 1, 3);
  });

  it('signs the two sides of frame oppositely', () => {
    const right = isPointInCameraFov({ x: 100, y: 40 }, camera, 0, 60, 500);
    const left = isPointInCameraFov({ x: 100, y: -40 }, camera, 0, 60, 500);
    expect(right.normalizedX).toBeGreaterThan(0);
    expect(left.normalizedX).toBeLessThan(0);
  });

  it('excludes a subject outside the cone', () => {
    expect(isPointInCameraFov({ x: 100, y: 200 }, camera, 0, 30, 500).inFrame).toBe(false);
  });

  it('excludes a subject beyond the throw distance but still reports how far', () => {
    const result = isPointInCameraFov({ x: 900, y: 0 }, camera, 0, 40, 500);
    expect(result.inFrame).toBe(false);
    closeTo(result.distance, 900);
  });

  it('follows the camera when it is turned', () => {
    const subject = { x: 0, y: 100 };
    expect(isPointInCameraFov(subject, camera, 0, 40, 500).inFrame).toBe(false);
    expect(isPointInCameraFov(subject, camera, 90, 40, 500).inFrame).toBe(true);
  });

  it('handles a rotation that wraps past 360 the same as its equivalent', () => {
    const subject = { x: 100, y: 0 };
    expect(isPointInCameraFov(subject, camera, 720, 40, 500).inFrame).toBe(
      isPointInCameraFov(subject, camera, 0, 40, 500).inFrame,
    );
  });
});

describe('getCameraFovPolygon', () => {
  it('puts both cone edges on the throw radius', () => {
    const camera = { x: 100, y: 100 };
    const { leftPt, rightPt, centerPt } = getCameraFovPolygon(camera, 0, 40, 250);
    closeTo(getDistance(camera, leftPt), 250, 6);
    closeTo(getDistance(camera, rightPt), 250, 6);
    closeTo(getDistance(camera, centerPt), 250, 6);
  });

  it('separates the edges by exactly the FOV angle', () => {
    const camera = { x: 0, y: 0 };
    const { leftPt, rightPt } = getCameraFovPolygon(camera, 30, 40, 250);
    const spread =
      getAngleBetweenPoints(camera, rightPt) - getAngleBetweenPoints(camera, leftPt);
    closeTo(((spread % 360) + 360) % 360, 40, 3);
  });

  it('emits an SVG path that closes back to the camera', () => {
    const { pathString } = getCameraFovPolygon({ x: 10, y: 20 }, 0, 40, 100);
    expect(pathString.startsWith('M 10 20')).toBe(true);
    expect(pathString.trim().endsWith('Z')).toBe(true);
    expect(pathString).not.toMatch(/NaN/);
  });
});

describe('getLightBeamPolygon', () => {
  it('emits a closed path with no NaN for a realistic fixture', () => {
    const path = getLightBeamPolygon({ x: 50, y: 60 }, 135, 55, 400);
    expect(path.startsWith('M 50 60')).toBe(true);
    expect(path.trim().endsWith('Z')).toBe(true);
    expect(path).not.toMatch(/NaN/);
  });

  it('survives a zero beam angle rather than producing NaN', () => {
    // A fixture profile with no documented beam angle reaches here as 0.
    expect(getLightBeamPolygon({ x: 0, y: 0 }, 0, 0, 100)).not.toMatch(/NaN/);
  });
});

describe('smoothstepProgress', () => {
  it('pins both ends and eases the middle', () => {
    expect(smoothstepProgress(0)).toBe(0);
    expect(smoothstepProgress(1)).toBe(1);
    closeTo(smoothstepProgress(0.5), 0.5, 6);
  });

  it('clamps out-of-range progress instead of overshooting', () => {
    expect(smoothstepProgress(-3)).toBe(0);
    expect(smoothstepProgress(4)).toBe(1);
  });

  it('starts and ends slower than linear', () => {
    expect(smoothstepProgress(0.2)).toBeLessThan(0.2);
    expect(smoothstepProgress(0.8)).toBeGreaterThan(0.8);
  });
});

describe('lerpAngleDeg', () => {
  it('takes the short way round across the 0/360 seam', () => {
    // 350° -> 10° is a 20° move forwards, not a 340° move backwards.
    closeTo(lerpAngleDeg(350, 10, 0.5), 0, 6);
  });

  it('stays within [0, 360)', () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const value = lerpAngleDeg(350, 10, t);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(360);
    }
  });

  it('returns the endpoints exactly', () => {
    closeTo(lerpAngleDeg(30, 200, 0), 30, 6);
    closeTo(lerpAngleDeg(30, 200, 1), 200, 6);
  });
});

describe('getInterpolatedPositionAndRotation', () => {
  const start = { x: 0, y: 0 };
  const waypoints: Waypoint[] = [
    { id: 'wp-1', x: 100, y: 0, beat: 3, rotation: 90 },
    { id: 'wp-2', x: 100, y: 100, beat: 5, rotation: 180 },
  ];

  it('holds the start pose before the move begins', () => {
    const result = getInterpolatedPositionAndRotation(start, 0, waypoints, 1);
    expect(result.position).toEqual(start);
    expect(result.rotation).toBe(0);
  });

  it('holds the final pose after the last beat', () => {
    const result = getInterpolatedPositionAndRotation(start, 0, waypoints, 99);
    expect(result.position).toEqual({ x: 100, y: 100 });
    expect(result.rotation).toBe(180);
  });

  it('lands exactly on a waypoint at its own beat', () => {
    const result = getInterpolatedPositionAndRotation(start, 0, waypoints, 3);
    closeTo(result.position.x, 100, 6);
    closeTo(result.position.y, 0, 6);
    closeTo(result.rotation, 90, 6);
  });

  it('eases between two waypoints rather than jumping', () => {
    const midway = getInterpolatedPositionAndRotation(start, 0, waypoints, 4);
    // Halfway in beats between wp-1 (beat 3) and wp-2 (beat 5).
    closeTo(midway.position.y, 50, 6);
    closeTo(midway.rotation, 135, 6);
  });

  it('stays on the start pose when there are no waypoints at all', () => {
    const result = getInterpolatedPositionAndRotation(start, 45, [], 7);
    expect(result.position).toEqual(start);
    expect(result.rotation).toBe(45);
  });

  it('sorts waypoints authored out of order by beat', () => {
    // The inspector lets a beat be edited after the fact, so the stored array
    // is not guaranteed to be in playback order.
    const scrambled: Waypoint[] = [waypoints[1], waypoints[0]];
    const ordered = getInterpolatedPositionAndRotation(start, 0, waypoints, 4);
    const shuffled = getInterpolatedPositionAndRotation(start, 0, scrambled, 4);
    expect(shuffled).toEqual(ordered);
  });

  it('inherits the initial rotation for a waypoint that has none', () => {
    const noRotation: Waypoint[] = [{ id: 'wp-1', x: 50, y: 0, beat: 3 }];
    const result = getInterpolatedPositionAndRotation(start, 25, noRotation, 3);
    closeTo(result.rotation, 25, 6);
  });

  it('does not divide by zero when two waypoints share a beat', () => {
    const collided: Waypoint[] = [
      { id: 'a', x: 10, y: 0, beat: 3, rotation: 0 },
      { id: 'b', x: 90, y: 0, beat: 3, rotation: 90 },
    ];
    const result = getInterpolatedPositionAndRotation(start, 0, collided, 3);
    expect(Number.isNaN(result.position.x)).toBe(false);
    expect(Number.isNaN(result.rotation)).toBe(false);
  });
});
