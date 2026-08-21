import type { FloorPlanElement, PlanLayer } from '../../types';

/**
 * Select plan elements that belong in paper/PNG exports.
 * Canvas visibility and print visibility are deliberately independent: a
 * layer may be hidden while editing and still enabled for the final plan.
 */
export const selectPrintablePlanElements = (
  elements: FloorPlanElement[],
  layers: PlanLayer[] | undefined,
): FloorPlanElement[] => {
  const layersById = new Map((layers ?? []).map((layer) => [layer.id, layer]));
  return elements.filter((element) => {
    if (element.visible === false) return false;
    if (!element.layerId) return true;
    return layersById.get(element.layerId)?.printVisible !== false;
  });
};
