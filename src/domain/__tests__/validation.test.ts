import { describe, it, expect } from 'vitest';
import { validateProject, validateSetup } from '../index';
import type { SceneSetup } from '../../types';
import {
  makeActor,
  makeAVRow,
  makeCamera,
  makeCleanSetup,
  makeProject,
  makeScriptLine,
  makeScriptMark,
  makeSetup,
  makeShot,
} from '../../utils/__tests__/fixtures';

const errorCodes = (issues: ReturnType<typeof validateProject>) => [
  ...new Set(issues.filter((i) => i.severity === 'error').map((i) => i.code)),
];

const projectWithSetup = (setup: SceneSetup) => makeProject([setup]);

describe('validateProject', () => {
  it('reports zero issues for a clean, fully consistent project', () => {
    const project = projectWithSetup(makeCleanSetup());
    const issues = validateProject(project);
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('reports DUPLICATE_SETUP_ID when two setups share an id', () => {
    const project = makeProject([
      makeCleanSetup({ id: 'dup-setup', name: 'One' }),
      makeCleanSetup({ id: 'dup-setup', name: 'Two' }),
    ]);
    expect(errorCodes(validateProject(project))).toEqual(['DUPLICATE_SETUP_ID']);
  });

  it('reports MISSING_ACTIVE_SETUP when activeSetupId matches no setup', () => {
    const project = projectWithSetup(makeCleanSetup({ id: 'real-setup' }));
    project.activeSetupId = 'ghost-setup';
    expect(errorCodes(validateProject(project))).toEqual(['MISSING_ACTIVE_SETUP']);
  });

  it('reports DUPLICATE_ELEMENT_ID when two elements share an id', () => {
    const setup = makeCleanSetup();
    setup.elements.push(makeActor({ id: 'clean-act-a', name: 'Clone of Alice' }));
    expect(errorCodes(validateProject(projectWithSetup(setup)))).toEqual(['DUPLICATE_ELEMENT_ID']);
  });

  it('reports DUPLICATE_SHOT_ID when two shots share an id', () => {
    const setup = makeCleanSetup();
    setup.shots.push(makeShot({ id: 'clean-shot-1', name: 'Clone shot', cameraId: 'clean-cam-a' }));
    expect(errorCodes(validateProject(projectWithSetup(setup)))).toEqual(['DUPLICATE_SHOT_ID']);
  });

  it('reports DANGLING_CAMERA_REF when a shot points at a missing camera', () => {
    const setup = makeCleanSetup();
    setup.shots[0].cameraId = 'ghost-cam';
    expect(errorCodes(validateProject(projectWithSetup(setup)))).toEqual(['DANGLING_CAMERA_REF']);
  });

  it('reports DANGLING_ACTOR_REF when a shot subject does not exist', () => {
    const setup = makeCleanSetup();
    setup.shots[0].subjectActorIds = ['ghost-actor'];
    expect(errorCodes(validateProject(projectWithSetup(setup)))).toEqual(['DANGLING_ACTOR_REF']);
  });

  it('reports DANGLING_SHOT_REF when a camera points at a missing shot', () => {
    const setup = makeCleanSetup();
    const camera = setup.elements.find((el) => el.type === 'camera');
    if (camera && camera.type === 'camera') camera.associatedShotId = 'ghost-shot';
    expect(errorCodes(validateProject(projectWithSetup(setup)))).toEqual(['DANGLING_SHOT_REF']);
  });

  it('reports DANGLING_LOOK_AT_TARGET when a lookAtTargetId is missing', () => {
    const setup = makeCleanSetup();
    const actor = setup.elements.find((el) => el.type === 'actor');
    if (actor && actor.type === 'actor') actor.lookAtTargetId = 'ghost-target';
    expect(errorCodes(validateProject(projectWithSetup(setup)))).toEqual(['DANGLING_LOOK_AT_TARGET']);
  });

  it('reports DANGLING_SCRIPT_LINE for shot and script-mark references to missing lines', () => {
    const setup = makeCleanSetup();
    setup.shots[0].scriptLineId = 'ghost-line';
    setup.scriptMarks = [
      makeScriptMark({
        id: 'mark-1',
        shotId: 'clean-shot-1',
        startLineId: 'ghost-line',
        endLineId: 'ghost-line-2',
        wavyStartLineId: 'ghost-line-3',
        wavyEndLineId: 'ghost-line-4',
      }),
    ];
    expect(errorCodes(validateProject(projectWithSetup(setup)))).toEqual(['DANGLING_SCRIPT_LINE']);
  });

  it('reports DANGLING_LINKED_SHOT for av rows and script lines pointing at missing shots', () => {
    const setup = makeCleanSetup();
    setup.avScriptRows = [makeAVRow({ id: 'av-1', linkedShotId: 'ghost-shot' })];
    setup.scriptLines = [makeScriptLine({ id: 'line-1', linkedShotId: 'ghost-shot' })];
    expect(errorCodes(validateProject(projectWithSetup(setup)))).toEqual(['DANGLING_LINKED_SHOT']);
  });

  it('reports DUPLICATE_SCRIPT_LINE_ID when two script lines share an id', () => {
    const setup = makeCleanSetup();
    setup.scriptLines = [
      makeScriptLine({ id: 'dup-line' }),
      makeScriptLine({ id: 'dup-line', lineNumber: 2 }),
    ];
    expect(errorCodes(validateProject(projectWithSetup(setup)))).toEqual(['DUPLICATE_SCRIPT_LINE_ID']);
  });

  it('reports DUPLICATE_AV_ROW_ID when two AV rows share an id', () => {
    const setup = makeCleanSetup();
    setup.avScriptRows = [
      makeAVRow({ id: 'dup-av' }),
      makeAVRow({ id: 'dup-av', shotNumber: '2' }),
    ];
    expect(errorCodes(validateProject(projectWithSetup(setup)))).toEqual(['DUPLICATE_AV_ROW_ID']);
  });

  it('includes human-readable messages naming the offending entities', () => {
    const setup = makeCleanSetup();
    setup.shots[0].cameraId = 'ghost-cam';
    const issues = validateProject(projectWithSetup(setup));
    expect(issues.length).toBeGreaterThan(0);
    for (const issue of issues) {
      expect(typeof issue.message).toBe('string');
      expect(issue.message.length).toBeGreaterThan(0);
      expect(issue.code).toBe('DANGLING_CAMERA_REF');
    }
  });

  it('validates production calendar ranges and dependencies', () => {
    const project = projectWithSetup(makeCleanSetup());
    project.productionCalendarEvents = [
      { id: 'event-1', title: 'Shoot', startDate: '2026-09-05', endDate: '2026-09-01', category: 'shoot', dependencyIds: ['missing'] },
    ];
    expect(errorCodes(validateProject(project))).toEqual(['INVALID_CALENDAR_EVENT_RANGE', 'DANGLING_CALENDAR_DEPENDENCY']);
  });
});

describe('validateSetup', () => {
  it('reports zero issues for a clean setup on its own', () => {
    expect(validateSetup(makeCleanSetup()).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('reports duplicate element ids within a single setup', () => {
    const setup = makeCleanSetup();
    setup.elements.push(makeActor({ id: 'clean-act-a', name: 'Twin' }));
    expect(errorCodes(validateSetup(setup))).toEqual(['DUPLICATE_ELEMENT_ID']);
  });

  it('is pure: calling it twice returns equal results and does not mutate input', () => {
    const setup = makeCleanSetup();
    setup.shots[0].cameraId = 'ghost-cam';
    const snapshot = structuredClone(setup);
    const a = validateSetup(setup);
    const b = validateSetup(setup);
    expect(a).toEqual(b);
    expect(setup).toEqual(snapshot);
  });
});
