/**
 * Where an object dragged across split-screen panes lands.
 *
 * Every plan surface on screen — the editable canvas and each preview pane —
 * marks its <svg> with the scene it shows and its pan/zoom, so a drag that
 * starts in one can find the scene under the pointer, and the plan point
 * under it, without the two components knowing about each other.
 */
import type { Vector2D } from '../../types';

export interface ScenePaneTarget {
  setupId: string;
  /** The plan point under the pointer, in that scene's coordinates. */
  world: Vector2D;
}

/** Attributes for a plan <svg> that accepts dropped objects. */
export const scenePaneAttributes = (setupId: string, scale: number, offset: Vector2D) => ({
  'data-scene-pane': setupId,
  'data-scene-scale': String(scale),
  'data-scene-ox': String(offset.x),
  'data-scene-oy': String(offset.y),
});

export const scenePaneAt = (clientX: number, clientY: number): ScenePaneTarget | null => {
  if (typeof document === 'undefined' || typeof document.elementsFromPoint !== 'function') return null;
  for (const element of document.elementsFromPoint(clientX, clientY)) {
    const svg = element.closest<SVGSVGElement>('svg[data-scene-pane]');
    if (!svg) continue;
    const scale = Number(svg.dataset.sceneScale) || 1;
    const rect = svg.getBoundingClientRect();
    return {
      setupId: svg.dataset.scenePane ?? '',
      world: {
        x: (clientX - rect.left - (Number(svg.dataset.sceneOx) || 0)) / scale,
        y: (clientY - rect.top - (Number(svg.dataset.sceneOy) || 0)) / scale,
      },
    };
  }
  return null;
};
