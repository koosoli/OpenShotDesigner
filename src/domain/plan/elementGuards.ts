/**
 * Narrowing a floor-plan element to what it actually is.
 *
 * `FloorPlanElement` is a discriminated union, but a lot of the canvas asks a
 * question the discriminant does not answer directly: "does this element have a
 * second endpoint?", "does it have a width and height?". A wall, a track, a
 * road, a measurement and an arrow all have `x2`/`y2` while sharing no common
 * type name, so code that drags an endpoint was written as `(el as any).x2`.
 *
 * Those casts are not a style problem. `as any` silences the compiler for the
 * WHOLE expression, so `(el as any).x2` keeps compiling after `x2` is renamed,
 * removed, or made optional — and the failure arrives at runtime as NaN
 * coordinates, which draw as an element that has quietly vanished. A guard
 * costs the same at the call site and keeps the check.
 *
 * Structural rather than type-name based on purpose: the question really is
 * "does this element carry endpoints", and answering it by listing type names
 * means every new two-point element has to remember to add itself here.
 */

import type { FloorPlanElement } from '../../types';

/** An element with a second endpoint: walls, tracks, roads, measurements, arrows. */
export type ElementWithEndpoints = FloorPlanElement & { x2: number; y2: number };

/** An element with its own box: props, shapes, text, images. */
export type ElementWithSize = FloorPlanElement & { width: number; height: number };

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * True when the element has a usable second endpoint.
 *
 * Requires the numbers to be finite, not merely present: a half-written import
 * can carry `x2: null` or `x2: NaN`, and treating that as an endpoint produces
 * NaN geometry that silently removes the element from the canvas.
 */
export const hasEndpoints = (
  element: FloorPlanElement | undefined | null,
): element is ElementWithEndpoints =>
  !!element &&
  isFiniteNumber((element as { x2?: unknown }).x2) &&
  isFiniteNumber((element as { y2?: unknown }).y2);

/** True when the element carries its own width and height. */
export const hasSize = (
  element: FloorPlanElement | undefined | null,
): element is ElementWithSize =>
  !!element &&
  isFiniteNumber((element as { width?: unknown }).width) &&
  isFiniteNumber((element as { height?: unknown }).height);

/**
 * The element's second endpoint, or a sensible one derived from its position.
 *
 * The fallback is the canvas's existing convention for an element that should
 * have endpoints but does not yet — a horizontal run to the right — kept here
 * so the several places that needed it stop each inventing their own.
 */
export const endpointsOf = (
  element: FloorPlanElement,
  fallbackLength = 240,
): { x1: number; y1: number; x2: number; y2: number } => ({
  x1: element.x,
  y1: element.y,
  x2: hasEndpoints(element) ? element.x2 : element.x + fallbackLength,
  y2: hasEndpoints(element) ? element.y2 : element.y,
});

/** Length of a two-point element, 0 when it has no endpoints. */
export const elementLength = (element: FloorPlanElement): number => {
  if (!hasEndpoints(element)) return 0;
  return Math.hypot(element.x2 - element.x, element.y2 - element.y);
};

/** A point on a camera path or cable route. */
export interface PlanPathPoint {
  x: number;
  y: number;
}

/** An element that carries a routed path: cameras with moves, routed cables. */
export type ElementWithPath = FloorPlanElement & { path: PlanPathPoint[] };

/**
 * True when the element carries a path of waypoints.
 *
 * Checks the array's points too, not just that it is an array: a path holding
 * a malformed point produces NaN geometry, and the bounds it feeds silently
 * expand to infinity — which reads on screen as "the canvas will not zoom to
 * fit any more" rather than as an error anyone can trace.
 */
export const hasPath = (
  element: FloorPlanElement | undefined | null,
): element is ElementWithPath => {
  const path = (element as { path?: unknown } | undefined | null)?.path;
  return (
    Array.isArray(path) &&
    path.every(
      (point) =>
        !!point &&
        isFiniteNumber((point as { x?: unknown }).x) &&
        isFiniteNumber((point as { y?: unknown }).y),
    )
  );
};
