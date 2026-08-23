import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HEADSHOT_FRAMING,
  framingSlack,
  MAX_HEADSHOT_ZOOM,
  headshotImageStyle,
  isDefaultFraming,
  normaliseFraming,
  panFraming,
  zoomFraming,
  rotateFraming,
  rotateFramingBy,
  zoomToCoverRotation,
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
    expect(normaliseFraming({ x: 20 })).toEqual({ x: 20, y: 50, zoom: 1, rotation: 0 });
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
    expect(normaliseFraming({ x: NaN, zoom: Infinity })).toEqual({ x: 0, y: 50, zoom: 1, rotation: 0 });
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
    expect(panFraming(undefined, 10, 10)).toEqual({ x: 40, y: 40, zoom: 1, rotation: 0 });
  });
});

describe('zoomFraming', () => {
  it('changes zoom and keeps the position', () => {
    expect(zoomFraming({ x: 20, y: 80, zoom: 1 }, 2)).toEqual({ x: 20, y: 80, zoom: 2, rotation: 0 });
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

/**
 * The reported bug: headshots panned left and right but not up and down.
 *
 * Not a broken drag — geometry. `object-fit: cover` scales the picture until it
 * covers the circle, so only the LONGER axis overflows. A landscape headshot
 * hides image to the left and right and nothing above or below, so dragging
 * vertically has nothing to reveal.
 */
describe('framingSlack', () => {
  it('gives a landscape headshot horizontal movement only', () => {
    expect(framingSlack(1600, 900, 1)).toMatchObject({ horizontal: true, vertical: false });
  });

  it('gives a portrait headshot vertical movement only', () => {
    expect(framingSlack(900, 1600, 1)).toMatchObject({ horizontal: false, vertical: true });
  });

  it('gives a square headshot neither until it is zoomed', () => {
    expect(framingSlack(800, 800, 1)).toMatchObject({ horizontal: false, vertical: false });
  });

  /** Zooming is what creates the slack, which is why the control offers it. */
  it('unlocks both axes once zoomed past 1', () => {
    expect(framingSlack(1600, 900, 1.2)).toMatchObject({ horizontal: true, vertical: true });
    expect(framingSlack(800, 800, 1.2)).toMatchObject({ horizontal: true, vertical: true });
  });

  it('offers a zoom only while an axis is locked', () => {
    expect(framingSlack(1600, 900, 1).zoomToUnlock).toBe(1.2);
    expect(framingSlack(1600, 900, 1.5).zoomToUnlock).toBeNull();
  });

  /**
   * A drag that quietly does nothing is a smaller sin than telling the user a
   * drag is impossible when it is not.
   */
  it('assumes both axes work when the dimensions are not known yet', () => {
    expect(framingSlack(undefined, undefined, 1)).toMatchObject({ horizontal: true, vertical: true });
    expect(framingSlack(0, 0, 1)).toMatchObject({ horizontal: true, vertical: true });
  });

  it('clamps a nonsense zoom like everything else', () => {
    expect(framingSlack(1600, 900, 0.2)).toMatchObject({ horizontal: true, vertical: false });
  });
});

/**
 * Tilt. A phone picture taken sideways and a head cocked at twenty degrees both
 * need straightening, and neither is a pan.
 */
describe('rotation', () => {
  it('is absent-safe: no stored tilt reads as 0', () => {
    expect(normaliseFraming({ x: 50, y: 50, zoom: 1 }).rotation).toBe(0);
    expect(isDefaultFraming({ x: 50, y: 50, zoom: 1 })).toBe(true);
  });

  it('wraps any angle into a half turn each way', () => {
    expect(rotateFraming(undefined, 370).rotation).toBe(10);
    expect(rotateFraming(undefined, -190).rotation).toBe(170);
    expect(rotateFraming(undefined, 180).rotation).toBe(180);
    expect(rotateFraming(undefined, -180).rotation).toBe(180);
    expect(rotateFraming(undefined, NaN).rotation).toBe(0);
  });

  it('quarter turns accumulate and a full turn is no tilt', () => {
    const quarter = rotateFramingBy(undefined, 90);
    expect(quarter.rotation).toBe(90);
    expect(rotateFramingBy(rotateFramingBy(rotateFramingBy(quarter, 90), 90), 90).rotation).toBe(0);
  });

  it('keeps pan and zoom while tilting', () => {
    expect(rotateFraming({ x: 20, y: 80, zoom: 2 }, 15)).toEqual({ x: 20, y: 80, zoom: 2, rotation: 15 });
  });

  it('a tilt is not the default, so the reset button shows', () => {
    expect(isDefaultFraming({ ...DEFAULT_HEADSHOT_FRAMING, rotation: 5 })).toBe(false);
  });

  /** Right to left: scale first, then rotate the enlarged picture in place. */
  it('emits rotate before scale in the transform', () => {
    expect(headshotImageStyle({ x: 50, y: 50, zoom: 1.5, rotation: -12 }).transform).toBe('rotate(-12deg) scale(1.5)');
    expect(headshotImageStyle({ x: 50, y: 50, zoom: 1, rotation: 90 }).transform).toBe('rotate(90deg)');
  });

  /**
   * A rectangle turned inside a round window shows background at the rim
   * unless enlarged by |cos θ| + |sin θ|; √2 at 45°, nothing at a quarter turn.
   */
  it('knows the zoom that hides the corners of a tilted picture', () => {
    expect(zoomToCoverRotation(0)).toBe(1);
    expect(zoomToCoverRotation(90)).toBe(1);
    expect(zoomToCoverRotation(45)).toBeCloseTo(1.42, 2);
    expect(zoomToCoverRotation(-45)).toBeCloseTo(1.42, 2);
    expect(zoomToCoverRotation(20)).toBeCloseTo(1.29, 2);
    expect(zoomToCoverRotation(45)).toBeLessThanOrEqual(MAX_HEADSHOT_ZOOM);
  });
});
