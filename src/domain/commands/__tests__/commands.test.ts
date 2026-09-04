/**
 * Domain commands: deleteShot, logTake, moveScheduleBlock.
 *
 * Each command is a pure (project, input) => result function. These tests pin
 * the happy path including referential cleanup, the validation errors, the
 * all-or-nothing atomicity, and the human-readable metadata.
 */
import { describe, expect, it } from 'vitest';
import type {
  AVScriptRow,
  CameraElement,
  Project,
  SceneSetup,
  ScriptLine,
  Shot,
} from '../../../types';
import type { Take } from '../../continuity';
import { deleteShotCommand } from '../deleteShot';
import { logTakeCommand } from '../logTake';
import { moveScheduleBlockCommand } from '../moveScheduleBlock';

const shot = (overrides: Partial<Shot> & Pick<Shot, 'id'>): Shot => ({
  sceneNumber: '1',
  shotNumber: '1/1',
  name: 'Wide',
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
  order: 1,
  ...overrides,
});

const camera = (id: string): CameraElement => ({
  id,
  type: 'camera',
  x: 0,
  y: 0,
  rotation: 0,
  name: 'Cam A',
  cameraLabel: 'A',
  color: '#fff',
  focalLength: 35,
  sensorFormat: 'Super35',
  fovAngle: 40,
  aspectRatio: '16:9',
  cameraHeight: 'Eye Level',
  rigType: 'Tripod',
  throwDistance: 400,
  path: [],
});

const setup = (overrides: Partial<SceneSetup> & Pick<SceneSetup, 'id'>): SceneSetup => ({
  name: 'Setup 1',
  sceneNumber: '1',
  location: 'Studio',
  timeOfDay: 'Day INT',
  elements: [],
  shots: [],
  gridSettings: { size: 40, snap: true, showGrid: true, unit: 'm', pixelsPerUnit: 40 },
  currentBeat: 1,
  totalBeats: 1,
  canvasScale: 1,
  canvasOffset: { x: 0, y: 0 },
  ...overrides,
});

const buildProject = (): Project => ({
  id: 'proj-1',
  title: 'Command fixture',
  director: 'Director',
  cinematographer: 'DOP',
  date: '2026-09-04',
  activeSetupId: 'setup-1',
  setups: [
    setup({
      id: 'setup-1',
      shots: [
        shot({ id: 'shot-1', shotNumber: '1/1', name: 'Wide', cameraId: 'cam-1' }),
        shot({ id: 'shot-2', shotNumber: '1/2', name: 'Close', cameraId: 'cam-1' }),
      ],
      elements: [camera('cam-1')],
      storyboardOrder: ['shot-1', 'shot-2'],
      scriptMarks: [
        {
          id: 'mark-1',
          shotId: 'shot-1',
          startLineId: 'l1',
          endLineId: 'l1',
          label: '1/1',
          color: '#fff',
        },
      ],
    }),
  ],
  scheduleBlocks: [
    { id: 'block-solo', kind: 'shots', shotIds: ['shot-1'] },
    { id: 'block-shared', kind: 'shots', shotIds: ['shot-1', 'shot-2'] },
    { id: 'block-scene', kind: 'scene', scriptSceneId: 'scene-1' },
  ],
  productionDays: [
    { id: 'day-1', name: 'Day 1', scheduleBlockIds: ['block-solo', 'block-shared'] },
    { id: 'day-2', name: 'Day 2', scheduleBlockIds: ['block-scene'] },
  ],
  scriptLines: [
    { id: 'l1', lineNumber: 1, text: 'ANGLE ON', linkedShotId: 'shot-1' } as ScriptLine,
    { id: 'l2', lineNumber: 2, text: 'CUT TO', linkedShotId: 'shot-2' } as ScriptLine,
  ],
  takes: [
    { id: 'take-1', shotId: 'shot-1', takeNumber: 1 } as Take,
    { id: 'take-2', shotId: 'shot-1', takeNumber: 2 } as Take,
    { id: 'take-3', shotId: 'shot-2', takeNumber: 1 } as Take,
  ],
  avScriptRows: [
    { id: 'av-scaffold', shotNumber: '1/1', video: '', audio: '', linkedShotId: 'shot-1' },
    {
      id: 'av-written',
      shotNumber: '1/1',
      video: 'Rain on the window.',
      audio: '',
      linkedShotId: 'shot-1',
    },
  ],
});

describe('deleteShotCommand', () => {
  it('removes the shot and every reference to it', () => {
    const { project: next, meta } = deleteShotCommand(buildProject(), { shotId: 'shot-1' });

    expect(next.setups[0].shots.map((entry) => entry.id)).toEqual(['shot-2']);
    // Sibling keeps its production number.
    expect(next.setups[0].shots[0].shotNumber).toBe('1/2');
    // Takes, script lining, storyboard and lining marks follow the shot.
    expect((next.takes ?? []).map((take) => take.id)).toEqual(['take-3']);
    expect(next.scriptLines?.[0].linkedShotId).toBeUndefined();
    expect(next.scriptLines?.[1].linkedShotId).toBe('shot-2');
    expect(next.setups[0].storyboardOrder).not.toContain('shot-1');
    expect(next.setups[0].scriptMarks).toEqual([]);
    // The strip covering only the shot is gone; the shared one is trimmed.
    expect((next.scheduleBlocks ?? []).map((block) => block.id)).toEqual([
      'block-shared',
      'block-scene',
    ]);
    const shared = next.scheduleBlocks?.find((block) => block.id === 'block-shared');
    expect(shared && 'shotIds' in shared ? shared.shotIds : []).toEqual(['shot-2']);
    expect(next.productionDays?.[0].scheduleBlockIds).toEqual(['block-shared']);
    // Unwritten AV scaffolding goes; written copy survives unlinked.
    expect((next.avScriptRows ?? []).map((row) => row.id)).toEqual(['av-written']);
    expect(next.avScriptRows?.[0].linkedShotId).toBeUndefined();
    // The camera stays: the sibling shot still uses it.
    expect(next.setups[0].elements.map((element) => element.id)).toEqual(['cam-1']);

    expect(meta.type).toBe('deleteShot');
    expect(meta.entityId).toBe('shot-1');
    expect(Number.isNaN(Date.parse(meta.timestamp))).toBe(false);
    expect(meta.description).toContain('1/1');
    expect(meta.description).toContain('Wide');
  });

  it('removes the camera when no sibling shot still uses it', () => {
    const { project: next } = deleteShotCommand(buildProject(), { shotId: 'shot-2' });
    // shot-1 keeps cam-1, so the camera stays here too; delete both instead.
    expect(next.setups[0].elements.map((element) => element.id)).toEqual(['cam-1']);

    const { project: cleared } = deleteShotCommand(next, { shotId: 'shot-1' });
    expect(cleared.setups[0].shots).toEqual([]);
    expect(cleared.setups[0].elements).toEqual([]);
  });

  it('throws for an unknown shot id', () => {
    expect(() => deleteShotCommand(buildProject(), { shotId: 'missing' })).toThrow(
      /unknown shot id/,
    );
  });

  it('throws for an empty shot id', () => {
    expect(() => deleteShotCommand(buildProject(), { shotId: '  ' })).toThrow(/shotId/);
  });

  it('leaves the project deeply equal when validation fails', () => {
    const project = buildProject();
    const snapshot = structuredClone(project);
    expect(() => deleteShotCommand(project, { shotId: 'missing' })).toThrow();
    expect(project).toEqual(snapshot);
  });

  it('never mutates the input project', () => {
    const project = buildProject();
    const snapshot = structuredClone(project);
    deleteShotCommand(project, { shotId: 'shot-1' });
    expect(project).toEqual(snapshot);
  });
});

describe('logTakeCommand', () => {
  it('logs the next take number for the shot', () => {
    const first = logTakeCommand(buildProject(), { shotId: 'shot-2' });
    const logged = (first.project.takes ?? []).at(-1);
    expect(logged?.shotId).toBe('shot-2');
    expect(logged?.takeNumber).toBe(2);
    expect(first.meta.type).toBe('logTake');
    expect(first.meta.entityId).toBe(logged?.id);
    expect(first.meta.description).toContain('Take 2');
    expect(first.meta.description).toContain('1/2');

    // A pickup starts its own slate series at 1.
    const pickup = logTakeCommand(first.project, { shotId: 'shot-2', slateTag: 'PU' });
    expect((pickup.project.takes ?? []).at(-1)?.takeNumber).toBe(1);
    expect(pickup.meta.description).toContain('1/2-PU');

    // Returning to the base slate continues its own series.
    const again = logTakeCommand(pickup.project, { shotId: 'shot-2' });
    expect((again.project.takes ?? []).at(-1)?.takeNumber).toBe(3);
  });

  it('inherits the sticky columns from the last logged take', () => {
    const base = buildProject();
    base.takes = [
      { id: 'take-1', shotId: 'shot-1', takeNumber: 1, rollCard: 'A001' } as Take,
    ];
    const { project: next } = logTakeCommand(base, { shotId: 'shot-2' });
    expect((next.takes ?? []).at(-1)?.rollCard).toBe('A001');
  });

  it('rejects an unknown shot id', () => {
    expect(() => logTakeCommand(buildProject(), { shotId: 'missing' })).toThrow(
      /unknown shot id/,
    );
  });

  it('rejects an unknown slate tag and an unknown day', () => {
    expect(() =>
      logTakeCommand(buildProject(), {
        shotId: 'shot-1',
        slateTag: 'XX' as Take['slateTag'],
      }),
    ).toThrow(/slate tag/);
    expect(() =>
      logTakeCommand(buildProject(), { shotId: 'shot-1', productionDayId: 'day-9' }),
    ).toThrow(/production day/);
  });

  it('rejects a duplicate take id and a bad timestamp', () => {
    expect(() =>
      logTakeCommand(buildProject(), { shotId: 'shot-1', takeId: 'take-1' }),
    ).toThrow(/already exists/);
    expect(() =>
      logTakeCommand(buildProject(), { shotId: 'shot-1', loggedAt: 'not-a-date' }),
    ).toThrow(/loggedAt/);
  });

  it('leaves the project deeply equal when validation fails', () => {
    const project = buildProject();
    const snapshot = structuredClone(project);
    expect(() => logTakeCommand(project, { shotId: 'missing' })).toThrow();
    expect(project).toEqual(snapshot);
  });
});

describe('moveScheduleBlockCommand', () => {
  it('moves a block from one day to another', () => {
    const { project: next, meta } = moveScheduleBlockCommand(buildProject(), {
      blockId: 'block-scene',
      toDayId: 'day-1',
    });

    expect(next.productionDays?.[0].scheduleBlockIds).toEqual([
      'block-solo',
      'block-shared',
      'block-scene',
    ]);
    expect(next.productionDays?.[1].scheduleBlockIds).toEqual([]);
    expect(meta.type).toBe('moveScheduleBlock');
    expect(meta.entityId).toBe('block-scene');
    expect(meta.description).toContain('Day 2');
    expect(meta.description).toContain('Day 1');
  });

  it('inserts at the requested position and clamps an out-of-range index', () => {
    const { project: next } = moveScheduleBlockCommand(buildProject(), {
      blockId: 'block-scene',
      toDayId: 'day-1',
      toIndex: 0,
    });
    expect(next.productionDays?.[0].scheduleBlockIds[0]).toBe('block-scene');

    const { project: clamped } = moveScheduleBlockCommand(buildProject(), {
      blockId: 'block-scene',
      toDayId: 'day-1',
      toIndex: 99,
    });
    expect(clamped.productionDays?.[0].scheduleBlockIds.at(-1)).toBe('block-scene');
  });

  it('reorders within a day', () => {
    const { project: next, meta } = moveScheduleBlockCommand(buildProject(), {
      blockId: 'block-shared',
      toDayId: 'day-1',
      toIndex: 0,
    });
    expect(next.productionDays?.[0].scheduleBlockIds).toEqual([
      'block-shared',
      'block-solo',
    ]);
    expect(meta.description).toContain('Day 1');
  });

  it('returns the same project reference when nothing changes', () => {
    const project = buildProject();
    const { project: next, meta } = moveScheduleBlockCommand(project, {
      blockId: 'block-solo',
      toDayId: 'day-1',
      toIndex: 0,
    });
    expect(next).toBe(project);
    expect(meta.description).toMatch(/no change/i);
  });

  it('rejects unknown block and day ids and a bad index', () => {
    const project = buildProject();
    expect(() =>
      moveScheduleBlockCommand(project, { blockId: 'missing', toDayId: 'day-1' }),
    ).toThrow(/unknown schedule block/);
    expect(() =>
      moveScheduleBlockCommand(project, { blockId: 'block-solo', toDayId: 'day-9' }),
    ).toThrow(/unknown production day/);
    expect(() =>
      moveScheduleBlockCommand(project, {
        blockId: 'block-solo',
        toDayId: 'day-1',
        toIndex: -1,
      }),
    ).toThrow(/toIndex/);
  });

  it('leaves the project deeply equal when validation fails', () => {
    const project = buildProject();
    const snapshot = structuredClone(project);
    expect(() =>
      moveScheduleBlockCommand(project, { blockId: 'missing', toDayId: 'day-1' }),
    ).toThrow();
    expect(project).toEqual(snapshot);
  });
});
