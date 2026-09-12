/**
 * Continuity commands.
 *
 * The property worth the move is atomicity, not tidiness. Adding an unplanned
 * shot and logging its first take is ONE thing that happened on the floor. Two
 * separate writes put two entries on the undo stack, so a single Ctrl+Z leaves
 * either a shot nobody shot or a take pointing at a shot that is gone.
 *
 * The second theme is that take numbers are physical: they were called on a
 * slate and written on a card. Nothing here may renumber them after the fact.
 */
import { describe, expect, it } from 'vitest';
import type { Project, SceneSetup, Shot } from '../../../types';
import type { Take } from '../../continuity';
import {
  addUnplannedShotCommand,
  deleteTakeCommand,
  setContinuityDayFilterCommand,
  updateTakeCommand,
} from '../continuity';

const shot = (id: string, shotNumber: string, order: number): Shot =>
  ({
    id,
    sceneNumber: '1',
    shotNumber,
    name: `Shot ${shotNumber}`,
    cameraId: '',
    cameraLabel: 'A',
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
    estDurationSeconds: 10,
    order,
  }) as Shot;

const loggedProject = (): Project =>
  ({
    id: 'p1',
    title: 'Test Production',
    activeSetupId: 'setup-1',
    setups: [
      {
        id: 'setup-1',
        name: 'Scene 1',
        sceneNumber: '1',
        elements: [],
        shots: [shot('shot-a', '1A', 0), shot('shot-b', '1B', 1)],
      } as unknown as SceneSetup,
    ],
    productionDays: [
      { id: 'day-1', name: 'Day 1', scheduleBlockIds: [] },
      { id: 'day-2', name: 'Day 2', scheduleBlockIds: [] },
    ],
    takes: [
      { id: 'take-1', shotId: 'shot-a', takeNumber: 1, rollCard: 'A001' } as Take,
      { id: 'take-2', shotId: 'shot-a', takeNumber: 2 } as Take,
    ],
  }) as unknown as Project;

const shotsOf = (project: Project) => project.setups.flatMap((setup) => setup.shots ?? []);

describe('addUnplannedShotCommand', () => {
  it('adds the shot and its first take in one result', () => {
    const { project } = addUnplannedShotCommand(loggedProject(), { setupId: 'setup-1' });
    expect(shotsOf(project)).toHaveLength(3);
    expect(project.takes).toHaveLength(3);

    // The new take belongs to the new shot: a half-applied version of this is
    // exactly the state the single commit exists to prevent.
    const added = shotsOf(project).find((candidate) => candidate.unplanned === true);
    expect(added).toBeTruthy();
    expect(project.takes?.at(-1)?.shotId).toBe(added?.id);
  });

  it('marks the shot as unplanned without putting that in its number', () => {
    // The Shot column exported to Resolve has to read exactly what was on the
    // slate, so provenance is a flag and never a suffix.
    const { project } = addUnplannedShotCommand(loggedProject(), { setupId: 'setup-1' });
    const added = shotsOf(project).find((candidate) => candidate.unplanned === true)!;
    expect(added.shotNumber).not.toMatch(/unplanned|\*/i);
  });

  it('continues the scene numbering when appending', () => {
    const { project } = addUnplannedShotCommand(loggedProject(), { setupId: 'setup-1' });
    const added = shotsOf(project).find((candidate) => candidate.unplanned === true)!;
    // 1A and 1B are taken, so the next one carries on from there.
    expect(added.shotNumber).toBe('1C');
  });

  it('threads a number between neighbours when inserting', () => {
    const { project } = addUnplannedShotCommand(loggedProject(), {
      setupId: 'setup-1',
      afterShotId: 'shot-a',
    });
    const added = shotsOf(project).find((candidate) => candidate.unplanned === true)!;
    // Nothing already on a slate moves: 1A and 1B keep their numbers.
    expect(shotsOf(project).map((candidate) => candidate.shotNumber)).toContain('1A');
    expect(shotsOf(project).map((candidate) => candidate.shotNumber)).toContain('1B');
    expect(added.shotNumber).not.toBe('1A');
    expect(added.shotNumber).not.toBe('1B');
  });

  it('places an inserted shot directly after its neighbour', () => {
    const { project } = addUnplannedShotCommand(loggedProject(), {
      setupId: 'setup-1',
      afterShotId: 'shot-a',
      shotId: 'shot-new',
    });
    expect(shotsOf(project).map((candidate) => candidate.id)).toEqual([
      'shot-a',
      'shot-new',
      'shot-b',
    ]);
  });

  it('inherits sticky columns from the take the caller names', () => {
    const { project } = addUnplannedShotCommand(loggedProject(), {
      setupId: 'setup-1',
      previousTakeId: 'take-1',
    });
    expect(project.takes?.at(-1)?.rollCard).toBe('A001');
  });

  it('logs the take against the day it was shot on', () => {
    const { project } = addUnplannedShotCommand(loggedProject(), {
      setupId: 'setup-1',
      productionDayId: 'day-2',
    });
    expect(project.takes?.at(-1)?.productionDayId).toBe('day-2');
  });

  it('names the new shot number in the log', () => {
    const { meta } = addUnplannedShotCommand(loggedProject(), { setupId: 'setup-1' });
    expect(meta.description).toBe('Log unplanned shot 1C');
  });

  it('rejects an unknown setup, shot or take rather than guessing', () => {
    expect(() => addUnplannedShotCommand(loggedProject(), { setupId: 'nope' })).toThrow(
      /unknown setup id/,
    );
    expect(() =>
      addUnplannedShotCommand(loggedProject(), { setupId: 'setup-1', afterShotId: 'nope' }),
    ).toThrow(/unknown shot id/);
    expect(() =>
      addUnplannedShotCommand(loggedProject(), { setupId: 'setup-1', previousTakeId: 'nope' }),
    ).toThrow(/unknown previous take id/);
  });

  it('leaves the input project untouched', () => {
    const before = loggedProject();
    addUnplannedShotCommand(before, { setupId: 'setup-1' });
    expect(shotsOf(before)).toHaveLength(2);
    expect(before.takes).toHaveLength(2);
  });
});

describe('updateTakeCommand', () => {
  it('edits one take and names it as the slate would', () => {
    const { project, meta } = updateTakeCommand(loggedProject(), {
      takeId: 'take-2',
      patch: { rollCard: 'B004' },
    });
    expect(project.takes?.find((take) => take.id === 'take-2')?.rollCard).toBe('B004');
    expect(meta.description).toBe('Edit 1A take 2');
  });

  it('leaves every other take alone', () => {
    const { project } = updateTakeCommand(loggedProject(), {
      takeId: 'take-2',
      patch: { rollCard: 'B004' },
    });
    expect(project.takes?.find((take) => take.id === 'take-1')?.rollCard).toBe('A001');
  });

  it('rejects an unknown take', () => {
    expect(() =>
      updateTakeCommand(loggedProject(), { takeId: 'nope', patch: {} }),
    ).toThrow(/unknown take id/);
  });
});

describe('deleteTakeCommand', () => {
  it('removes only the named take', () => {
    const { project } = deleteTakeCommand(loggedProject(), { takeId: 'take-1' });
    expect(project.takes?.map((take) => take.id)).toEqual(['take-2']);
  });

  it('does NOT renumber the takes that remain', () => {
    // A take number was called on a slate and written on a card. Renumbering
    // would make the log disagree with the media, which is the one thing a
    // continuity log exists to prevent.
    const { project } = deleteTakeCommand(loggedProject(), { takeId: 'take-1' });
    expect(project.takes?.[0].takeNumber).toBe(2);
  });

  it('says which take went', () => {
    const { meta } = deleteTakeCommand(loggedProject(), { takeId: 'take-2' });
    expect(meta.description).toBe('Delete 1A take 2');
  });

  it('rejects an unknown take', () => {
    expect(() => deleteTakeCommand(loggedProject(), { takeId: 'nope' })).toThrow(
      /unknown take id/,
    );
  });
});

describe('setContinuityDayFilterCommand', () => {
  it('filters to a day and names it', () => {
    const { project, meta } = setContinuityDayFilterCommand(loggedProject(), {
      productionDayId: 'day-2',
    });
    expect(project.continuityDayFilterId).toBe('day-2');
    expect(meta.description).toBe('Show continuity for Day 2');
  });

  it('clears the filter back to the whole production', () => {
    const filtered = setContinuityDayFilterCommand(loggedProject(), {
      productionDayId: 'day-2',
    }).project;
    const { project, meta } = setContinuityDayFilterCommand(filtered, {});
    expect(project.continuityDayFilterId).toBeUndefined();
    expect(meta.description).toMatch(/whole production/);
  });

  it('rejects a day that does not exist', () => {
    expect(() =>
      setContinuityDayFilterCommand(loggedProject(), { productionDayId: 'day-9' }),
    ).toThrow(/unknown production day id/);
  });
});
