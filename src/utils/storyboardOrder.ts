import { SceneSetup, Shot } from '../types';

/**
 * Shots in storyboard-board order: whatever `storyboardOrder` lists first, then
 * any shot that isn't in that list yet (one added in the shot list or lined
 * from the script). The shot list's own order is left untouched.
 */
export const orderedStoryboardShots = (setup: SceneSetup): Shot[] => {
  const order = setup.storyboardOrder || [];
  if (order.length === 0) return setup.shots;
  return [
    ...order
      .map((id) => setup.shots.find((shot) => shot.id === id))
      .filter((shot): shot is Shot => !!shot),
    ...setup.shots.filter((shot) => !order.includes(shot.id)),
  ];
};
