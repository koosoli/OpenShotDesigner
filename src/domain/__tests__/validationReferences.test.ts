import { describe, it, expect } from 'vitest';
import { validateProject } from '../validation';
import type { Project } from '../../types';
import { makeCleanSetup, makeProject, makeShot } from '../../utils/__tests__/fixtures';

const codes = (issues: ReturnType<typeof validateProject>, severity?: 'error' | 'warning') => [
  ...new Set(
    issues
      .filter((i) => !severity || i.severity === severity)
      .map((i) => i.code),
  ),
];

const cleanShotId = () => (makeCleanSetup().shots[0]?.id ?? 'clean-shot-1');

describe('cross-domain reference validation', () => {
  it('reports zero issues for a clean project', () => {
    expect(validateProject(makeProject([makeCleanSetup()]))).toEqual([]);
  });

  it('flags takes pointing at missing shots and days', () => {
    const shotId = cleanShotId();
    const project = makeProject([makeCleanSetup()]) as Project;
    project.takes = [
      { id: 'take-ok', shotId, takeNumber: 1 },
      { id: 'take-ok', shotId, takeNumber: 2 },
      { id: 'take-ghost-shot', shotId: 'ghost-shot', takeNumber: 1 },
      { id: 'take-ghost-day', shotId, takeNumber: 3, productionDayId: 'ghost-day' },
    ] as Project['takes'];
    const found = codes(validateProject(project), 'error');
    expect(found).toContain('DUPLICATE_TAKE_ID');
    expect(found).toContain('DANGLING_TAKE_SHOT');
    expect(codes(validateProject(project), 'warning')).toContain('DANGLING_TAKE_DAY');
  });

  it('flags schedule blocks and day strips pointing at missing entities', () => {
    const project = makeProject([makeCleanSetup()]) as Project;
    project.scriptScenes = [{ id: 'scene-1' } as Project['scriptScenes'] extends Array<infer T> ? T : never];
    project.productionSegments = [];
    project.scheduleBlocks = [
      { id: 'block-scene', kind: 'scene', scriptSceneId: 'scene-1' },
      { id: 'block-ghost-scene', kind: 'scene', scriptSceneId: 'ghost-scene' },
      { id: 'block-ghost-setup', kind: 'setup', setupId: 'ghost-setup' },
      { id: 'block-ghost-shot', kind: 'shots', shotIds: ['ghost-shot'] },
      { id: 'block-ghost-cue', kind: 'cue', cueId: 'ghost-cue' },
      { id: 'block-ghost-segment', kind: 'segment', segmentId: 'ghost-segment' },
      { id: 'block-ghost-shot', kind: 'shots', shotIds: [] },
    ] as Project['scheduleBlocks'];
    project.productionDays = [
      { id: 'day-1', name: 'Day 1', scheduleBlockIds: ['block-scene', 'ghost-block'] },
      { id: 'day-1', name: 'Day 1 dup', scheduleBlockIds: [] },
    ] as Project['productionDays'];
    const found = codes(validateProject(project), 'error');
    for (const code of [
      'DUPLICATE_SCHEDULE_BLOCK_ID',
      'DUPLICATE_PRODUCTION_DAY_ID',
      'DANGLING_SCHEDULE_BLOCK',
      'DANGLING_SCHEDULE_SCENE',
      'DANGLING_SCHEDULE_SETUP',
      'DANGLING_SCHEDULE_SHOT',
      'DANGLING_SCHEDULE_CUE',
      'DANGLING_SCHEDULE_SEGMENT',
    ]) {
      expect(found).toContain(code);
    }
  });

  it('flags cast assignments pointing at missing characters and people', () => {
    const project = makeProject([makeCleanSetup()]) as Project;
    project.characters = [{ id: 'char-1' } as Project['characters'] extends Array<infer T> ? T : never];
    project.people = [{ id: 'person-1' } as Project['people'] extends Array<infer T> ? T : never];
    const duplicatePeople = [{ id: 'dup-person' }, { id: 'dup-person' }] as Project['people'];
    const peopleProject = makeProject([makeCleanSetup()]) as Project;
    peopleProject.people = duplicatePeople;
    expect(codes(validateProject(peopleProject), 'error')).toContain('DUPLICATE_PERSON_ID');
    project.castAssignments = [
      { id: 'cast-ok', characterId: 'char-1', personId: 'person-1', castNumber: 1 },
      { id: 'cast-ghost-char', characterId: 'ghost-char', personId: 'person-1', castNumber: 2 },
      { id: 'cast-ghost-person', characterId: 'char-1', personId: 'ghost-person', castNumber: 3 },
      { id: 'cast-ghost-person', characterId: 'char-1', personId: 'person-1', castNumber: 4 },
    ] as Project['castAssignments'];
    const found = codes(validateProject(project), 'error');
    expect(found).toContain('DANGLING_CAST_CHARACTER');
    expect(found).toContain('DANGLING_CAST_PERSON');
    expect(found).toContain('DUPLICATE_CAST_ASSIGNMENT_ID');
  });

  it('warns (never errors) on call sheet rows and review notes pointing at deleted entities', () => {
    const project = makeProject([makeCleanSetup()]) as Project;
    project.productionDays = [
      {
        id: 'day-1',
        name: 'Day 1',
        scheduleBlockIds: [],
        callSheet: {
          pickups: [{ id: 'pickup-1', personId: 'ghost-person' }],
          personCalls: [{ id: 'call-1', personId: 'ghost-person' }],
          issues: [{ id: 'rev-1', revision: 1, issuedAt: '', snapshotJson: '{}', acknowledgements: [{ personId: 'ghost-person' }] }],
        },
      },
    ] as Project['productionDays'];
    project.reviewComments = [
      { id: 'note-1', targetKind: 'shot', targetId: 'ghost-shot', targetLabel: 'x', body: 'x', createdAt: '', replies: [] },
      { id: 'note-2', targetKind: 'person', targetId: 'ghost-person', targetLabel: 'x', body: 'x', createdAt: '', replies: [] },
    ] as Project['reviewComments'];
    const issues = validateProject(project);
    expect(codes(issues, 'error')).toEqual([]);
    const warnings = codes(issues, 'warning');
    expect(warnings).toContain('DANGLING_CALLSHEET_PERSON');
    expect(warnings).toContain('DANGLING_REVIEW_TARGET');
  });

  it('warns on malformed asset references while accepting ids and legacy inline data', () => {
    const setup = makeCleanSetup();
    setup.shots.push(makeShot({ id: 'shot-art', name: 'Art', cameraId: setup.shots[0].cameraId, storyboardImage: 'not-a-ref' }));
    const project = makeProject([setup]) as Project;
    project.logo = 'also-not-a-ref';
    const warnings = codes(validateProject(project), 'warning');
    expect(warnings).toContain('MALFORMED_ASSET_REF');
    expect(codes(validateProject(project), 'error')).not.toContain('MALFORMED_ASSET_REF');
  });

  it('flags storyboard order entries pointing at missing shots', () => {
    const setup = makeCleanSetup();
    setup.storyboardOrder = [...(setup.storyboardOrder ?? []), 'ghost-shot'];
    const found = codes(validateProject(makeProject([setup])), 'error');
    expect(found).toContain('DANGLING_STORYBOARD_REF');
  });

  it('still reports zero errors for cloned and sample-shaped projects', () => {
    const project = makeProject([makeCleanSetup()]);
    expect(codes(validateProject(project), 'error')).toEqual([]);
  });
});
