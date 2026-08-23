/**
 * Headshot framing (plan §4.5).
 *
 * A headshot is shown as a small circle — 26 px on a printed contact sheet, 32
 * on the crew list — and photographs rarely arrive framed for that. A wide
 * agency shot puts the face in the top third; a phone picture taken sideways
 * puts it off to one side. Cropped to a circle by `object-fit: cover`, both
 * come out as an ear.
 *
 * So framing is stored ALONGSIDE the image rather than baked into it. Two
 * reasons, and the first is the one that matters:
 *
 *  - The asset store is content-addressed. Re-encoding a crop mints a new blob,
 *    so two people who share a photo (a headshot used for a cast member and
 *    their stunt double, the same still used twice) would stop sharing it, and
 *    every reframe would leave the previous crop behind as an orphan.
 *  - Framing stays reversible. The full picture is always there, so nudging the
 *    crop is free and nothing is ever destroyed by a bad drag.
 *
 * The cost is that every surface showing a headshot has to apply the framing,
 * which is why `headshotImageStyle` exists rather than each one doing its own
 * arithmetic.
 */

/**
 * Where the picture sits inside its circle, and how far in.
 *
 * `x`/`y` are percentages in CSS `object-position` terms: 0 pins the left/top
 * edge, 100 the right/bottom, 50 centres. `zoom` is a scale factor at or above
 * 1 — below 1 the image would no longer fill the circle and leave a gap.
 */
export interface HeadshotFraming {
  x: number;
  y: number;
  zoom: number;
}

/**
 * Centred and unzoomed — what `object-fit: cover` does on its own.
 *
 * Absent framing means exactly this, so a person who never touched the control
 * looks identical to one who reset it, and no migration has to backfill
 * anything (rule 13).
 */
export const DEFAULT_HEADSHOT_FRAMING: HeadshotFraming = { x: 50, y: 50, zoom: 1 };

/** How far in the control allows; past this a headshot is a nostril. */
export const MAX_HEADSHOT_ZOOM = 3;

const clamp = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

/**
 * A usable framing from whatever was stored.
 *
 * Total rather than partial on purpose: saved data can be older than the field,
 * hand-edited, or half-written by an interrupted drag, and every caller would
 * otherwise repeat the same four fallbacks. A `zoom` below 1 is raised rather
 * than rejected — it would show background through the circle, which no user
 * intended.
 */
export const normaliseFraming = (
  framing: Partial<HeadshotFraming> | undefined,
): HeadshotFraming => ({
  x: clamp(framing?.x ?? DEFAULT_HEADSHOT_FRAMING.x, 0, 100),
  y: clamp(framing?.y ?? DEFAULT_HEADSHOT_FRAMING.y, 0, 100),
  zoom: clamp(framing?.zoom ?? DEFAULT_HEADSHOT_FRAMING.zoom, 1, MAX_HEADSHOT_ZOOM),
});

/** True when this framing is the default, so the UI can hide a reset nobody needs. */
export const isDefaultFraming = (framing: Partial<HeadshotFraming> | undefined): boolean => {
  const normalised = normaliseFraming(framing);
  return (
    normalised.x === DEFAULT_HEADSHOT_FRAMING.x &&
    normalised.y === DEFAULT_HEADSHOT_FRAMING.y &&
    normalised.zoom === DEFAULT_HEADSHOT_FRAMING.zoom
  );
};

/**
 * Move the framing by a drag, in percentage points.
 *
 * The sign is inverted from the pointer on purpose: dragging the picture right
 * should bring what is on its LEFT into view, which means decreasing
 * `object-position` x. Getting this backwards is the classic bug in a
 * reposition control, and it feels wrong immediately rather than subtly.
 */
export const panFraming = (
  framing: Partial<HeadshotFraming> | undefined,
  deltaXPercent: number,
  deltaYPercent: number,
): HeadshotFraming => {
  const current = normaliseFraming(framing);
  return normaliseFraming({
    x: current.x - deltaXPercent,
    y: current.y - deltaYPercent,
    zoom: current.zoom,
  });
};

/** Change zoom, keeping the current position. */
export const zoomFraming = (
  framing: Partial<HeadshotFraming> | undefined,
  zoom: number,
): HeadshotFraming => normaliseFraming({ ...normaliseFraming(framing), zoom });

/**
 * The CSS for an `<img>` filling a square avatar with this framing.
 *
 * `object-position` places the crop at 1× and `scale` zooms it. The scale is
 * applied ABOUT THE SAME POINT — `transform-origin: x% y%` — and that is what
 * makes the short axis move at all. `object-fit: cover` only overflows the
 * picture's longer axis, so on a landscape headshot `object-position`'s y has
 * nothing to slide; but scaling about a point near the top keeps the top in
 * view and pushes the bottom out, which is exactly "move it up". So 0..100 on
 * either axis means "pin that edge" at every zoom, and the circle stays
 * covered without knowing the picture's dimensions.
 *
 * Scaling the image rather than resizing the box keeps the circle exactly the
 * size the layout asked for, so a zoomed headshot never shifts its row.
 */
export const headshotImageStyle = (
  framing: Partial<HeadshotFraming> | undefined,
): { objectFit: 'cover'; objectPosition: string; transform?: string; transformOrigin?: string } => {
  const { x, y, zoom } = normaliseFraming(framing);
  return {
    objectFit: 'cover',
    objectPosition: `${x}% ${y}%`,
    ...(zoom === 1 ? {} : { transform: `scale(${zoom})`, transformOrigin: `${x}% ${y}%` }),
  };
};

export interface FramingSlack {
  /** True when there is hidden image to the left/right to bring into view. */
  horizontal: boolean;
  /** True when there is hidden image above/below. */
  vertical: boolean;
  /** Smallest zoom that unlocks the locked axis, or null when none is locked. */
  zoomToUnlock: number | null;
}

/**
 * Which axes can actually be panned.
 *
 * `object-fit: cover` scales the picture until it covers the circle, so only
 * the LONGER axis overflows — a landscape headshot in a round crop hides image
 * to the left and right and nothing above or below. Dragging up and down on one
 * therefore does nothing at all, which reads as a broken control rather than as
 * geometry, and there is no way to tell from looking at it.
 *
 * Zooming past 1 makes both axes overflow, so it is the answer — but only if
 * the control says so. This is what lets it.
 */
export const framingSlack = (
  naturalWidth: number | undefined,
  naturalHeight: number | undefined,
  zoom: number,
): FramingSlack => {
  const width = naturalWidth ?? 0;
  const height = naturalHeight ?? 0;
  // Unknown dimensions: assume both work rather than disabling a control that
  // might be fine. A drag that does nothing is a smaller sin than a drag the
  // user is wrongly told is impossible.
  if (width <= 0 || height <= 0) return { horizontal: true, vertical: true, zoomToUnlock: null };

  const safeZoom = normaliseFraming({ zoom }).zoom;
  // Rendered size relative to the box, once `cover` has done its work.
  const horizontal = safeZoom * Math.max(width / height, 1) > 1.0001;
  const vertical = safeZoom * Math.max(height / width, 1) > 1.0001;

  // Any zoom above 1 gives the constrained axis something to show.
  const zoomToUnlock = horizontal && vertical ? null : UNLOCK_ZOOM;
  return { horizontal, vertical, zoomToUnlock };
};

/** The zoom a drag along a locked axis silently steps up to, so the drag just works. */
export const UNLOCK_ZOOM = 1.25;

/**
 * How many pixels of travel an axis has at this zoom, for a box of `boxPx`:
 * the rendered size minus the box. This is what turns pointer pixels into
 * percentage points so the picture tracks the finger instead of racing it.
 */
export const framingTravelPx = (
  naturalWidth: number | undefined,
  naturalHeight: number | undefined,
  zoom: number,
  boxPx: number,
): { x: number; y: number } => {
  const width = naturalWidth ?? 0;
  const height = naturalHeight ?? 0;
  const safeZoom = normaliseFraming({ zoom }).zoom;
  if (width <= 0 || height <= 0) {
    // Unknown dimensions: assume a square, so the drag still moves something.
    const travel = Math.max(0, boxPx * (safeZoom - 1));
    return { x: travel, y: travel };
  }
  return {
    x: Math.max(0, boxPx * (safeZoom * Math.max(width / height, 1) - 1)),
    y: Math.max(0, boxPx * (safeZoom * Math.max(height / width, 1) - 1)),
  };
};

/**
 * Move the framing by a pointer drag in PIXELS on a `boxPx` preview. An axis
 * with no travel — the short side of a picture at 1× — steps the zoom up to
 * `UNLOCK_ZOOM` first, so dragging works in every direction without anyone
 * having to understand why it would not have.
 */
export const dragFraming = (
  framing: Partial<HeadshotFraming> | undefined,
  dxPx: number,
  dyPx: number,
  natural: { width?: number; height?: number } | undefined,
  boxPx: number,
): HeadshotFraming => {
  let current = normaliseFraming(framing);
  let travel = framingTravelPx(natural?.width, natural?.height, current.zoom, boxPx);
  if ((dxPx !== 0 && travel.x === 0) || (dyPx !== 0 && travel.y === 0)) {
    current = zoomFraming(current, Math.max(current.zoom, UNLOCK_ZOOM));
    travel = framingTravelPx(natural?.width, natural?.height, current.zoom, boxPx);
  }
  const dxPercent = travel.x > 0 ? (dxPx / travel.x) * 100 : 0;
  const dyPercent = travel.y > 0 ? (dyPx / travel.y) * 100 : 0;
  return panFraming(current, dxPercent, dyPercent);
};
