import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HEADSHOT_FRAMING,
  MAX_HEADSHOT_ZOOM,
  headshotImageStyle,
  isDefaultFraming,
  normaliseFraming,
  panFraming,
  zoomFraming,
} from '../people';

describe('normaliseFraming', () => {
  /**
   * Total rather than partial on purpose: stored data can predate the field,
   * be hand-edited, or be half-written by an interrupted drag.
   */
  it('fills in a framing that was never set', () => {
    expect(normaliseFraming(undefined)).toEqual(DEFAULT_HEADSHOT_FRAMING);
    expect(normaliseFraming({})).toEqual(DEFAULT_HEADSHOT_FRAMING);
  });

  it('keeps whichever parts were set', () => {
    expect(normaliseFraming({ x: 20 })).toEqual({ x: 20, y: 50, zoom: 1 });
  });

  it('clamps position to the edges of the picture', () => {
    expect(normaliseFraming({ x: -40, y: 180 })).toMatchObject({ x: 0, y: 100 });
  });

  /**
   * Below 1 the image no longer fills the circle and background shows through,
   * which nobody chose — so it is raised rather than rejected.
   */
  it('never lets zoom fall below filling the circle', () => {
    expect(normaliseFraming({ zoom: 0.4 }).zoom).toBe(1);
    expect(normaliseFraming({ zoom: -2 }).zoom).toBe(1);
  });

  it('caps zoom before a headshot becomes a nostril', () => {
    expect(normaliseFraming({ zoom: 99 }).zoom).toBe(MAX_HEADSHOT_ZOOM);
  });

  it('treats nonsense as unset rather than propagating NaN into CSS', () => {
    expect(normaliseFraming({ x: NaN, zoom: Infinity })).toEqual({ x: 0, y: 50, zoom: 1 });
  });
});

describe('panFraming', () => {
  /**
   * The sign is inverted from the pointer: dragging the picture right brings
   * what is on its LEFT into view, which means a smaller object-position x.
   * Getting this backwards is the classic reposition bug.
   */
  it('moves the crop opposite to the drag, so the picture follows the pointer', () => {
    expect(panFraming(DEFAULT_HEADSHOT_FRAMING, 10, 0).x).toBe(40);
    expect(panFraming(DEFAULT_HEADSHOT_FRAMING, -10, 0).x).toBe(60);
    expect(panFraming(DEFAULT_HEADSHOT_FRAMING, 0, 10).y).toBe(40);
  });

  it('stops at the edge instead of running off the picture', () => {
    expect(panFraming({ x: 5, y: 50, zoom: 1 }, 40, 0).x).toBe(0);
    expect(panFraming({ x: 95, y: 50, zoom: 1 }, -40, 0).x).toBe(100);
  });

  it('leaves zoom alone', () => {
    expect(panFraming({ x: 50, y: 50, zoom: 2 }, 10, 10).zoom).toBe(2);
  });

  it('works from an unset framing', () => {
    expect(panFraming(undefined, 10, 10)).toEqual({ x: 40, y: 40, zoom: 1 });
  });
});

describe('zoomFraming', () => {
  it('changes zoom and keeps the position', () => {
    expect(zoomFraming({ x: 20, y: 80, zoom: 1 }, 2)).toEqual({ x: 20, y: 80, zoom: 2 });
  });

  it('clamps like everything else', () => {
    expect(zoomFraming(undefined, 0.1).zoom).toBe(1);
    expect(zoomFraming(undefined, 50).zoom).toBe(MAX_HEADSHOT_ZOOM);
  });
});

describe('isDefaultFraming', () => {
  it('cannot tell an unset framing from an explicitly recentred one', () => {
    expect(isDefaultFraming(undefined)).toBe(true);
    expect(isDefaultFraming(DEFAULT_HEADSHOT_FRAMING)).toBe(true);
  });

  it('is false once anything has been moved', () => {
    expect(isDefaultFraming({ x: 40, y: 50, zoom: 1 })).toBe(false);
    expect(isDefaultFraming({ x: 50, y: 50, zoom: 1.5 })).toBe(false);
  });
});

describe('headshotImageStyle', () => {
  it('centres and covers when nothing was set', () => {
    expect(headshotImageStyle(undefined)).toEqual({
      objectFit: 'cover',
      objectPosition: '50% 50%',
    });
  });

  /** No transform at all at 1×, so the common case adds no compositing layer. */
  it('omits the transform when there is no zoom', () => {
    expect(headshotImageStyle({ x: 10, y: 90, zoom: 1 })).not.toHaveProperty('transform');
  });

  it('emits position and scale once framed', () => {
    expect(headshotImageStyle({ x: 25, y: 75, zoom: 1.5 })).toEqual({
      objectFit: 'cover',
      objectPosition: '25% 75%',
      transform: 'scale(1.5)',
    });
  });

  it('never emits NaN into a style string', () => {
    const style = headshotImageStyle({ x: NaN, y: NaN, zoom: NaN });
    expect(style.objectPosition).not.toMatch(/NaN/);
  });
});
