/**
 * Routed cable length, including the reach a MOVING device demands (plan §20).
 *
 * A cable drawn between two points is only as long as the plan says while
 * nothing moves. The moment one end is attached to a camera, actor, prop or
 * light that has a movement path, the run has to reach that device at its
 * furthest position — otherwise the cable is short on the take, which is
 * exactly the kind of thing a plan is supposed to catch.
 *
 * Lengths are plan pixels here; callers convert with the setup's
 * `pixelsPerUnit` at the display/export boundary (units policy, rule 14).
 * Planning aid only: real runs need dressing slack, service loops and a route
 * that avoids traffic (rule 15).
 */

import type { CableElement, FloorPlanElement, Waypoint } from '../../types';
import { getInterpolatedPositionAndRotation } from '../../utils/geometry';

export interface CableRunLength {
  /** Length of the drawn route, with every device at its authored position. */
  staticPx: number;
  /**
   * Longest the route ever gets across the beats of any attached moving
   * device. Equals `staticPx` when nothing attached to it moves.
   */
  maxPx: number;
  /** Beat at which `maxPx` occurs; 1 when nothing moves. */
  maxAtBeat: number;
  /** Ids of attached elements that actually have a movement path. */
  movingElementIds: string[];
}

const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(b.x - a.x, b.y - a.y);

/** Total length of a polyline through the given points. */
export const polylineLengthPx = (points: ReadonlyArray<{ x: number; y: number }>): number => {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1], points[i]);
  return total;
};

/** Start, routing points, end — the polyline the cable is actually drawn as. */
export const cableRoutePoints = (
  cable: Pick<CableElement, 'x' | 'y' | 'x2' | 'y2' | 'path'>,
  overrides: { from?: { x: number; y: number }; to?: { x: number; y: number } } = {},
): Array<{ x: number; y: number }> => [
  overrides.from ?? { x: cable.x, y: cable.y },
  ...(cable.path ?? []).map((point) => ({ x: point.x, y: point.y })),
  overrides.to ?? { x: cable.x2, y: cable.y2 },
];

/** Movement path of an element, or undefined when it does not move. */
const movementPathOf = (element: FloorPlanElement | undefined): Waypoint[] | undefined => {
  if (!element || !('path' in element)) return undefined;
  const path = (element as { path?: unknown }).path;
  if (!Array.isArray(path) || path.length === 0) return undefined;
  // Cable routing points are not movement waypoints — they carry no beat.
  if (!path.every((point) => typeof (point as Waypoint).beat === 'number')) return undefined;
  return path as Waypoint[];
};

/** Where an element sits at a given beat, following its movement path. */
const positionAtBeat = (
  element: FloorPlanElement,
  path: Waypoint[],
  beat: number,
): { x: number; y: number } =>
  getInterpolatedPositionAndRotation(
    { x: element.x, y: element.y },
    'rotation' in element ? element.rotation : 0,
    path,
    beat,
  ).position;

/**
 * Length of one cable run, accounting for attached devices that move.
 *
 * Both ends are checked: `fromElementId` / `toElementId` are followed into the
 * element list, and if either has a movement path the route is measured at
 * every beat that path touches. The longest result wins, because the cable has
 * to be long enough for the worst moment, not the average one.
 *
 * Only whole keyed beats are sampled. Easing between keyframes is monotonic per
 * segment for a straight-line route, so the extreme always lands on a keyframe.
 */
export const cableRunLength = (
  cable: CableElement,
  elements: ReadonlyArray<FloorPlanElement>,
): CableRunLength => {
  const staticPx = polylineLengthPx(cableRoutePoints(cable));

  const fromElement = cable.fromElementId
    ? elements.find((el) => el.id === cable.fromElementId)
    : undefined;
  const toElement = cable.toElementId
    ? elements.find((el) => el.id === cable.toElementId)
    : undefined;
  const fromPath = movementPathOf(fromElement);
  const toPath = movementPathOf(toElement);

  const movingElementIds: string[] = [];
  if (fromPath && fromElement) movingElementIds.push(fromElement.id);
  if (toPath && toElement) movingElementIds.push(toElement.id);

  if (movingElementIds.length === 0) {
    return { staticPx, maxPx: staticPx, maxAtBeat: 1, movingElementIds };
  }

  // Beat 1 is the authored pose; every keyframe beat is a candidate extreme.
  const beats = new Set<number>([1]);
  for (const waypoint of [...(fromPath ?? []), ...(toPath ?? [])]) beats.add(waypoint.beat);

  let maxPx = staticPx;
  let maxAtBeat = 1;
  for (const beat of [...beats].sort((a, b) => a - b)) {
    const from = fromPath && fromElement ? positionAtBeat(fromElement, fromPath, beat) : undefined;
    const to = toPath && toElement ? positionAtBeat(toElement, toPath, beat) : undefined;
    const lengthPx = polylineLengthPx(cableRoutePoints(cable, { from, to }));
    if (lengthPx > maxPx) {
      maxPx = lengthPx;
      maxAtBeat = beat;
    }
  }

  return { staticPx, maxPx, maxAtBeat, movingElementIds };
};

/** Plan pixels → metres at the setup's scale. Falls back to the 30px/m default. */
export const pxToMetres = (px: number, pixelsPerUnit = 30): number =>
  pixelsPerUnit > 0 ? px / pixelsPerUnit : px;
