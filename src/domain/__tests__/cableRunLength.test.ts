import { describe, expect, it } from 'vitest';
import type { CableElement, CameraElement, FloorPlanElement, PropElement } from '../../types';
import { cableRoutePoints, cableRunLength, polylineLengthPx, pxToMetres } from '../cable/runLength';

const cable = (over: Partial<CableElement> = {}): CableElement => ({
  id: 'c1',
  type: 'cable',
  name: 'Cable',
  x: 0,
  y: 0,
  x2: 100,
  y2: 0,
  rotation: 0,
  cableType: 'sdi_12g',
  fromLabel: 'CCU 1',
  toLabel: 'CAM A',
  ...over,
});

const camera = (over: Partial<CameraElement> = {}): CameraElement =>
  ({
    id: 'cam1',
    type: 'camera',
    name: 'Cam A',
    x: 100,
    y: 0,
    rotation: 0,
    cameraLabel: 'A',
    focalLength: 35,
    sensorFormat: 'S35',
    fovAngle: 54,
    path: [],
    ...over,
  }) as CameraElement;

describe('polylineLengthPx', () => {
  it('sums the segments of a polyline', () => {
    expect(polylineLengthPx([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 14 }])).toBe(15);
  });

  it('is zero for fewer than two points', () => {
    expect(polylineLengthPx([])).toBe(0);
    expect(polylineLengthPx([{ x: 5, y: 5 }])).toBe(0);
  });
});

describe('cableRoutePoints', () => {
  it('walks start, routing points, end', () => {
    const points = cableRoutePoints(cable({ path: [{ id: 'p1', x: 50, y: 40 }] }));
    expect(points).toEqual([{ x: 0, y: 0 }, { x: 50, y: 40 }, { x: 100, y: 0 }]);
  });
});

describe('cableRunLength', () => {
  it('measures the drawn route, not the straight line between the ends', () => {
    // Straight across would be 100; routed via (50,40) it is 2 * hypot(50,40).
    const result = cableRunLength(cable({ path: [{ id: 'p1', x: 50, y: 40 }] }), []);
    expect(result.staticPx).toBeCloseTo(2 * Math.hypot(50, 40));
    expect(result.maxPx).toBe(result.staticPx);
  });

  it('reports no movement when neither end is attached', () => {
    const result = cableRunLength(cable(), []);
    expect(result.movingElementIds).toEqual([]);
    expect(result.maxPx).toBe(result.staticPx);
    expect(result.maxAtBeat).toBe(1);
  });

  it('reports no movement when the attached device stands still', () => {
    const result = cableRunLength(cable({ toElementId: 'cam1' }), [camera()]);
    expect(result.movingElementIds).toEqual([]);
    expect(result.maxPx).toBe(100);
  });

  it('grows the run to reach a camera at its furthest waypoint', () => {
    const movingCam = camera({
      path: [
        { id: 'w1', x: 300, y: 0, beat: 2 },
        { id: 'w2', x: 180, y: 0, beat: 3 },
      ],
    });
    const result = cableRunLength(cable({ toElementId: 'cam1' }), [movingCam as FloorPlanElement]);
    expect(result.staticPx).toBe(100);
    expect(result.maxPx).toBeCloseTo(300);
    expect(result.maxAtBeat).toBe(2);
    expect(result.movingElementIds).toEqual(['cam1']);
  });

  it('accounts for movement at the FROM end too', () => {
    const movingProp: PropElement = {
      id: 'p1',
      type: 'prop',
      name: 'Genny cart',
      x: 0,
      y: 0,
      rotation: 0,
      propType: 'table_rect',
      width: 40,
      height: 40,
      path: [{ id: 'w1', x: -250, y: 0, beat: 2 }],
    } as PropElement;
    const result = cableRunLength(cable({ fromElementId: 'p1' }), [movingProp]);
    expect(result.maxPx).toBeCloseTo(350);
    expect(result.movingElementIds).toEqual(['p1']);
  });

  it('handles both ends moving apart at once', () => {
    const movingCam = camera({ path: [{ id: 'w1', x: 300, y: 0, beat: 2 }] });
    const movingProp = {
      id: 'p1', type: 'prop', name: 'Cart', x: 0, y: 0, rotation: 0,
      propType: 'table_rect', width: 40, height: 40,
      path: [{ id: 'w2', x: -100, y: 0, beat: 2 }],
    } as PropElement;
    const result = cableRunLength(
      cable({ fromElementId: 'p1', toElementId: 'cam1' }),
      [movingProp, movingCam as FloorPlanElement],
    );
    expect(result.maxPx).toBeCloseTo(400);
    expect(result.movingElementIds).toEqual(['p1', 'cam1']);
  });

  it('keeps routing points in the measurement while a device moves', () => {
    const movingCam = camera({ path: [{ id: 'w1', x: 100, y: 200, beat: 2 }] });
    const result = cableRunLength(
      cable({ toElementId: 'cam1', path: [{ id: 'r1', x: 0, y: 100 }] }),
      [movingCam as FloorPlanElement],
    );
    // Beat 2: (0,0) -> (0,100) -> (100,200) = 100 + hypot(100,100)
    expect(result.maxPx).toBeCloseTo(100 + Math.hypot(100, 100));
  });

  it('does not mistake a cable routing point list for a movement path', () => {
    const otherCable = cable({ id: 'c2', path: [{ id: 'r1', x: 10, y: 10 }] });
    const result = cableRunLength(cable({ toElementId: 'c2' }), [otherCable]);
    expect(result.movingElementIds).toEqual([]);
  });

  it('ignores an attachment whose element no longer exists', () => {
    const result = cableRunLength(cable({ toElementId: 'ghost' }), []);
    expect(result.movingElementIds).toEqual([]);
    expect(result.maxPx).toBe(100);
  });
});

describe('pxToMetres', () => {
  it('converts at the setup scale', () => {
    expect(pxToMetres(150, 50)).toBe(3);
    expect(pxToMetres(150, 30)).toBe(5);
  });

  it('does not divide by a zero or negative scale', () => {
    expect(pxToMetres(150, 0)).toBe(150);
    expect(pxToMetres(150, -5)).toBe(150);
  });
});
