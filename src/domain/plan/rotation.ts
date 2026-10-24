/**
 * The angle people see, and the angle the plan stores.
 *
 * Elements store their rotation with 0° pointing right (the SVG convention
 * the canvas draws with; 90° points down the screen). People read a floor
 * plan from the camera side, so the app shows angles with 0° pointing DOWN —
 * an actor facing the camera at the foot of the plan is 0°, not 90° — and
 * turning clockwise still counts up (90° left, 180° up, 270° right).
 *
 * Only what is shown and typed changes: stored data, drawings and exports of
 * geometry stay as they are, so every saved project looks exactly the same.
 */

const normalise = (degrees: number): number => {
  const value = ((Math.round(degrees) % 360) + 360) % 360;
  return value === 360 ? 0 : value;
};

/** The offset between the two conventions: stored 90° (down) is shown as 0°. */
export const DISPLAY_ROTATION_OFFSET = 90;

/** A stored rotation as people see it (0° = pointing down). */
export const toDisplayRotation = (stored: number | undefined): number => normalise((stored ?? 0) - DISPLAY_ROTATION_OFFSET);

/** An angle people typed (0° = pointing down) as the plan stores it. */
export const fromDisplayRotation = (display: number): number => normalise(display + DISPLAY_ROTATION_OFFSET);

/** Where a shown angle points, for the quick-pick buttons. */
export const DISPLAY_FACINGS: ReadonlyArray<{ display: number; label: string }> = [
  { display: 0, label: 'Down' },
  { display: 90, label: 'Left' },
  { display: 180, label: 'Up' },
  { display: 270, label: 'Right' },
];

/**
 * Elements that face a direction: an actor's eyeline, a camera's lens, a
 * lamp's beam. These are shown with 0° = facing down. Layout objects (walls,
 * furniture, shapes, text, ink) keep 0° = as drawn — "pointing down" means
 * nothing for a text label, and it would read 270° unrotated.
 */
const FACING_TYPES: ReadonlySet<string> = new Set(['actor', 'camera', 'light']);

export const usesFacingRotation = (type: string | undefined): boolean => !!type && FACING_TYPES.has(type);

/** The angle shown for an element of `type` (facing elements: 0° = down). */
export const shownRotation = (type: string | undefined, stored: number | undefined): number =>
  usesFacingRotation(type) ? toDisplayRotation(stored) : normalise(stored ?? 0);

/** The stored angle for what was typed on an element of `type`. */
export const storedRotation = (type: string | undefined, shown: number): number =>
  usesFacingRotation(type) ? fromDisplayRotation(shown) : normalise(shown);
