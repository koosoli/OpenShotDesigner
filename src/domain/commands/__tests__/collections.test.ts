/**
 * The planning-module and breakdown commands that replaced the last free-form
 * project writes: each runs against the committed project, names its undo
 * step, and keeps the invariants the panels used to keep by hand.
 */
import { describe, expect, it } from 'vitest';
import type { Project, SceneSetup } from '../../../types';
import {
  addSetupsCommand,
  patchPersonCommand,
  patchStandingCallSheetCommand,
  removeBreakdownItemCommand,
  updateBreakdownItemsCommand,
  updateReadinessDismissalsCommand,
  updateReviewCommentsCommand,
  updateTaskBoardsCommand,
  updateTrussElementsCommand,
} from '..';

const project = (overrides: Partial<Project> = {}): Project =>
  ({ id: 'p', title: 'Test', setups: [], activeSetupId: '', ...overrides }) as unknown as Project;

describe('collection commands', () => {
  it('deletes a task board together with its tasks in one step', () => {
    const start = project({
      taskBoards: [{ id: 'b1', title: 'Prep' }, { id: 'b2', title: 'Shoot' }] as never,
      tasks: [{ id: 't1', boardId: 'b1' }, { id: 't2', boardId: 'b2' }] as never,
    });
    const result = updateTaskBoardsCommand(start, {
      boards: (boards) => boards.filter((board) => board.id !== 'b1'),
      tasks: (tasks) => tasks.filter((task) => task.boardId !== 'b1'),
      description: 'Delete task board Prep',
    });
    expect(result.project.taskBoards?.map((board) => board.id)).toEqual(['b2']);
    expect(result.project.tasks?.map((task) => task.id)).toEqual(['t2']);
    expect(result.meta.description).toBe('Delete task board Prep');
    expect(() => updateTaskBoardsCommand(start, {})).toThrow(/nothing to update/);
  });

  it('stores emptied readiness dismissals and review comments as absent', () => {
    const start = project({ readinessDismissals: [{ itemId: 'x' }] as never, reviewComments: [{ id: 'c' }] as never });
    expect(updateReadinessDismissalsCommand(start, { update: () => [] }).project.readinessDismissals).toBeUndefined();
    expect(updateReviewCommentsCommand(start, { update: () => [] }).project.reviewComments).toBeUndefined();
  });

  it('merges into the standing call sheet and one contact', () => {
    const start = project({ standingCallSheet: { hospital: 'St Mary' } as never, people: [{ id: 'p1', displayName: 'Ana', kind: 'crew' }] as never });
    expect(patchStandingCallSheetCommand(start, { updates: { parking: 'Lot B' } as never }).project.standingCallSheet).toEqual({ hospital: 'St Mary', parking: 'Lot B' });
    const patched = patchPersonCommand(start, { personId: 'p1', updates: { dayRate: 450 } as never });
    expect(patched.project.people?.[0]).toMatchObject({ displayName: 'Ana', dayRate: 450 });
    expect(patched.meta.description).toBe('Edit Ana');
    expect(() => patchPersonCommand(start, { personId: 'nope', updates: {} })).toThrow(/unknown person/);
  });

  it('moves a truss run', () => {
    const start = project({ trussElements: [{ id: 'tr', x: 0, y: 0 }] as never });
    expect(updateTrussElementsCommand(start, { update: (runs) => runs.map((run) => ({ ...run, x: 5 })) }).project.trussElements?.[0]).toMatchObject({ x: 5 });
  });
});

describe('breakdown commands', () => {
  it('tags through an updater and removes an element from the scenes that listed it', () => {
    const start = project({
      breakdownItems: [{ id: 'i1', category: 'prop', name: 'Ledger' }] as never,
      scriptScenes: [{ id: 's1', sceneNumber: '1', heading: 'INT. ROOM', breakdownItemIds: ['i1'], characterIds: [] }] as never,
    });
    const tagged = updateBreakdownItemsCommand(start, { update: (items) => [...items, { id: 'i2', category: 'prop', name: 'Lamp' } as never] });
    expect(tagged.project.breakdownItems).toHaveLength(2);
    const removed = removeBreakdownItemCommand(start, { itemId: 'i1' });
    expect(removed.project.breakdownItems).toEqual([]);
    expect(removed.project.scriptScenes?.[0].breakdownItemIds).toEqual([]);
    expect(removed.meta.description).toBe('Remove Ledger from the breakdown');
  });

  it('adds setups from the script and opens the first', () => {
    const setups = [{ id: 'a', name: 'Sc 1' }, { id: 'b', name: 'Sc 2' }] as unknown as SceneSetup[];
    const result = addSetupsCommand(project(), { setups });
    expect(result.project.activeSetupId).toBe('a');
    expect(result.meta.description).toBe('Add 2 setups from the script');
    expect(() => addSetupsCommand(project(), { setups: [] })).toThrow(/nothing to add/);
  });
});
