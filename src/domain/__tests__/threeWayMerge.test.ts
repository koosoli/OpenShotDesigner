import { describe, expect, it } from 'vitest';
import { describeMergeValue, resolveMergeConflicts, threeWayMerge } from '../sync/threeWayMerge';

const base = {
  title: 'Film',
  director: 'Ana',
  activeSetupId: 's1',
  setups: [
    {
      id: 's1',
      name: 'Scene 1',
      canvasScale: 1,
      shots: [
        { id: 'a', shotNumber: '1/1', lensMm: 35 },
        { id: 'b', shotNumber: '1/2', lensMm: 50 },
      ],
    },
  ],
  productionDays: [{ id: 'd1', name: 'Day 1', scheduleBlockIds: ['x', 'y'] }],
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('threeWayMerge', () => {
  it('keeps changes made on either side and counts theirs', () => {
    const mine = clone(base);
    mine.setups[0].shots[0].lensMm = 24;
    const theirs = clone(base);
    theirs.director = 'Ben';
    theirs.setups[0].shots.push({ id: 'c', shotNumber: '1/3', lensMm: 85 });
    const { merged, conflicts, theirChanges } = threeWayMerge(base, mine, theirs);
    expect(conflicts).toEqual([]);
    expect(merged.director).toBe('Ben');
    expect(merged.setups[0].shots.map((shot) => [shot.id, shot.lensMm])).toEqual([['a', 24], ['b', 50], ['c', 85]]);
    expect(theirChanges).toBe(2);
  });

  it('reports a conflict only where both changed the same value differently, defaulting to mine', () => {
    const mine = clone(base);
    mine.setups[0].shots[1].lensMm = 40;
    const theirs = clone(base);
    theirs.setups[0].shots[1].lensMm = 75;
    const { merged, conflicts } = threeWayMerge(base, mine, theirs);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].label).toBe('setups › Scene 1 › shots › Shot 1/2 › lensMm');
    expect(merged.setups[0].shots[1].lensMm).toBe(40);
    const resolved = resolveMergeConflicts(merged, conflicts, new Set([0]));
    expect(resolved.setups[0].shots[1].lensMm).toBe(75);
  });

  it('ignores view state', () => {
    const mine = clone(base);
    mine.activeSetupId = 'other';
    mine.setups[0].canvasScale = 2;
    const theirs = clone(base);
    theirs.setups[0].canvasScale = 0.5;
    const { merged, conflicts } = threeWayMerge(base, mine, theirs);
    expect(conflicts).toEqual([]);
    expect(merged.activeSetupId).toBe('other');
    expect(merged.setups[0].canvasScale).toBe(2);
  });

  it('applies deletions and flags delete-versus-edit', () => {
    const mine = clone(base);
    mine.setups[0].shots = mine.setups[0].shots.filter((shot) => shot.id !== 'a');
    const theirs = clone(base);
    expect(threeWayMerge(base, mine, theirs).merged.setups[0].shots.map((shot) => shot.id)).toEqual(['b']);

    theirs.setups[0].shots[0].lensMm = 18;
    const { merged, conflicts } = threeWayMerge(base, mine, theirs);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].label).toMatch(/deleted by me/);
    expect(merged.setups[0].shots.map((shot) => shot.id)).toEqual(['b']);
    const restored = resolveMergeConflicts(merged, conflicts, new Set([0]));
    expect(restored.setups[0].shots.map((shot) => shot.id)).toEqual(['b', 'a']);
  });

  it('merges unique string lists like a day’s strips', () => {
    const mine = clone(base);
    mine.productionDays[0].scheduleBlockIds = ['x', 'y', 'm'];
    const theirs = clone(base);
    theirs.productionDays[0].scheduleBlockIds = ['y', 'x', 't'];
    const { merged, conflicts } = threeWayMerge(base, mine, theirs);
    expect(conflicts).toEqual([]);
    expect(merged.productionDays[0].scheduleBlockIds).toEqual(['y', 'x', 't', 'm']);
  });

  it('follows my reordering when only I reordered', () => {
    const mine = clone(base);
    mine.setups[0].shots.reverse();
    const theirs = clone(base);
    theirs.title = 'Film 2';
    expect(threeWayMerge(base, mine, theirs).merged.setups[0].shots.map((shot) => shot.id)).toEqual(['b', 'a']);
  });

  it('describes values for the chooser', () => {
    expect(describeMergeValue(undefined)).toBe('deleted');
    expect(describeMergeValue(35)).toBe('35');
    expect(describeMergeValue({ id: 'a', shotNumber: '1/1' })).toBe('Shot 1/1');
  });
});

describe('threeWayMerge on a real project', () => {
  it('merges two edited copies of the example production into a valid project', async () => {
    const { createProject } = await import('../../utils/projectLibrary');
    const { buildExampleProductionFill } = await import('../../utils/sampleContent');
    const { validateProject } = await import('../validation');
    const start = createProject({ title: 'Merge', withSampleScenes: true });
    const base = { ...start, ...buildExampleProductionFill(start).patch };
    const mine = clone(base);
    mine.setups[0].shots[0].lensMm = 24;
    mine.people = [...(mine.people ?? []), { id: 'p-new', displayName: 'New Gaffer', kind: 'crew' } as never];
    const theirs = clone(base);
    theirs.productionDays = [...(theirs.productionDays ?? []), { id: 'd-new', name: 'Day 3', scheduleBlockIds: [] }];
    theirs.setups[0].shots[1].name = 'Renamed by colleague';
    const { merged, conflicts } = threeWayMerge(base, mine, theirs);
    expect(conflicts).toEqual([]);
    expect(merged.setups[0].shots[0].lensMm).toBe(24);
    expect(merged.setups[0].shots[1].name).toBe('Renamed by colleague');
    expect(merged.people?.some((person) => person.id === 'p-new')).toBe(true);
    expect(merged.productionDays?.some((day) => day.id === 'd-new')).toBe(true);
    expect(validateProject(merged).filter((issue) => issue.severity === 'error')).toEqual([]);
  });
});
