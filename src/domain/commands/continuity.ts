/**
 * Continuity — the take log — as commands.
 *
 * Third cluster, and the one with the sharpest atomicity requirement in the
 * app. Adding an unplanned shot and logging its first take is ONE user action:
 * something happened on the floor that nobody planned, and it was shot. Split
 * across two writes it lands on the undo stack as two steps, so a single Ctrl+Z
 * leaves either a shot nobody ever shot, or — worse — a take pointing at a shot
 * that no longer exists.
 *
 * `ContinuityPanel` already knew this and did it in one `updateProjectMeta`
 * with a comment saying why. Moving it here does not make it more correct; it
 * makes the correctness reachable, testable, and impossible to undo by accident
 * in a future refactor that "tidies up" the two concerns into two writes.
 */
import type { Project, SceneSetup, Shot } from '../../types';
import type { Take } from '../continuity';
import { seedNextTake, taggedShotNumber } from '../continuity';
import { createId } from '../ids';
import { insertedShotNumber, nextShotNumberAfter, takenShotNumbers } from '../shots/numbering';
import type { CommandResult } from './types';
import { commandTimestamp } from './types';

const takesOf = (project: Project): Take[] => project.takes ?? [];

const shotFor = (project: Project, shotId: string): Shot | undefined =>
  project.setups.flatMap((setup) => setup.shots ?? []).find((shot) => shot.id === shotId);

/** How a take reads on a slate, for the log line. */
const takeLabel = (project: Project, take: Take): string => {
  const shot = shotFor(project, take.shotId);
  const slate = shot ? taggedShotNumber(shot.shotNumber, take.slateTag) : take.shotId.slice(0, 8);
  return `${slate} take ${take.takeNumber}`;
};

export interface UpdateTakeInput {
  takeId: string;
  patch: Partial<Take>;
}

/** Edit one logged take. */
export const updateTakeCommand = (project: Project, input: UpdateTakeInput): CommandResult => {
  const existing = takesOf(project).find((take) => take.id === input.takeId);
  if (!existing) {
    throw new Error(`updateTake: unknown take id "${input.takeId}".`);
  }
  return {
    project: {
      ...project,
      takes: takesOf(project).map((take) =>
        take.id === input.takeId ? { ...take, ...input.patch } : take,
      ),
    },
    meta: {
      type: 'updateTake',
      entityId: input.takeId,
      timestamp: commandTimestamp(),
      description: `Edit ${takeLabel(project, existing)}`,
    },
  };
};

export interface DeleteTakeInput {
  takeId: string;
}

/**
 * Remove a logged take.
 *
 * Deliberately does NOT renumber the takes that follow. A take number is what
 * was called on the slate and what is written on the card; renumbering after a
 * delete would make the log disagree with the media, which is the one thing a
 * continuity log exists to prevent.
 */
export const deleteTakeCommand = (project: Project, input: DeleteTakeInput): CommandResult => {
  const existing = takesOf(project).find((take) => take.id === input.takeId);
  if (!existing) {
    throw new Error(`deleteTake: unknown take id "${input.takeId}".`);
  }
  return {
    project: { ...project, takes: takesOf(project).filter((take) => take.id !== input.takeId) },
    meta: {
      type: 'deleteTake',
      entityId: input.takeId,
      timestamp: commandTimestamp(),
      description: `Delete ${takeLabel(project, existing)}`,
    },
  };
};

export interface AddUnplannedShotInput {
  setupId: string;
  /** Insert after this shot; absent appends to the end of the setup. */
  afterShotId?: string;
  /** Day the take is logged against. */
  productionDayId?: string;
  /** Take whose sticky columns the new take inherits (see `logTake`). */
  previousTakeId?: string;
  /** Override the generated ids, for tests and imports. */
  shotId?: string;
  takeId?: string;
  loggedAt?: string;
}

/**
 * Add a shot nobody planned and log its first take, in one commit.
 *
 * The number comes from the scene's existing shots by the same letter
 * algorithm locked scene numbers use, so nothing already on a slate moves:
 * 1A–1F planned means the insert is 1G. Provenance is the `unplanned` flag and
 * never part of the number — the Shot column exported to Resolve has to read
 * exactly what was on the slate.
 */
export const addUnplannedShotCommand = (
  project: Project,
  input: AddUnplannedShotInput,
): CommandResult => {
  const setup: SceneSetup | undefined = project.setups.find(
    (candidate) => candidate.id === input.setupId,
  );
  if (!setup) {
    throw new Error(`addUnplannedShot: unknown setup id "${input.setupId}".`);
  }
  if (
    input.previousTakeId !== undefined &&
    !takesOf(project).some((take) => take.id === input.previousTakeId)
  ) {
    throw new Error(`addUnplannedShot: unknown previous take id "${input.previousTakeId}".`);
  }

  const existingShots = setup.shots ?? [];
  const afterIndex = input.afterShotId
    ? existingShots.findIndex((candidate) => candidate.id === input.afterShotId)
    : -1;
  if (input.afterShotId && afterIndex === -1) {
    throw new Error(`addUnplannedShot: unknown shot id "${input.afterShotId}".`);
  }

  // Mirrors ContinuityPanel exactly, including the SETUP-scoped namespace:
  // an insert threads a letter between its neighbours, an append continues
  // from the last shot. Widening this to the whole production would change
  // the numbers on projects that already exist, and a shot number is what was
  // called on the slate.
  const shotNumber =
    afterIndex >= 0
      ? insertedShotNumber(
          existingShots[afterIndex]?.shotNumber,
          existingShots[afterIndex + 1]?.shotNumber,
          takenShotNumbers(existingShots),
          setup.sceneNumber,
        )
      : nextShotNumberAfter(existingShots, setup.sceneNumber);

  const shotId = input.shotId ?? createId('shot');
  const shot: Shot = {
    id: shotId,
    sceneNumber: setup.sceneNumber,
    shotNumber,
    name: 'Unplanned',
    cameraId: '',
    cameraLabel: '',
    shotSize: 'MS',
    lensMm: 35,
    cameraAngle: 'Eye Level',
    movement: 'Static',
    aspectRatio: '16:9',
    frameRate: 25,
    subjectActorIds: [],
    framingDescription: '',
    status: 'planned',
    takesCount: 0,
    estDurationSeconds: 0,
    order: afterIndex >= 0 ? afterIndex + 1 : existingShots.length,
    unplanned: true,
  } as Shot;

  const previous = input.previousTakeId
    ? takesOf(project).find((take) => take.id === input.previousTakeId)
    : undefined;
  const { take } = seedNextTake(takesOf(project), {
    id: input.takeId ?? createId('take'),
    shotId,
    ...(input.productionDayId ? { productionDayId: input.productionDayId } : {}),
    loggedAt: input.loggedAt ?? commandTimestamp(),
    previous,
  });

  return {
    project: {
      ...project,
      setups: project.setups.map((candidate) => {
        if (candidate.id !== input.setupId) return candidate;
        const current = candidate.shots ?? [];
        const insertionIndex = afterIndex >= 0 ? afterIndex + 1 : current.length;
        const next = [...current];
        next.splice(insertionIndex, 0, shot);
        // Re-index so `order` stays dense; the NUMBER is untouched.
        return { ...candidate, shots: next.map((entry, order) => ({ ...entry, order })) };
      }),
      takes: [...takesOf(project), take],
    },
    meta: {
      type: 'addUnplannedShot',
      entityId: shotId,
      timestamp: commandTimestamp(),
      description: `Log unplanned shot ${shotNumber}`,
    },
  };
};

export interface SetContinuityDayFilterInput {
  /** Absent means "whole production". */
  productionDayId?: string;
}

/** Which shooting day the continuity log is filtered to. */
export const setContinuityDayFilterCommand = (
  project: Project,
  input: SetContinuityDayFilterInput,
): CommandResult => {
  if (
    input.productionDayId !== undefined &&
    !(project.productionDays ?? []).some((day) => day.id === input.productionDayId)
  ) {
    throw new Error(`setContinuityDayFilter: unknown production day id "${input.productionDayId}".`);
  }
  const day = (project.productionDays ?? []).find(
    (candidate) => candidate.id === input.productionDayId,
  );
  return {
    project: { ...project, continuityDayFilterId: input.productionDayId },
    meta: {
      type: 'setContinuityDayFilter',
      timestamp: commandTimestamp(),
      description: day ? `Show continuity for ${day.name}` : 'Show continuity for the whole production',
    },
  };
};
