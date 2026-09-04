/**
 * Delete a shot as a pure domain command.
 *
 * Mirrors the referential cleanup the app already performs when a shot is
 * deleted: the shot itself, its continuity takes, the script lines lined for
 * it, the schedule strips covering it, the storyboard order entries, the
 * lining marks on the owning setup, the AV script scaffolding rows, and the
 * floor-plan camera when no sibling shot still uses it. Sibling shots keep
 * their numbers: production identifiers are never renumbered by a delete.
 */
import type { Project, Shot } from '../../types';
import { removeShotReferences } from '../integrity';
import { rowsAfterShotRemoval } from '../script';
import type { CommandResult } from './types';
import { commandTimestamp } from './types';

export interface DeleteShotInput {
  shotId: string;
}

const allShotsOf = (project: Project): Shot[] =>
  project.setups.flatMap((setup) => setup.shots ?? []);

const describeShot = (shot: Shot): string => {
  const name = shot.name.trim();
  return name.length > 0
    ? `Delete Shot ${shot.shotNumber} "${name}" (Scene ${shot.sceneNumber})`
    : `Delete Shot ${shot.shotNumber} (Scene ${shot.sceneNumber})`;
};

export const deleteShotCommand = (
  project: Project,
  input: DeleteShotInput,
): CommandResult => {
  if (typeof input.shotId !== 'string' || input.shotId.trim() === '') {
    throw new Error('deleteShot: shotId must be a non-empty string.');
  }
  const shotId = input.shotId;
  const owner = project.setups.find((setup) =>
    (setup.shots ?? []).some((shot) => shot.id === shotId),
  );
  if (!owner) {
    throw new Error(`deleteShot: unknown shot id "${shotId}".`);
  }
  const removed = owner.shots.find((shot) => shot.id === shotId);
  if (!removed) {
    throw new Error(`deleteShot: unknown shot id "${shotId}".`);
  }

  // Everything below works on a clone, so a failure mid-command can never
  // leave the caller's project half-applied.
  const next: Project = structuredClone(project);
  const nextOwner = next.setups.find((setup) => setup.id === owner.id);
  if (!nextOwner) {
    throw new Error(`deleteShot: unknown shot id "${shotId}".`);
  }
  const remaining = nextOwner.shots.filter((shot) => shot.id !== shotId);
  nextOwner.shots = remaining;

  // The removed shot's camera goes with it when no sibling still uses it, so
  // it does not linger on the canvas (same rule as the app's delete path).
  if (removed.cameraId && !remaining.some((shot) => shot.cameraId === removed.cameraId)) {
    nextOwner.elements = nextOwner.elements.filter(
      (element) => element.id !== removed.cameraId,
    );
  }
  if (nextOwner.storyboardOrder) {
    nextOwner.storyboardOrder = nextOwner.storyboardOrder.filter((id) => id !== shotId);
  }
  nextOwner.scriptMarks = (nextOwner.scriptMarks ?? []).filter(
    (mark) => mark.shotId !== shotId,
  );

  // Schedule strips, script linings and continuity takes. Pass the slices the
  // app passes, including when absent, so the cleanup matches exactly.
  const cleaned = removeShotReferences(
    {
      scheduleBlocks: next.scheduleBlocks,
      productionDays: next.productionDays,
      scriptLines: next.scriptLines,
      takes: next.takes,
    },
    shotId,
  );
  next.scheduleBlocks = cleaned.scheduleBlocks;
  next.productionDays = cleaned.productionDays;
  next.scriptLines = cleaned.scriptLines;
  next.takes = cleaned.takes;

  // AV rows: unwritten scaffolding goes with the shot, written copy survives
  // unlinked. Numbers resolve against the pre-removal shot list, where the
  // deleted shot's number is still known.
  next.avScriptRows = rowsAfterShotRemoval(
    next.avScriptRows ?? [],
    new Set([shotId]),
    allShotsOf(project),
  );

  return {
    project: next,
    meta: {
      type: 'deleteShot',
      entityId: shotId,
      timestamp: commandTimestamp(),
      description: describeShot(removed),
    },
  };
};
