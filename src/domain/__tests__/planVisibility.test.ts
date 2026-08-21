import { describe, expect, it } from 'vitest';
import { selectPrintablePlanElements } from '../plan';
import type { FloorPlanElement, PlanLayer, StrokeElement } from '../../types';

const stroke = (overrides: Partial<StrokeElement> = {}): StrokeElement => ({
  id: 'stroke-1',
  type: 'stroke',
  x: 0,
  y: 0,
  rotation: 0,
  name: 'Freehand note',
  visible: true,
  locked: false,
  layerId: 'layer-annotations',
  points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
  color: '#ef4444',
  strokeWidth: 3,
  ...overrides,
});

const layers: PlanLayer[] = [
  { id: 'layer-annotations', name: 'Annotations', visible: false, locked: false, printVisible: true, order: 1 },
  { id: 'layer-references', name: 'References', visible: true, locked: false, printVisible: false, order: 2 },
];

describe('selectPrintablePlanElements', () => {
  it('includes freehand strokes on print-enabled layers even when the editing layer is hidden', () => {
    expect(selectPrintablePlanElements([stroke()], layers)).toEqual([stroke()]);
  });

  it('excludes hidden elements and elements on print-disabled layers', () => {
    const hidden = stroke({ id: 'hidden', visible: false });
    const reference = stroke({ id: 'reference', layerId: 'layer-references' });
    expect(selectPrintablePlanElements([hidden, reference] as FloorPlanElement[], layers)).toEqual([]);
  });

  it('keeps legacy elements without a layer assignment', () => {
    const legacy = stroke({ layerId: undefined });
    expect(selectPrintablePlanElements([legacy], layers)).toEqual([legacy]);
  });
});
