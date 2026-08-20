import { CameraElement, CameraMovement, Shot } from '../types';

/**
 * True when a camera carries a move path (waypoints) on the floor plan.
 */
export const hasCameraMove = (camera?: CameraElement | null): boolean =>
  !!camera && !!camera.path && camera.path.length > 0;

/**
 * The movement a shot should show. A camera with waypoints physically travels,
 * so it can never be "Static": when no movement was chosen (or the stored value
 * is the contradictory default) we default to Tracking, which is what the user
 * usually means when they draw a move path.
 */
export const effectiveMovement = (shot: Shot, camera?: CameraElement | null): CameraMovement => {
  const move = hasCameraMove(camera);
  const chosen = shot.movement || (move ? 'Tracking' : 'Static');
  return move && chosen === 'Static' ? 'Tracking' : chosen;
};