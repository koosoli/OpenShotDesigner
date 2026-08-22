/**
 * Translating the point collections an element carries.
 *
 * Elements hold their geometry in three shapes that all mean "positions in
 * world space": `path` as `Waypoint[]` (actors, cameras, lights, props — beats
 * of a move), `path` as `CablePathPoint[]` (cable routing handles, no beats),
 * and `points` as `StrokePoint[]` (freehand ink). Dragging a group has to move
 * all three, and the canvas used to do it with `(el as any).path.map((wp: any)`
 * — which type-checks against nothing and silently accepts the wrong shape.
 *
 * Keeping the two `path` shapes distinct is deliberate: a cable handle has no
 * beat, and inventing one so the arrays could merge would put a meaningless
 * number into saved projects. Translation is the one operation both need, so
 * it is the one place they are handled together.
 */

import type {
  ActorElement,
  CablePathPoint,
  CameraElement,
  FloorPlanElement,
  LightElement,
  PropElement,
  StrokePoint,
  Waypoint,
} from '../../types';

/** Any point carrying world coordinates, whatever else it carries with them. */
type PositionedPoint = { x: number; y: number };

const shifted = <T extends PositionedPoint>(point: T, dx: number, dy: number): T => ({
  ...point,
  x: point.x + dx,
  y: point.y + dy,
});

/**
 * Move a movement path or a cable route by a delta, preserving whichever point
 * shape came in — beats, rotations and cues survive, ids are untouched.
 */
export function translatePath(path: Waypoint[], dx: number, dy: number): Waypoint[];
export function translatePath(path: CablePathPoint[], dx: number, dy: number): CablePathPoint[];
export function translatePath(
  path: Waypoint[] | CablePathPoint[],
  dx: number,
  dy: number,
): Waypoint[] | CablePathPoint[];
export function translatePath(
  path: Waypoint[] | CablePathPoint[],
  dx: number,
  dy: number,
): Waypoint[] | CablePathPoint[] {
  return (path as PositionedPoint[]).map((point) => shifted(point, dx, dy)) as
    | Waypoint[]
    | CablePathPoint[];
}

/** Move freehand ink by a delta; pressure and every other sample field survive. */
export const translateStrokePoints = (
  points: StrokePoint[],
  dx: number,
  dy: number,
): StrokePoint[] => points.map((point) => shifted(point, dx, dy));

/** The four element kinds whose `path` is a beat-carrying movement path. */
const WAYPOINT_PATH_TYPES: readonly string[] = ['actor', 'camera', 'light', 'prop'];

/**
 * True when this element's `path` is `Waypoint[]` rather than a cable route.
 *
 * Both kinds answer `'path' in el`, which is why the canvas reached for
 * `(el as any).path` at every waypoint-drag site: `in` narrowing leaves the two
 * shapes unioned, so writing `wp.rotation` needed a cast — and a cast that
 * would just as happily have written `rotation` onto a cable handle.
 */
export const hasWaypointPath = (
  el: FloorPlanElement,
): el is (ActorElement | CameraElement | LightElement | PropElement) & { path: Waypoint[] } =>
  WAYPOINT_PATH_TYPES.includes(el.type) && Array.isArray((el as { path?: unknown }).path);

/** Replace one waypoint by id, leaving every other beat untouched. */
export const patchWaypoint = (
  path: readonly Waypoint[],
  waypointId: string,
  updates: Partial<Omit<Waypoint, 'id'>>,
): Waypoint[] =>
  path.map((waypoint) => (waypoint.id === waypointId ? { ...waypoint, ...updates } : waypoint));
