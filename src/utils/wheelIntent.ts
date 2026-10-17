/**
 * What a wheel event means on a zoomable canvas.
 *
 * Browsers report three different gestures as `wheel` events:
 * - a touchpad pinch arrives with `ctrlKey` set and small deltas;
 * - a mouse wheel moves in notches: whole lines (`deltaMode` 1) or ~100 px
 *   steps with no sideways component;
 * - a touchpad two-finger scroll streams many small pixel deltas, often with
 *   some sideways movement.
 *
 * Zooming by a fixed step on every event turned a touchpad's stream into a
 * runaway zoom, and made scrolling with two fingers zoom too. Here a pinch and
 * a mouse wheel zoom in proportion to how far they moved, and a touchpad
 * scroll pans, as in design and map apps.
 */
export type WheelIntent = { kind: 'zoom'; factor: number } | { kind: 'pan'; dx: number; dy: number };

interface WheelLike {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  metaKey?: boolean;
}

/** Pixels per line when a browser reports whole lines. */
const LINE = 16;
/** Zoom per pixel of pinch, and per pixel of mouse wheel. */
const PINCH_SENSITIVITY = 0.01;
const WHEEL_SENSITIVITY = 0.0015;
/** No single event zooms more than this, whatever the device reports. */
const MAX_STEP = 1.25;

const clampFactor = (factor: number) => Math.min(MAX_STEP, Math.max(1 / MAX_STEP, factor));

/** Mouse wheels move in coarse notches; touchpads in fine pixel steps. */
export const isMouseWheel = (event: WheelLike): boolean =>
  event.deltaMode === 1 || (event.deltaX === 0 && Math.abs(event.deltaY) >= 50 && Number.isInteger(event.deltaY));

export const wheelIntent = (event: WheelLike): WheelIntent => {
  const scale = event.deltaMode === 1 ? LINE : event.deltaMode === 2 ? 400 : 1;
  const dx = event.deltaX * scale;
  const dy = event.deltaY * scale;
  if (event.ctrlKey || event.metaKey) return { kind: 'zoom', factor: clampFactor(Math.exp(-dy * PINCH_SENSITIVITY)) };
  if (isMouseWheel(event)) return { kind: 'zoom', factor: clampFactor(Math.exp(-dy * WHEEL_SENSITIVITY)) };
  return { kind: 'pan', dx, dy };
};
