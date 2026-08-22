import { describe, it, expect } from 'vitest';
import {
  addChecklistItem,
  addTask,
  boardLabels,
  checklistProgress,
  createTaskBoard,
  filterTasks,
  isTaskDueSoon,
  isTaskOverdue,
  moveTask,
  pruneOrphanTasks,
  removeTask,
  sortTasksByUrgency,
  sortedColumns,
  summarizeBoard,
  tasksInColumn,
  toggleChecklistItem,
  updateTask,
} from '../tasks';
import type { Task } from '../tasks';

const NOW = '2026-08-22T10:00:00.000Z';
const TODAY = '2026-08-22';

const seed = () => {
  const board = createTaskBoard('board-1', 'Prep');
  const [todo, doing, , done] = sortedColumns(board);
  let tasks: Task[] = [];
  const ids: string[] = [];
  for (const title of ['Lock locations', 'Book crane', 'Wardrobe fitting']) {
    const result = addTask(tasks, board, { title, columnId: todo.id }, NOW);
    tasks = result.tasks;
    ids.push(result.id);
  }
  return { board, todo, doing, done, tasks, ids };
};

describe('createTaskBoard', () => {
  it('creates four ordered default columns with a done column last', () => {
    const board = createTaskBoard('b', 'Board');
    const columns = sortedColumns(board);
    expect(columns.map((c) => c.title)).toEqual(['To do', 'In progress', 'Review', 'Done']);
    expect(columns[3].isDone).toBe(true);
    expect(new Set(columns.map((c) => c.id)).size).toBe(4);
  });
});

describe('addTask / updateTask / removeTask', () => {
  it('appends to the first column by default with sequential order', () => {
    const { tasks, todo } = seed();
    expect(tasksInColumn(tasks, todo.id).map((t) => t.order)).toEqual([0, 1, 2]);
    expect(tasks[0]).toMatchObject({ title: 'Lock locations', boardId: 'board-1', createdAt: NOW, assigneeIds: [], labels: [], checklist: [] });
  });

  it('stamps completedAt when created directly in a done column', () => {
    const { board, done, tasks } = seed();
    const { tasks: next, id } = addTask(tasks, board, { title: 'Already done', columnId: done.id }, NOW);
    expect(next.find((t) => t.id === id)?.completedAt).toBe(NOW);
  });

  it('updates fields immutably and renumbers after removal', () => {
    const { tasks, ids, todo } = seed();
    const updated = updateTask(tasks, ids[1], { title: 'Book crane (30ft)', priority: 'high' });
    expect(updated[1]).toMatchObject({ title: 'Book crane (30ft)', priority: 'high' });
    expect(tasks[1].title).toBe('Book crane');
    const removed = removeTask(updated, ids[0]);
    expect(tasksInColumn(removed, todo.id).map((t) => [t.title, t.order])).toEqual([['Book crane (30ft)', 0], ['Wardrobe fitting', 1]]);
    expect(removeTask(tasks, 'missing')).toEqual(tasks);
  });
});

describe('moveTask', () => {
  it('moves across columns, clamps the index, renumbers both columns and stamps completion', () => {
    const { board, tasks, ids, todo, doing, done } = seed();
    let next = moveTask(tasks, board, ids[2], doing.id, 99, NOW);
    expect(tasksInColumn(next, doing.id).map((t) => t.id)).toEqual([ids[2]]);
    expect(tasksInColumn(next, todo.id).map((t) => t.order)).toEqual([0, 1]);
    next = moveTask(next, board, ids[0], doing.id, 0, NOW);
    expect(tasksInColumn(next, doing.id).map((t) => t.id)).toEqual([ids[0], ids[2]]);
    next = moveTask(next, board, ids[0], done.id, 0, NOW);
    expect(next.find((t) => t.id === ids[0])?.completedAt).toBe(NOW);
    next = moveTask(next, board, ids[0], todo.id, 1, NOW);
    expect(next.find((t) => t.id === ids[0])?.completedAt).toBeUndefined();
    expect(tasksInColumn(next, todo.id).map((t) => t.id)).toEqual([ids[1], ids[0]]);
  });

  it('reorders within the same column', () => {
    const { board, tasks, ids, todo } = seed();
    const next = moveTask(tasks, board, ids[2], todo.id, 0, NOW);
    expect(tasksInColumn(next, todo.id).map((t) => t.id)).toEqual([ids[2], ids[0], ids[1]]);
    expect(tasksInColumn(next, todo.id).map((t) => t.order)).toEqual([0, 1, 2]);
  });

  it('ignores unknown tasks or columns', () => {
    const { board, tasks, ids } = seed();
    expect(moveTask(tasks, board, 'nope', board.columns[0].id, 0, NOW)).toEqual(tasks);
    expect(moveTask(tasks, board, ids[0], 'nope', 0, NOW)).toEqual(tasks);
  });
});

describe('checklist', () => {
  it('adds, toggles and reports progress', () => {
    const { tasks, ids } = seed();
    let next = addChecklistItem(tasks, ids[0], 'Sign permit');
    next = addChecklistItem(next, ids[0], 'Insurance');
    const itemId = next[0].checklist[0].id;
    next = toggleChecklistItem(next, ids[0], itemId);
    expect(checklistProgress(next[0])).toEqual({ done: 1, total: 2 });
    next = toggleChecklistItem(next, ids[0], itemId);
    expect(checklistProgress(next[0])).toEqual({ done: 0, total: 2 });
  });
});

describe('dates, filters and summaries', () => {
  it('detects overdue and due-soon relative to an explicit today', () => {
    expect(isTaskOverdue({ dueDate: '2026-08-21' }, TODAY)).toBe(true);
    expect(isTaskOverdue({ dueDate: '2026-08-21', completedAt: NOW }, TODAY)).toBe(false);
    expect(isTaskOverdue({ dueDate: undefined }, TODAY)).toBe(false);
    expect(isTaskDueSoon({ dueDate: '2026-08-22' }, TODAY)).toBe(true);
    expect(isTaskDueSoon({ dueDate: '2026-08-25' }, TODAY)).toBe(true);
    expect(isTaskDueSoon({ dueDate: '2026-08-26' }, TODAY)).toBe(false);
  });

  it('filters by assignee, label, priority and text; lists labels', () => {
    const { tasks, ids } = seed();
    let next = updateTask(tasks, ids[0], { assigneeIds: ['p1'], labels: ['locations'], priority: 'urgent' });
    next = updateTask(next, ids[1], { labels: ['grip', 'rental'] });
    expect(filterTasks(next, { assigneeId: 'p1' }).map((t) => t.id)).toEqual([ids[0]]);
    expect(filterTasks(next, { assigneeId: 'unassigned' })).toHaveLength(2);
    expect(filterTasks(next, { label: 'grip' }).map((t) => t.id)).toEqual([ids[1]]);
    expect(filterTasks(next, { priority: 'urgent' }).map((t) => t.id)).toEqual([ids[0]]);
    expect(filterTasks(next, { query: 'crane' }).map((t) => t.id)).toEqual([ids[1]]);
    expect(boardLabels(next)).toEqual(['grip', 'locations', 'rental']);
  });

  it('summarises a board and sorts by urgency', () => {
    const { board, tasks, ids, done } = seed();
    let next = updateTask(tasks, ids[0], { dueDate: '2026-08-20' });
    next = updateTask(next, ids[1], { dueDate: '2026-08-23', priority: 'high' });
    next = moveTask(next, board, ids[2], done.id, 0, NOW);
    expect(summarizeBoard(next, board, TODAY)).toEqual({ total: 3, done: 1, overdue: 1, dueSoon: 1 });
    expect(sortTasksByUrgency(next).map((t) => t.id)).toEqual([ids[1], ids[0], ids[2]]);
  });

  it('prunes tasks whose board/column vanished', () => {
    const { board, tasks } = seed();
    const stray: Task = { ...tasks[0], id: 'stray', columnId: 'gone' };
    expect(pruneOrphanTasks([...tasks, stray], [board]).map((t) => t.id)).not.toContain('stray');
  });
});
