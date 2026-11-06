import type { BaseElement } from '../../types';

/** Vertical offset from an object's normal placement, in millimetres. */
export function elementElevationMm(element: Pick<BaseElement, 'elevationMm'>): number {
  return typeof element.elevationMm === 'number' && Number.isFinite(element.elevationMm) ? element.elevationMm : 0;
}
