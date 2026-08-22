import { CameraElement, Shot, StoryboardFrame, Vector2D } from '../types';

/**
 * Storyboard frames per camera keyframe.
 *
 * A shot is boarded once per position the camera holds: the start, every
 * waypoint on its move, and the end. Frames are keyed by waypoint id (the base
 * position uses `START_SLOT`), so adding or removing a waypoint never
 * re-shuffles the artwork that is already attached.
 */

export const START_SLOT = 'start';
/** Legacy key for an end frame recorded before the camera had waypoints. */
export const END_SLOT = 'end';

export interface FrameSlot {
  /** Key used in `Shot.storyboardFrames`. */
  key: string;
  /** "Start", "Beat 2", "End" — what the user sees. */
  label: string;
  /** Short badge for the canvas / print. */
  short: string;
  /** Where this frame's camera position is on the floor plan. */
  anchor: Vector2D;
  frame?: StoryboardFrame;
}

/** The frames stored on a shot, with the legacy single/at-end fields folded in. */
export const framesOf = (shot: Shot): Record<string, StoryboardFrame> => {
  const frames: Record<string, StoryboardFrame> = { ...(shot.storyboardFrames || {}) };

  if (!frames[START_SLOT] && shot.storyboardImage) {
    // The legacy field also mirrors non-start frames (see setFramePatch), so
    // only fold it into 'start' when the art does not already live in a slot —
    // otherwise every read would duplicate the mirrored frame.
    const mirroredElsewhere = Object.keys(frames).some(
      (key) => frames[key]?.image === shot.storyboardImage
    );
    if (!mirroredElsewhere) {
      frames[START_SLOT] = {
        image: shot.storyboardImage,
        fit: shot.storyboardFit,
        canvasPosition: shot.storyboardCanvasPosition,
      };
    }
  }
  if (shot.storyboardImageEnd && !Object.keys(frames).some((key) => key !== START_SLOT)) {
    frames[END_SLOT] = {
      image: shot.storyboardImageEnd,
      fit: shot.storyboardFitEnd,
      canvasPosition: shot.storyboardCanvasPositionEnd,
    };
  }
  return frames;
};

/**
 * Every slot this shot can be boarded on, in playing order: the camera's start
 * position, then one per waypoint. A camera without a move has a single slot.
 */
export const slotsOf = (shot: Shot, camera?: CameraElement | null): FrameSlot[] => {
  const frames = framesOf(shot);
  const waypoints = (camera?.path || []).slice().sort((a, b) => (a.beat || 0) - (b.beat || 0));
  const base: Vector2D = camera ? { x: camera.x, y: camera.y } : { x: 0, y: 0 };

  const slots: FrameSlot[] = [
    {
      key: START_SLOT,
      label: waypoints.length ? 'Start' : 'Frame',
      short: waypoints.length ? 'START' : '',
      anchor: base,
      frame: frames[START_SLOT],
    },
  ];

  waypoints.forEach((waypoint, index) => {
    const isLast = index === waypoints.length - 1;
    slots.push({
      key: waypoint.id,
      label: isLast ? 'End' : `Beat ${waypoint.beat ?? index + 2}`,
      short: isLast ? 'END' : `B${waypoint.beat ?? index + 2}`,
      anchor: { x: waypoint.x, y: waypoint.y },
      // An end frame recorded before waypoints existed shows on the last one
      frame: frames[waypoint.id] || (isLast ? frames[END_SLOT] : undefined),
    });
  });

  // A legacy end frame with no waypoints to hang it on still gets a slot
  if (!waypoints.length && frames[END_SLOT]) {
    slots.push({
      key: END_SLOT,
      label: 'End',
      short: 'END',
      anchor: { x: base.x + 60, y: base.y + 60 },
      frame: frames[END_SLOT],
    });
  }

  return slots;
};

/**
 * The frame that stands for the shot: its start frame when boarded, otherwise
 * the first slot that carries art.
 *
 * This used to be answered by the `storyboardImage` field, which
 * `setFramePatch` kept mirrored on every write. That was one picture stored
 * twice, and the two could disagree: anything writing `storyboardImage`
 * directly left `storyboardFrames` stale, and `framesOf` needed a
 * "mirroredElsewhere" check to avoid showing the same frame twice.
 *
 * Reading the legacy fields continues — old projects are full of them, and
 * `framesOf` folds them in. What has stopped is writing them.
 */
export const keyFrame = (shot: Shot): StoryboardFrame | undefined => {
  const frames = framesOf(shot);
  const start = frames[START_SLOT];
  return start?.image ? start : Object.values(frames).find((frame) => frame?.image);
};

/** Just the image reference of {@link keyFrame}. */
export const keyFrameImage = (shot: Shot): string | undefined => keyFrame(shot)?.image;

/**
 * Build the `updateShot` payload that writes one frame.
 *
 * `storyboardFrames` is the only thing written. The legacy single-image fields
 * are explicitly cleared, so a shot sheds them the first time it is boarded —
 * `framesOf` has already folded their content into `frames` above, so nothing
 * is lost, and the shot stops carrying the same picture in two places.
 */
export const setFramePatch = (
  shot: Shot,
  slotKey: string,
  updates: Partial<StoryboardFrame> | null
): Partial<Shot> => {
  const frames = framesOf(shot);

  if (updates === null) delete frames[slotKey];
  else frames[slotKey] = { ...(frames[slotKey] || { image: '' }), ...updates } as StoryboardFrame;

  return {
    storyboardFrames: frames,
    // Retired mirrors: cleared, never written.
    storyboardImage: undefined,
    storyboardFit: undefined,
    storyboardCanvasPosition: undefined,
    storyboardImageEnd: undefined,
    storyboardFitEnd: undefined,
    storyboardCanvasPositionEnd: undefined,
  };
};

/** Frames actually holding artwork, in slot order — what the board/export show. */
export const boardedFrames = (shot: Shot, camera?: CameraElement | null): FrameSlot[] =>
  slotsOf(shot, camera).filter((slot) => !!slot.frame?.image);

/**
 * Check if a specific frame slot is omitted for a shot.
 * The primary START_SLOT is never omitted.
 *
 * Precedence:
 * 1. `START_SLOT` ('start') is ALWAYS visible.
 * 2. If `shot.omittedStoryboardSlots` is defined on the shot, it is the
 *    authoritative source of truth for that shot:
 *    - Key present in `omittedStoryboardSlots` -> OMITTED
 *    - Key NOT present in `omittedStoryboardSlots` -> SHOWN (even if blank)
 * 3. If `shot.omittedStoryboardSlots` is undefined (not manually customized yet):
 *    - Falls back to `omitBlankWaypoints`: if true and the slot has no image, it is omitted.
 */
export const isSlotOmitted = (
  shot: Shot,
  slotKey: string,
  omitBlankWaypoints = false,
  slotFrameImage?: string
): boolean => {
  if (slotKey === START_SLOT) return false;
  if (shot.omittedStoryboardSlots !== undefined) {
    return shot.omittedStoryboardSlots.includes(slotKey);
  }
  if (omitBlankWaypoints && !slotFrameImage) {
    return true;
  }
  return false;
};

/**
 * Slots to display on the storyboard panel or export contact sheet.
 * Takes into account both individually omitted slots (`shot.omittedStoryboardSlots`)
 * and the optional global `omitBlankWaypoints` setting.
 * The shot's base frame (`START_SLOT`) is always kept.
 */
export const visibleStoryboardSlots = (
  shot: Shot,
  camera?: CameraElement | null,
  omitBlankWaypoints = false
): FrameSlot[] => {
  const slots = slotsOf(shot, camera);
  return slots.filter((slot) => !isSlotOmitted(shot, slot.key, omitBlankWaypoints, slot.frame?.image));
};

/**
 * Toggle omission for a single slot on a shot.
 */
export const toggleSlotOmittedPatch = (
  shot: Shot,
  slotKey: string,
  camera?: CameraElement | null,
  omitBlankWaypoints = false
): Partial<Shot> => {
  if (slotKey === START_SLOT) return {};
  const allSlots = slotsOf(shot, camera);
  const currentOmitted =
    shot.omittedStoryboardSlots ??
    (omitBlankWaypoints
      ? allSlots.filter((s) => s.key !== START_SLOT && !s.frame?.image).map((s) => s.key)
      : []);

  const next = currentOmitted.includes(slotKey)
    ? currentOmitted.filter((key) => key !== slotKey)
    : [...currentOmitted, slotKey];

  return { omittedStoryboardSlots: next };
};

/**
 * Set omission state for a specific slot on a shot.
 */
export const setSlotOmittedPatch = (
  shot: Shot,
  slotKey: string,
  omitted: boolean,
  camera?: CameraElement | null,
  omitBlankWaypoints = false
): Partial<Shot> => {
  if (slotKey === START_SLOT) return {};
  const allSlots = slotsOf(shot, camera);
  const currentOmitted =
    shot.omittedStoryboardSlots ??
    (omitBlankWaypoints
      ? allSlots.filter((s) => s.key !== START_SLOT && !s.frame?.image).map((s) => s.key)
      : []);

  if (omitted && !currentOmitted.includes(slotKey)) {
    return { omittedStoryboardSlots: [...currentOmitted, slotKey] };
  }
  if (!omitted && currentOmitted.includes(slotKey)) {
    return { omittedStoryboardSlots: currentOmitted.filter((key) => key !== slotKey) };
  }
  return { omittedStoryboardSlots: currentOmitted };
};

/**
 * Apply a quick framing preset to a shot's omitted slots:
 * - 'all': Show all waypoints (clears omission list and ensures everything is visible)
 * - 'start-end': Keep Start and End only (omits intermediate waypoints)
 * - 'omit-blank': Omits all unboarded waypoints on this shot
 */
export const setSlotsPresetPatch = (
  shot: Shot,
  camera: CameraElement | null | undefined,
  preset: 'all' | 'start-end' | 'omit-blank'
): Partial<Shot> => {
  const allSlots = slotsOf(shot, camera);
  if (preset === 'all') {
    return { omittedStoryboardSlots: [] };
  }
  if (preset === 'start-end') {
    if (allSlots.length <= 2) {
      return { omittedStoryboardSlots: [] };
    }
    // Keep first (index 0) and last (index length-1), omit everything in between
    const intermediateKeys = allSlots.slice(1, -1).map((s) => s.key);
    return { omittedStoryboardSlots: intermediateKeys };
  }
  if (preset === 'omit-blank') {
    const blankWaypointKeys = allSlots
      .filter((s) => s.key !== START_SLOT && !s.frame?.image)
      .map((s) => s.key);
    return { omittedStoryboardSlots: blankWaypointKeys };
  }
  return {};
};
