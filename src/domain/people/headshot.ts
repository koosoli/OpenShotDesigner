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
  /**
   * Tilt in degrees, clockwise positive; absent means 0. A phone picture taken
   * sideways and a head cocked at twenty degrees both need straightening, and
   * neither is a pan. Applied about the centre of the circle, so the picture
   * turns in place rather than swinging around.
   */
  rotation?: number;
}

/**
 * Centred and unzoomed — what `object-fit: cover` does on its own.
 *
 * Absent framing means exactly this, so a person who never touched the control
 * looks identical to one who reset it, and no migration has to backfill
 * anything (rule 13).
 */
export const DEFAULT_HEADSHOT_FRAMING: HeadshotFraming = { x: 50, y: 50, zoom: 1, rotation: 0 };

/** How far in the control allows; past this a headshot is a nostril. */
export const MAX_HEADSHOT_ZOOM = 3;

/** Tilt range: half a turn each way reaches every orientation a photo arrives in. */
export const MAX_HEADSHOT_ROTATION = 180;

/** Normalise any angle into (-180, 180]; a full turn is no tilt at all. */
const wrapRotation = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  const wrapped = ((((value + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 ? 180 : wrapped;
};

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
  rotation: wrapRotation(framing?.rotation ?? 0),
});

/** True when this framing is the default, so the UI can hide a reset nobody needs. */
export const isDefaultFraming = (framing: Partial<HeadshotFraming> | undefined): boolean => {
  const normalised = normaliseFraming(framing);
  return (
    normalised.x === DEFAULT_HEADSHOT_FRAMING.x &&
    normalised.y === DEFAULT_HEADSHOT_FRAMING.y &&
    normalised.zoom === DEFAULT_HEADSHOT_FRAMING.zoom &&
    normalised.rotation === 0
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
    rotation: current.rotation,
  });
};

/** Change zoom, keeping the current position. */
export const zoomFraming = (
  framing: Partial<HeadshotFraming> | undefined,
  zoom: number,
): HeadshotFraming => normaliseFraming({ ...normaliseFraming(framing), zoom });

/** Set the tilt in degrees, keeping position and zoom. */
export const rotateFraming = (
  framing: Partial<HeadshotFraming> | undefined,
  rotation: number,
): HeadshotFraming => normaliseFraming({ ...normaliseFraming(framing), rotation });

/** Turn by a relative amount — the quarter-turn buttons. */
export const rotateFramingBy = (
  framing: Partial<HeadshotFraming> | undefined,
  deltaDegrees: number,
): HeadshotFraming => rotateFraming(framing, (normaliseFraming(framing).rotation ?? 0) + deltaDegrees);

/**
 * The zoom at which a picture tilted by `rotation` degrees still fills the
 * circle. The picture is a rectangle turned inside a round window: at 45° its
 * edges cut across the rim and the background shows through unless it is also
 * enlarged by |cos θ| + |sin θ| — √2 at the worst case. At a quarter turn the
 * edges are square to the window again and nothing extra is needed.
 */
export const zoomToCoverRotation = (rotation: number): number => {
  const radians = (Math.abs(wrapRotation(rotation)) * Math.PI) / 180;
  const needed = Math.abs(Math.cos(radians)) + Math.abs(Math.sin(radians));
  return Math.min(MAX_HEADSHOT_ZOOM, Math.ceil(needed * 100) / 100);
};

/**
 * The CSS for an `<img>` filling a square avatar with this framing.
 *
 * `object-position` places the crop and `scale` zooms it. Scaling the image
 * rather than resizing the box keeps the circle exactly the size the layout
 * asked for, so a zoomed headshot never shifts the row it sits in.
 */
export const headshotImageStyle = (
  framing: Partial<HeadshotFraming> | undefined,
): { objectFit: 'cover'; objectPosition: string; transform?: string } => {
  const { x, y, zoom, rotation = 0 } = normaliseFraming(framing);
  // CSS applies a transform list right to left, so this enlarges first and
  // then turns the enlarged picture about the circle's centre — the picture
  // tilts in place rather than swinging around the rim.
  const transforms = [
    ...(rotation === 0 ? [] : [`rotate(${rotation}deg)`]),
    ...(zoom === 1 ? [] : [`scale(${zoom})`]),
  ];
  return {
    objectFit: 'cover',
    objectPosition: `${x}% ${y}%`,
    ...(transforms.length ? { transform: transforms.join(' ') } : {}),
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
  const zoomToUnlock = horizontal && vertical ? null : 1.2;
  return { horizontal, vertical, zoomToUnlock };
};
