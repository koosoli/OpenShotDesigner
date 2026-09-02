/**
 * What a new take inherits from the one before it.
 *
 * The interaction the whole feature is built around: log a take, and the next
 * one arrives already filled in, so only what actually changed gets typed. If
 * logging a take takes more than a few seconds it will not be used on set, and
 * the checklist half goes stale with it.
 *
 * The rules live here as one table rather than as `?? previous.x` scattered
 * through a component, because they are the feature's behaviour and they have
 * to be testable without a DOM. Three kinds:
 *
 *  - CARRY: the value persists until changed. Roll card, keywords, camera
 *    settings, where we are.
 *  - INCREMENT: the take number, which counts on while the shot stays put.
 *  - RESET: the fields that describe THIS take and nothing else — the file
 *    name, the good flag, the comments. Carrying those forward would be
 *    confidently wrong: a NG take inheriting the previous take's "good" mark
 *    is a lie that survives all the way into the grade.
 *
 * Changing shot resets the take number to 1, which is the one rule everyone
 * expects and the one most often got wrong.
 */

import type { Take, TakeCameraOverrides, TakeSlateOverrides } from './types';

/** The fields a fresh take inherits, named so the UI can badge them. */
export const INHERITED_FIELDS = [
  'rollCard',
  // Sound rolls over on its own schedule, so it carries independently of the
  // camera card rather than alongside it.
  'soundRoll',
  'keywords',
  'cameraOverrides',
  'slateOverrides',
] as const;

/** The fields that always start empty, however the previous take was filled. */
export const RESET_FIELDS = [
  'fileName',
  'soundFileName',
  'isGoodTake',
  'comments',
  'soundNotes',
  // MOS and wild track describe THIS take. Carrying MOS forward would mark the
  // next take silent and send the editor looking for audio that was recorded.
  'mos',
  'wildTrack',
] as const;

export type InheritedField = (typeof INHERITED_FIELDS)[number];

export interface NextTakeSeed {
  /** The take being continued from, if any. */
  previous?: Take;
  /** The shot the new take covers. */
  shotId: string;
  /** Optional slate series within the shot (`PU`, `RTK`). */
  slateTag?: Take['slateTag'];
  productionDayId?: string;
  /** Injected rather than read from a clock, so the function stays pure. */
  loggedAt?: string;
  id: string;
}

export interface SeededTake {
  take: Take;
  /**
   * Which fields came from the previous take rather than from the user. The UI
   * shows these differently — inherited-but-wrong metadata is worse than blank
   * metadata, because nobody looks at it twice.
   */
  inherited: InheritedField[];
}

const isEmpty = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && value.trim() === '') ||
  (Array.isArray(value) && value.length === 0) ||
  (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length === 0);

/**
 * The take number for a new take in one slate series on `shotId`.
 *
 * Counts on from the highest number already logged against that shot and tag
 * rather than from the previous take. A base slate and `-PU` are independent
 * series, so both can honestly have a Take 1; returning to either later still
 * continues the correct series.
 */
export const nextTakeNumber = (
  takes: readonly Take[],
  shotId: string,
  slateTag?: Take['slateTag'],
): number => {
  let highest = 0;
  for (const take of takes) {
    if (take.shotId !== shotId) continue;
    if (take.slateTag !== slateTag) continue;
    if (take.takeNumber > highest) highest = take.takeNumber;
  }
  return highest + 1;
};

/**
 * Build the next take: inherit what carries, increment the take number, leave
 * the per-take fields blank.
 *
 * `previous` is the take last logged, whatever shot it was on — that is what
 * makes "the scene moved and the location changed with it" a one-field edit
 * rather than a re-entry of the whole row.
 */
export const seedNextTake = (takes: readonly Take[], seed: NextTakeSeed): SeededTake => {
  const { previous, shotId, slateTag, productionDayId, loggedAt, id } = seed;
  const inherited: InheritedField[] = [];

  const take: Take = {
    id,
    shotId,
    takeNumber: nextTakeNumber(takes, shotId, slateTag),
    ...(slateTag !== undefined ? { slateTag } : {}),
    ...(productionDayId !== undefined ? { productionDayId } : {}),
    ...(loggedAt !== undefined ? { loggedAt } : {}),
  };

  if (previous) {
    if (!isEmpty(previous.rollCard)) {
      take.rollCard = previous.rollCard;
      inherited.push('rollCard');
    }
    if (!isEmpty(previous.soundRoll)) {
      take.soundRoll = previous.soundRoll;
      inherited.push('soundRoll');
    }
    if (!isEmpty(previous.keywords)) {
      take.keywords = [...(previous.keywords as string[])];
      inherited.push('keywords');
    }
    if (!isEmpty(previous.cameraOverrides)) {
      take.cameraOverrides = { ...(previous.cameraOverrides as TakeCameraOverrides) };
      inherited.push('cameraOverrides');
    }
    if (!isEmpty(previous.slateOverrides)) {
      take.slateOverrides = { ...(previous.slateOverrides as TakeSlateOverrides) };
      inherited.push('slateOverrides');
    }
  }

  return { take, inherited };
};
