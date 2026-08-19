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
    frames[START_SLOT] = {
      image: shot.storyboardImage,
      fit: shot.storyboardFit,
      canvasPosition: shot.storyboardCanvasPosition,
    };
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
 * Build the `updateShot` payload that writes one frame. The first frame is
 * mirrored onto the legacy `storyboardImage` field so anything still reading it
 * (exports, thumbnails, the inspector) keeps showing the shot's key frame.
 */
export const setFramePatch = (
  shot: Shot,
  slotKey: string,
  updates: Partial<StoryboardFrame> | null
): Partial<Shot> => {
  const frames = framesOf(shot);

  if (updates === null) delete frames[slotKey];
  else frames[slotKey] = { ...(frames[slotKey] || { image: '' }), ...updates } as StoryboardFrame;

  const start = frames[START_SLOT];
  return {
    storyboardFrames: frames,
    // Legacy mirrors
    storyboardImage: start?.image,
    storyboardFit: start?.fit,
    storyboardCanvasPosition: start?.canvasPosition,
    storyboardImageEnd: undefined,
    storyboardFitEnd: undefined,
    storyboardCanvasPositionEnd: undefined,
  };
};

/** Frames actually holding artwork, in slot order — what the board/export show. */
export const boardedFrames = (shot: Shot, camera?: CameraElement | null): FrameSlot[] =>
  slotsOf(shot, camera).filter((slot) => !!slot.frame?.image);
