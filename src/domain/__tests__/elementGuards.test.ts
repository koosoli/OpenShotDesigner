/**
 * Narrowing floor-plan elements without `as any`.
 *
 * The casts these replace were not a style issue. `(el as any).x2` silences the
 * compiler for the whole expression, so it keeps compiling after the field is
 * renamed or made optional, and the failure arrives at runtime as NaN
 * coordinates — an element that has quietly vanished from the canvas, with
 * nothing in the console to say why.
 *
 * So the guards check that the values are usable, not merely present. A
 * half-written import carrying `x2: null` is exactly the case a truthiness
 * check waves through.
 */
import { describe, expect, it } from 'vitest';
import {
  elementLength,
  endpointsOf,
  hasEndpoints,
  hasPath,
  hasSize,
} from '../plan/elementGuards';
import type { FloorPlanElement } from '../../types';

const element = (fields: Record<string, unknown>): FloorPlanElement =>
  ({ id: 'e', type: 'prop', x: 0, y: 0, rotation: 0, ...fields }) as unknown as FloorPlanElement;

describe('hasEndpoints', () => {
  it('accepts an element with both endpoints', () => {
    expect(hasEndpoints(element({ x2: 100, y2: 50 }))).toBe(true);
  });

  it('rejects one with neither, or only one', () => {
    expect(hasEndpoints(element({}))).toBe(false);
    expect(hasEndpoints(element({ x2: 100 }))).toBe(false);
  });

  /** The case a truthiness check lets through, and NaN geometry follows. */
  it('rejects unusable values that are technically present', () => {
    expect(hasEndpoints(element({ x2: null, y2: 5 }))).toBe(false);
    expect(hasEndpoints(element({ x2: NaN, y2: 5 }))).toBe(false);
    expect(hasEndpoints(element({ x2: '100', y2: '50' }))).toBe(false);
    expect(hasEndpoints(element({ x2: Infinity, y2: 0 }))).toBe(false);
  });

  it('accepts a zero endpoint, which is a real coordinate', () => {
    expect(hasEndpoints(element({ x2: 0, y2: 0 }))).toBe(true);
  });

  it('tolerates nothing at all', () => {
    expect(hasEndpoints(undefined)).toBe(false);
    expect(hasEndpoints(null)).toBe(false);
  });
});

describe('hasSize', () => {
  it('accepts a box and rejects a partial one', () => {
    expect(hasSize(element({ width: 80, height: 60 }))).toBe(true);
    expect(hasSize(element({ width: 80 }))).toBe(false);
    expect(hasSize(element({ width: 80, height: null }))).toBe(false);
  });
});

describe('hasPath', () => {
  it('accepts a path of usable points', () => {
    expect(hasPath(element({ path: [{ x: 1, y: 2 }] }))).toBe(true);
    // An empty path is a valid path: the camera simply has no move yet.
    expect(hasPath(element({ path: [] }))).toBe(true);
  });

  it('rejects a path holding a malformed point', () => {
    expect(hasPath(element({ path: [{ x: 1, y: 2 }, { x: NaN, y: 0 }] }))).toBe(false);
    expect(hasPath(element({ path: [null] }))).toBe(false);
    expect(hasPath(element({ path: 'not a path' }))).toBe(false);
    expect(hasPath(element({}))).toBe(false);
  });
});

describe('endpointsOf', () => {
  it('reports the real endpoints when they exist', () => {
    expect(endpointsOf(element({ x: 10, y: 20, x2: 110, y2: 20 }))).toEqual({
      x1: 10,
      y1: 20,
      x2: 110,
      y2: 20,
    });
  });

  /** The canvas's existing convention: a horizontal run to the right. */
  it('falls back to a default run when they do not', () => {
    expect(endpointsOf(element({ x: 10, y: 20 }))).toEqual({
      x1: 10,
      y1: 20,
      x2: 250,
      y2: 20,
    });
    expect(endpointsOf(element({ x: 0, y: 0 }), 100).x2).toBe(100);
  });
});

describe('elementLength', () => {
  it('measures a two-point element', () => {
    expect(elementLength(element({ x: 0, y: 0, x2: 3, y2: 4 }))).toBe(5);
  });

  /**
   * Zero rather than NaN for an element with no endpoints. The callers use this
   * to decide whether a click produced a zero-length tape that needs a default
   * length, and `NaN < 5` is false — so a NaN here would leave the tape at zero
   * length, invisible on the canvas.
   */
  it('reports zero, not NaN, when there are no endpoints', () => {
    expect(elementLength(element({}))).toBe(0);
  });
});
