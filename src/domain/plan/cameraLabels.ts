/**
 * Letters for the things on a floor plan that are identified by one.
 *
 * A camera's letter is not decoration: it reaches the shot list, the call
 * sheet, the slate and the `Camera #` column of the DaVinci Resolve metadata
 * export. Two cameras sharing a letter means two different setups claiming to
 * be the same camera, and the metadata import cannot tell them apart.
 *
 * Counting was the bug. `String.fromCharCode(65 + existingCameras.length)`
 * reads the number of cameras rather than which letters are taken, so it is
 * correct only while nothing is ever deleted: with A and C on the plan (B
 * struck), a count of 2 proposes "C" — a duplicate. Six call sites did this
 * and two others had already grown their own correct loop, which is exactly
 * the shape of a rule that wants to live in one tested place.
 *
 * Pure functions over the minimal element shape — no React, no I/O.
 */

/** The slice of a floor-plan element this needs; keeps it testable. */
export interface LabelledCamera {
  cameraLabel?: string;
}

/** An actor marker, identified on the plan by a character letter. */
export interface LetteredActor {
  characterLetter?: string;
}

/** Letters already claimed, upper-cased. A camera with no label counts as A. */
export const usedCameraLabels = (cameras: readonly LabelledCamera[]): Set<string> =>
  new Set(cameras.map((camera) => (camera.cameraLabel || 'A').toUpperCase()));

/**
 * The first letter not in `used`, starting from `startAt`.
 *
 * Wraps to A once the alphabet is exhausted: at 26 of anything on one setup the
 * naming scheme has run out, and a duplicate is a more honest failure than an
 * empty label.
 */
const firstFreeLetter = (used: ReadonlySet<string>, startAt: number): string => {
  for (let step = 0; step < 26; step += 1) {
    const candidate = String.fromCharCode(65 + ((startAt + step) % 26));
    if (!used.has(candidate)) return candidate;
  }
  return 'A';
};

/**
 * The first letter not in use.
 *
 * Starts at B because A is the shared default every project begins with, so a
 * user-created camera should not land on it while an unlabelled camera is
 * still holding it implicitly. If every letter through Z is taken the search
 * wraps to A — at 26 cameras on one setup the naming scheme has run out, and
 * returning a duplicate is a more honest failure than returning nothing.
 */
export const nextCameraLabel = (cameras: readonly LabelledCamera[]): string =>
  firstFreeLetter(usedCameraLabels(cameras), 1);

/**
 * The next free character letter for an actor marker.
 *
 * Starts at A, unlike cameras: there is no shared default actor the way Camera
 * A is the default camera, so the first actor on a plan is simply A.
 *
 * Same reason for reading the taken set rather than counting: with actors A and
 * C on the plan (B deleted), a count of 2 proposes C — two markers claiming to
 * be the same character, on a plan whose whole job is telling them apart.
 */
export const nextActorLetter = (actors: readonly LetteredActor[]): string =>
  firstFreeLetter(
    new Set(
      actors
        .map((actor) => (actor.characterLetter ?? '').trim().toUpperCase())
        .filter((letter) => letter.length > 0),
    ),
    0,
  );
