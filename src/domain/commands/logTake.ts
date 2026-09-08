/**
 * Log a continuity take as a pure domain command.
 *
 * Take numbering follows the slate rules in `domain/continuity`: the number
 * counts on from the highest number already logged against the same shot and
 * slate tag, so a base slate and its `-PU` pickup are independent series that
 * can each honestly have a Take 1. Sticky columns (roll cards, keywords,
 * camera and slate overrides) are inherited from the take the CALLER names —
 * see `previousTakeId`, and the note there on why the command does not pick
 * one itself.
 */
import type { Project } from '../../types';
import type { Take } from '../continuity';
import { seedNextTake, taggedShotNumber } from '../continuity';
import { createId } from '../ids';
import type { CommandResult } from './types';
import { commandTimestamp } from './types';

export interface LogTakeInput {
  shotId: string;
  slateTag?: Take['slateTag'];
  productionDayId?: string;
  /** Override the generated take id (tests, imports). Defaults to a new id. */
  takeId?: string;
  /** Override the logged-at timestamp. Defaults to now. */
  loggedAt?: string;
  /**
   * Which take the new one inherits its sticky columns from (roll cards,
   * keywords, camera and slate overrides).
   *
   * Explicit, because "the previous take" is a question only the caller can
   * answer. The continuity panel means the last take on the DAY being viewed —
   * that is what makes "the scene moved and the location changed with it" a
   * one-field edit. A command that instead guessed "the last take in the
   * project" would, on any day but the newest, seed the row from a take the
   * user is not even looking at. This command used to guess exactly that,
   * which is why it was never safe to wire in.
   *
   * Omitted means "no inheritance"; the take starts from the shot's own plan.
   */
  previousTakeId?: string;
}

const SLATE_TAGS: ReadonlySet<string> = new Set(['PU', 'RTK']);

export const logTakeCommand = (project: Project, input: LogTakeInput): CommandResult => {
  if (typeof input.shotId !== 'string' || input.shotId.trim() === '') {
    throw new Error('logTake: shotId must be a non-empty string.');
  }
  const owner = project.setups.find((setup) =>
    (setup.shots ?? []).some((shot) => shot.id === input.shotId),
  );
  const shot = owner?.shots.find((candidate) => candidate.id === input.shotId);
  if (!owner || !shot) {
    throw new Error(`logTake: unknown shot id "${input.shotId}".`);
  }
  if (input.slateTag !== undefined && !SLATE_TAGS.has(input.slateTag)) {
    throw new Error(`logTake: unknown slate tag "${input.slateTag}".`);
  }
  if (
    input.productionDayId !== undefined &&
    !(project.productionDays ?? []).some((day) => day.id === input.productionDayId)
  ) {
    throw new Error(`logTake: unknown production day id "${input.productionDayId}".`);
  }
  if (input.takeId !== undefined && input.takeId.trim() === '') {
    throw new Error('logTake: takeId must be a non-empty string when provided.');
  }
  const takeId = input.takeId ?? createId('take');
  if ((project.takes ?? []).some((take) => take.id === takeId)) {
    throw new Error(`logTake: take id "${takeId}" already exists.`);
  }
  const loggedAt = input.loggedAt ?? commandTimestamp();
  if (Number.isNaN(Date.parse(loggedAt))) {
    throw new Error(`logTake: loggedAt "${loggedAt}" is not a valid timestamp.`);
  }

  if (
    input.previousTakeId !== undefined &&
    !(project.takes ?? []).some((take) => take.id === input.previousTakeId)
  ) {
    throw new Error(`logTake: unknown previous take id "${input.previousTakeId}".`);
  }

  // Clone first so the append below cannot half-apply to the caller's project.
  const next: Project = structuredClone(project);
  const previous =
    input.previousTakeId === undefined
      ? undefined
      : (next.takes ?? []).find((take) => take.id === input.previousTakeId);
  const { take } = seedNextTake(next.takes ?? [], {
    id: takeId,
    shotId: input.shotId,
    ...(input.slateTag !== undefined ? { slateTag: input.slateTag } : {}),
    ...(input.productionDayId !== undefined
      ? { productionDayId: input.productionDayId }
      : {}),
    loggedAt,
    previous,
  });
  next.takes = [...(next.takes ?? []), take];

  const slate = taggedShotNumber(shot.shotNumber, input.slateTag);
  const name = shot.name.trim();
  const description =
    name.length > 0
      ? `Log Take ${take.takeNumber} for Shot ${slate} "${name}"`
      : `Log Take ${take.takeNumber} for Shot ${slate}`;

  return {
    project: next,
    meta: {
      type: 'logTake',
      entityId: take.id,
      timestamp: commandTimestamp(),
      description,
    },
  };
};
