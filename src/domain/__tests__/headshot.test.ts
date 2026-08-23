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
  dragFraming,
  framingTravelPx,
  UNLOCK_ZOOM,
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
      transformOrigin: '25% 75%',
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
    expect(framingSlack(1600, 900, 1).zoomToUnlock).toBe(UNLOCK_ZOOM);
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
 * Dragging has to work in every direction. The geometry that blocks the short
 * axis at 1× is handled INSIDE the drag, by stepping the zoom up, rather than
 * by telling the user which way they may drag.
 */
describe('dragFraming', () => {
  const landscape = { width: 1600, height: 900 };

  it('moves the long axis by the pointer, picture tracking the finger', () => {
    // At 1× a 16:9 picture in a 96px box renders 170.7px wide: 74.7px of travel.
    const travel = framingTravelPx(landscape.width, landscape.height, 1, 96);
    expect(travel.x).toBeCloseTo(74.67, 1);
    expect(travel.y).toBe(0);
    const moved = dragFraming(undefined, travel.x / 2, 0, landscape, 96);
    expect(moved.x).toBeCloseTo(0, 5); // dragged right by half the travel from centre → left edge pinned
    expect(moved.zoom).toBe(1);
  });

  it('steps the zoom up when dragged along the axis that had no travel', () => {
    const moved = dragFraming(undefined, 0, -10, landscape, 96);
    expect(moved.zoom).toBe(UNLOCK_ZOOM);
    expect(moved.y).toBeGreaterThan(50);
  });

  it('leaves a zoomed picture at its zoom', () => {
    const moved = dragFraming({ x: 50, y: 50, zoom: 2 }, 0, 5, landscape, 96);
    expect(moved.zoom).toBe(2);
    expect(moved.y).toBeLessThan(50);
  });

  it('assumes a square when the dimensions are unknown, so a drag still moves', () => {
    const moved = dragFraming(undefined, 10, 10, undefined, 96);
    expect(moved.zoom).toBe(UNLOCK_ZOOM);
    expect(moved.x).not.toBe(50);
    expect(moved.y).not.toBe(50);
  });
});

describe('headshotImageStyle at zoom', () => {
  /** Scaling about the framing point is what lets the short axis move. */
  it('scales about the framing point', () => {
    expect(headshotImageStyle({ x: 20, y: 0, zoom: 1.5 })).toEqual({
      objectFit: 'cover',
      objectPosition: '20% 0%',
      transform: 'scale(1.5)',
      transformOrigin: '20% 0%',
    });
  });
});
