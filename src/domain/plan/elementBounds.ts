/**
 * The box an element actually occupies on the plan.
 *
 * Two places needed this and each wrote its own version against `as any`: the
 * canvas hit-test behind the context menu, and the print view's auto-fit for
 * the blueprint. They disagreed, and the print one was wrong.
 *
 * What it got wrong is worth recording, because both mistakes are the kind a
 * cast hides rather than causes:
 *
 *  - **It only ever grew the box rightwards and downwards.** The minimum came
 *    from `e.x` alone while the maximum came from `e.x2`, so a wall drawn
 *    right-to-left — a perfectly ordinary way to draw one — has `x2 < x`, and
 *    the computed box came out inverted. The printed blueprint then had a
 *    viewBox with negative width, and the plan printed empty or scrambled.
 *  - **It treated `width` as measured from the element's corner**, adding
 *    `e.x + width`. Everywhere the app DRAWS a sized element it centres the box
 *    on `(x, y)` (`x={-w / 2}`), so the real extent is `x ± width / 2`. The
 *    print fit clipped the left half of every prop and shape on the edge of a
 *    plan and left a matching band of blank paper on the right.
 *  - **`(e as any).x2 || …`** treated a genuine `x2` of `0` as missing.
 *
 * The fallbacks are for elements with no size of their own — a bare marker —
 * and are the CALLER's convention rather than a fact about the element, so they
 * are parameters. Rule 13 in spirit: this reports the extent it can prove and
 * lets the caller say what padding it wants around an unknown.
 */

import type { FloorPlanElement } from '../../types';
import { hasEndpoints, hasPath, hasSize } from './elementGuards';

export interface PlanBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Points a stroke element samples; checked rather than trusted. */
const strokePointsOf = (element: FloorPlanElement): Array<{ x: number; y: number }> => {
  const points = (element as { points?: unknown }).points;
  if (!Array.isArray(points)) return [];
  return points.filter(
    (point): point is { x: number; y: number } =>
      !!point &&
      typeof (point as { x?: unknown }).x === 'number' &&
      Number.isFinite((point as { x: number }).x) &&
      typeof (point as { y?: unknown }).y === 'number' &&
      Number.isFinite((point as { y: number }).y),
  );
};

export interface ElementBoundsOptions {
  /**
   * Half-extent used for an element that carries no size, endpoints or points
   * of its own — a camera, a light, an actor marker. Their glyphs are drawn at
   * a fixed screen size, so the plan has no stored extent to read.
   */
  markerHalfExtent?: number;
  /**
   * Whether a routed path (a camera move, a cable run) counts towards the box.
   * The hit-test wants the body only; the print fit wants the whole move in
   * frame, because a blocking beat that leaves the page is the one thing a
   * printed plan must not lose.
   */
  includePath?: boolean;
}

/**
 * The box one element occupies, or `null` when it has no usable position at
 * all — an import with a NaN `x` is reported as unknown rather than folded
 * into the total as a zero, which would drag every other element's fit towards
 * the origin.
 */
export const elementBounds = (
  element: FloorPlanElement,
  { markerHalfExtent = 20, includePath = false }: ElementBoundsOptions = {},
): PlanBounds | null => {
  if (!Number.isFinite(element.x) || !Number.isFinite(element.y)) return null;

  let minX = element.x;
  let minY = element.y;
  let maxX = element.x;
  let maxY = element.y;
  let sized = false;

  const grow = (x: number, y: number): void => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  if (hasEndpoints(element)) {
    grow(element.x2, element.y2);
    sized = true;
  }

  const points = strokePointsOf(element);
  if (points.length > 0) {
    for (const point of points) grow(point.x, point.y);
    sized = true;
  }

  if (hasSize(element)) {
    // Centred on (x, y): that is how every layer draws a sized element.
    grow(element.x - element.width / 2, element.y - element.height / 2);
    grow(element.x + element.width / 2, element.y + element.height / 2);
    sized = true;
  }

  if (includePath && hasPath(element)) {
    for (const point of element.path) grow(point.x, point.y);
    // A path alone is a real extent; a camera with a move is not a bare marker.
    if (element.path.length > 0) sized = true;
  }

  if (!sized) {
    minX -= markerHalfExtent;
    minY -= markerHalfExtent;
    maxX += markerHalfExtent;
    maxY += markerHalfExtent;
  }

  return { minX, minY, maxX, maxY };
};

/**
 * The box covering every element, or `null` when none of them has a usable
 * position. Callers decide what to show for an empty plan; returning a
 * plausible default box here would print a blank page as though it were a plan.
 */
export const elementsBounds = (
  elements: readonly FloorPlanElement[],
  options: ElementBoundsOptions = {},
): PlanBounds | null => {
  let total: PlanBounds | null = null;
  for (const element of elements) {
    const box = elementBounds(element, options);
    if (!box) continue;
    total = total
      ? {
          minX: Math.min(total.minX, box.minX),
          minY: Math.min(total.minY, box.minY),
          maxX: Math.max(total.maxX, box.maxX),
          maxY: Math.max(total.maxY, box.maxY),
        }
      : box;
  }
  return total;
};

/** Grow a box by an equal margin on every side. */
export const padBounds = (bounds: PlanBounds, pad: number): PlanBounds => ({
  minX: bounds.minX - pad,
  minY: bounds.minY - pad,
  maxX: bounds.maxX + pad,
  maxY: bounds.maxY + pad,
});

/** True when the point lies inside the box. */
export const boundsContain = (bounds: PlanBounds, x: number, y: number): boolean =>
  x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
