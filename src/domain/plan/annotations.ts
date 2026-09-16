/**
 * Callout annotations pinned to plan elements (plan §6.2).
 *
 * An annotation is a regular {@link FloorPlanElement} of type `'annotation'`:
 * its own `x`/`y` is the freely-movable text anchor and the leader line is
 * derived at render time from the target element to that anchor. All geometry
 * here is pure so the canvas, the printable blueprint and the PNG export all
 * draw the same line from the same numbers (rule 4).
 *
 * Missing data stays unknown (rule 13): when the target element cannot be
 * found the helpers return `null` and the renderer draws the text detached
 * rather than inventing an anchor.
 */

import type { AnnotationElement, FloorPlanElement, Vector2D } from '../../types';
import { createId } from '../ids';

/** Faint-by-default leader line, per the annotation spec. */
export const DEFAULT_ANNOTATION_LINE_COLOR = '#94a3b8';
export const DEFAULT_ANNOTATION_LINE_WIDTH = 1;
export const DEFAULT_ANNOTATION_LINE_OPACITY = 0.25;

export const DEFAULT_ANNOTATION_FONT_SIZE = 14;
export const DEFAULT_ANNOTATION_COLOR = '#e2e8f0';

/** True when the element is a callout annotation. */
export const isAnnotationElement = (
  element: FloorPlanElement | undefined | null,
): element is AnnotationElement => !!element && element.type === 'annotation';

/** All annotations in the plan that point at `targetId`. */
export const annotationsForTarget = (
  elements: readonly FloorPlanElement[],
  targetId: string,
): AnnotationElement[] =>
  elements.filter(
    (element): element is AnnotationElement =>
      isAnnotationElement(element) && element.targetElementId === targetId,
  );

/**
 * Where the leader line starts: the target element's position.
 *
 * Two-point elements (walls, tracks, …) anchor at their midpoint so the line
 * tracks the whole run rather than one corner; everything else anchors at its
 * own `x`/`y`. Returns `null` when the target is missing or unpositioned.
 */
export const annotationTargetPoint = (
  elements: readonly FloorPlanElement[],
  annotation: AnnotationElement,
): Vector2D | null => {
  const target = elements.find((element) => element.id === annotation.targetElementId);
  if (!target || !Number.isFinite(target.x) || !Number.isFinite(target.y)) return null;
  const x2 = (target as { x2?: unknown }).x2;
  const y2 = (target as { y2?: unknown }).y2;
  if (typeof x2 === 'number' && Number.isFinite(x2) && typeof y2 === 'number' && Number.isFinite(y2)) {
    return { x: (target.x + x2) / 2, y: (target.y + y2) / 2 };
  }
  return { x: target.x, y: target.y };
};

/** Both ends of the leader line, or `null` when the target is unknown. */
export const annotationLeaderEndpoints = (
  elements: readonly FloorPlanElement[],
  annotation: AnnotationElement,
): { x1: number; y1: number; x2: number; y2: number } | null => {
  if (!Number.isFinite(annotation.x) || !Number.isFinite(annotation.y)) return null;
  const start = annotationTargetPoint(elements, annotation);
  if (!start) return null;
  return { x1: start.x, y1: start.y, x2: annotation.x, y2: annotation.y };
};

/** Resolved leader-line style with the faint defaults applied. */
export const annotationLineStyleOf = (
  annotation: AnnotationElement,
): { color: string; width: number; opacity: number; dash: 'solid' | 'dashed' | 'dotted' } => ({
  color: annotation.lineColor || DEFAULT_ANNOTATION_LINE_COLOR,
  width: annotation.lineWidth ?? DEFAULT_ANNOTATION_LINE_WIDTH,
  opacity: annotation.lineOpacity ?? DEFAULT_ANNOTATION_LINE_OPACITY,
  dash: annotation.lineDash ?? 'solid',
});

/** SVG dasharray for a leader-line dash style, or undefined for solid. */
export const annotationLineDasharray = (dash: 'solid' | 'dashed' | 'dotted'): string | undefined => {
  if (dash === 'dashed') return '5 4';
  if (dash === 'dotted') return '1.5 3';
  return undefined;
};

export interface BuildAnnotationOptions {
  /** Explicit id; a fresh one is minted when absent (rule 16). */
  id?: string;
  /** Initial text content. */
  text?: string;
  /** Text anchor; defaults to an offset above-right of the target. */
  x?: number;
  y?: number;
  /** Owning plan layer; absent = unlayered. */
  layerId?: string;
}

/**
 * Build a new annotation pinned to `target`, offset so the text starts clear
 * of the target glyph and the faint leader line is visible immediately.
 */
export const buildAnnotation = (
  target: FloorPlanElement,
  options: BuildAnnotationOptions = {},
): AnnotationElement => ({
  id: options.id ?? createId('el-annotation'),
  type: 'annotation',
  name: `Note on ${target.name || target.type}`,
  x: options.x ?? target.x + 90,
  y: options.y ?? target.y - 70,
  rotation: 0,
  locked: false,
  targetElementId: target.id,
  text: options.text ?? 'Note',
  fontSize: DEFAULT_ANNOTATION_FONT_SIZE,
  color: DEFAULT_ANNOTATION_COLOR,
  // Box-less by default: plain text at the end of the faint leader line.
  showBackground: false,
  ...(options.layerId !== undefined ? { layerId: options.layerId } : {}),
});

/**
 * Drop annotations whose target is in `deletedIds` — but only those: deleting
 * an element must not strand its callouts as lines into nothing.
 */
export const stripAnnotationsTargeting = (
  elements: readonly FloorPlanElement[],
  deletedIds: ReadonlySet<string>,
): FloorPlanElement[] =>
  elements.filter(
    (element) => !isAnnotationElement(element) || !deletedIds.has(element.targetElementId),
  );

/**
 * Point annotation targets at their duplicates after a duplicate/paste that
 * copied both ends: `idMap` maps old element ids to new ones. Targets outside
 * the map keep pointing at the original element.
 */
export const remapAnnotationTargets = (
  elements: FloorPlanElement[],
  idMap: ReadonlyMap<string, string>,
): FloorPlanElement[] =>
  elements.map((element) => {
    if (!isAnnotationElement(element)) return element;
    const remapped = idMap.get(element.targetElementId);
    return remapped ? { ...element, targetElementId: remapped } : element;
  });
