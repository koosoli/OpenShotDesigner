/**
 * Stacking order on the floor plan.
 *
 * The canvas draws in layers by kind: the room's contents (furniture, props,
 * shapes, rigs, lights, cables) first, then walls, doors and windows, then
 * actors and cameras. Inside a layer, the elements array decides who is on
 * top. "Bring forward" used to only swap neighbours in that array, so nothing
 * could ever be brought over a wall — a rug, a set piece or a light standing
 * in a doorway always disappeared under it.
 *
 * `aboveWalls` adds the missing step: a raised element is drawn after the
 * walls (still under actors and cameras). Bring forward lifts an element over
 * the walls first, then moves it up among the other raised elements; send
 * backward does the reverse.
 */
import type { FloorPlanElement } from '../../types';

/** Kinds drawn under the walls unless raised. */
const UNDER_WALL_TYPES: ReadonlySet<string> = new Set([
  'prop', 'shape', 'track', 'measurement', 'arrow', 'text', 'cable', 'light',
]);

export const canRaiseAboveWalls = (element: FloorPlanElement): boolean => UNDER_WALL_TYPES.has(element.type);

const isRaised = (element: FloorPlanElement): boolean => (element as { aboveWalls?: boolean }).aboveWalls === true;

const withRaised = <T extends FloorPlanElement>(element: T, raised: boolean): T => {
  const next = { ...element } as T & { aboveWalls?: boolean };
  if (raised) next.aboveWalls = true;
  else delete next.aboveWalls;
  return next;
};

export type StackMove = 'forward' | 'backward' | 'front' | 'back';

/** The elements array after moving one element in the stack. Unchanged when it cannot move. */
export const restackElement = (
  elements: readonly FloorPlanElement[],
  id: string,
  move: StackMove,
): FloorPlanElement[] => {
  const index = elements.findIndex((element) => element.id === id);
  if (index === -1) return [...elements];
  const element = elements[index];
  const out = [...elements];
  const raisable = canRaiseAboveWalls(element);

  if (move === 'front') {
    out.splice(index, 1);
    out.push(raisable ? withRaised(element, true) : element);
    return out;
  }
  if (move === 'back') {
    out.splice(index, 1);
    out.unshift(raisable ? withRaised(element, false) : element);
    return out;
  }
  // Under the walls, the next step up is over them.
  if (move === 'forward' && raisable && !isRaised(element)) {
    out[index] = withRaised(element, true);
    return out;
  }
  // The lowest raised element steps back under the walls.
  if (move === 'backward' && raisable && isRaised(element)) {
    const lowerRaised = elements.slice(0, index).some((other) => canRaiseAboveWalls(other) && isRaised(other));
    if (!lowerRaised) {
      out[index] = withRaised(element, false);
      return out;
    }
  }
  const swapWith = move === 'forward' ? index + 1 : index - 1;
  if (swapWith < 0 || swapWith >= out.length) return out;
  [out[index], out[swapWith]] = [out[swapWith], out[index]];
  return out;
};
