import { describe, expect, it } from 'vitest';
import {
  boundsContain,
  elementBounds,
  elementsBounds,
  padBounds,
} from '../plan/elementBounds';
import type { FloorPlanElement } from '../../types';

/** Minimal element of a given shape; the fields under test are the point. */
const el = (partial: Record<string, unknown>): FloorPlanElement =>
  ({ id: 'e1', x: 0, y: 0, rotation: 0, ...partial }) as unknown as FloorPlanElement;

describe('elementBounds', () => {
  it('spans both endpoints of a two-point element', () => {
    const box = elementBounds(el({ type: 'wall', x: 100, y: 100, x2: 400, y2: 300 }));
    expect(box).toEqual({ minX: 100, minY: 100, maxX: 400, maxY: 300 });
  });

  it('spans a wall drawn right-to-left', () => {
    // The bug this replaces: the old print fit took the minimum from `x` alone
    // and the maximum from `x2`, so this came back inverted (min 900, max 100)
    // and the printed blueprint got a negative-width viewBox.
    const box = elementBounds(el({ type: 'wall', x: 900, y: 500, x2: 100, y2: 100 }));
    expect(box).toEqual({ minX: 100, minY: 100, maxX: 900, maxY: 500 });
  });

  it('treats an x2 of exactly 0 as a real endpoint', () => {
    // `(e as any).x2 || fallback` discarded it, because 0 is falsy.
    const box = elementBounds(el({ type: 'wall', x: 300, y: 0, x2: 0, y2: 0 }));
    expect(box?.minX).toBe(0);
  });

  it('centres a sized element on its position', () => {
    // Every layer draws a sized element at x={-w / 2}; the old print fit used
    // `x + width`, clipping the left half and padding the right with nothing.
    const box = elementBounds(el({ type: 'prop', x: 500, y: 400, width: 100, height: 60 }));
    expect(box).toEqual({ minX: 450, minY: 370, maxX: 550, maxY: 430 });
  });

  it('spans the sampled points of a freehand stroke', () => {
    const box = elementBounds(
      el({
        type: 'stroke',
        x: 50,
        y: 50,
        points: [
          { x: 10, y: 90 },
          { x: 70, y: 20 },
        ],
      }),
    );
    expect(box).toEqual({ minX: 10, minY: 20, maxX: 70, maxY: 90 });
  });

  it('ignores malformed stroke points instead of returning NaN', () => {
    const box = elementBounds(
      el({
        type: 'stroke',
        x: 50,
        y: 50,
        points: [{ x: 10, y: 90 }, { x: Number.NaN, y: 5 }, null],
      }),
    );
    expect(box).toEqual({ minX: 10, minY: 50, maxX: 50, maxY: 90 });
  });

  it('gives a marker with no extent a symmetric box', () => {
    const box = elementBounds(el({ type: 'camera', x: 200, y: 200 }), { markerHalfExtent: 20 });
    expect(box).toEqual({ minX: 180, minY: 180, maxX: 220, maxY: 220 });
  });

  it('excludes a routed path by default and includes it on request', () => {
    const camera = el({
      type: 'camera',
      x: 200,
      y: 200,
      path: [
        { x: 900, y: 200 },
        { x: 900, y: 700 },
      ],
    });
    expect(elementBounds(camera)?.maxX).toBe(220);
    // The print fit asks for the move: a blocking beat off the page is the one
    // thing a printed plan must not silently lose.
    expect(elementBounds(camera, { includePath: true })).toEqual({
      minX: 200,
      minY: 200,
      maxX: 900,
      maxY: 700,
    });
  });

  it('reports an unusable position as unknown rather than as the origin', () => {
    expect(elementBounds(el({ type: 'prop', x: Number.NaN, y: 10 }))).toBeNull();
  });
});

describe('elementsBounds', () => {
  it('covers every element', () => {
    const box = elementsBounds([
      el({ type: 'wall', x: 100, y: 100, x2: 200, y2: 150 }),
      el({ type: 'prop', x: 500, y: 400, width: 100, height: 60 }),
    ]);
    expect(box).toEqual({ minX: 100, minY: 100, maxX: 550, maxY: 430 });
  });

  it('skips elements with no usable position without dragging the box to 0,0', () => {
    const box = elementsBounds([
      el({ type: 'prop', x: Number.NaN, y: Number.NaN }),
      el({ type: 'wall', x: 300, y: 300, x2: 400, y2: 400 }),
    ]);
    expect(box).toEqual({ minX: 300, minY: 300, maxX: 400, maxY: 400 });
  });

  it('is null for an empty plan rather than inventing a default page', () => {
    expect(elementsBounds([])).toBeNull();
  });
});

describe('padBounds / boundsContain', () => {
  it('grows a box on all four sides', () => {
    expect(padBounds({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, 5)).toEqual({
      minX: -5,
      minY: -5,
      maxX: 15,
      maxY: 15,
    });
  });

  it('tests containment inclusively at the edge', () => {
    const box = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    expect(boundsContain(box, 10, 0)).toBe(true);
    expect(boundsContain(box, 11, 0)).toBe(false);
  });
});
