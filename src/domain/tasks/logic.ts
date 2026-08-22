/**
 * Pure task-board logic. Immutable; every mutation returns new arrays.
 * Time-dependent operations take `now` / `today` explicitly so they stay
 * deterministic and testable.
 */

import { createId } from '../ids';
import { isoDayNumber } from '../scheduling/calendarDate';
import type { Task, TaskBoard, TaskChecklistItem, TaskColumn, TaskPriority } from './types';

export const TASK_PRIORITIES: TaskPriority[] = ['low', 'normal', 'high', 'urgent'];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

const PRIORITY_RANK: Record<TaskPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

export const DEFAULT_TASK_COLUMNS: Array<Pick<TaskColumn, 'title' | 'isDone'>> = [
  { title: 'To do' },
  { title: 'In progress' },
  { title: 'Review' },
  { title: 'Done', isDone: true },
];

export const createTaskBoard = (id: string, title: string): TaskBoard => ({
  id,
  title,
  columns: DEFAULT_TASK_COLUMNS.map((column, order) => ({
    id: createId('column'),
    title: column.title,
    order,
    ...(column.isDone ? { isDone: true } : {}),
  })),
});

export const sortedColumns = (board: TaskBoard): TaskColumn[] => [...board.columns].sort((a, b) => a.order - b.order);

export const tasksInColumn = (tasks: readonly Task[], columnId: string): Task[] =>
  tasks.filter((task) => task.columnId === columnId).sort((a, b) => a.order - b.order);

export interface NewTaskInput {
  title: string;
  columnId?: string;
  description?: string;
  priority?: TaskPriority;
  dueDate?: string;
  assigneeIds?: string[];
  labels?: string[];
  link?: Task['link'];
}

/** Append a task to a column (default: the board's first column). Returns the new list and id. */
export const addTask = (
  tasks: readonly Task[],
  board: TaskBoard,
  input: NewTaskInput,
  now: string,
): { tasks: Task[]; id: string } => {
  const columns = sortedColumns(board);
  const column = columns.find((candidate) => candidate.id === input.columnId) ?? columns[0];
  if (!column) throw new Error('Board has no columns');
  const siblings = tasksInColumn(tasks, column.id);
  const id = createId('task');
  const task: Task = {
    id,
    boardId: board.id,
    columnId: column.id,
    title: input.title.trim() || 'Untitled task',
    assigneeIds: [...(input.assigneeIds ?? [])],
    labels: [...(input.labels ?? [])],
    checklist: [],
    order: siblings.length,
    createdAt: now,
  };
  if (input.description) task.description = input.description;
  if (input.priority) task.priority = input.priority;
  if (input.dueDate) task.dueDate = input.dueDate;
  if (input.link) task.link = { ...input.link };
  if (column.isDone) task.completedAt = now;
  return { tasks: [...tasks, task], id };
};

export const updateTask = (tasks: readonly Task[], taskId: string, updates: Partial<Omit<Task, 'id' | 'boardId'>>): Task[] =>
  tasks.map((task) => (task.id === taskId ? { ...task, ...updates } : task));

export const removeTask = (tasks: readonly Task[], taskId: string): Task[] => {
  const target = tasks.find((task) => task.id === taskId);
  if (!target) return [...tasks];
  return renumber(
    tasks.filter((task) => task.id !== taskId),
    [target.columnId],
  );
};

const renumber = (tasks: readonly Task[], columnIds: readonly string[]): Task[] => {
  const orders = new Map<string, number>();
  for (const columnId of columnIds) {
    tasksInColumn(tasks, columnId).forEach((task, index) => orders.set(task.id, index));
  }
  return tasks.map((task) => {
    const order = orders.get(task.id);
    return order === undefined || order === task.order ? task : { ...task, order };
  });
};

/**
 * Move a task to `columnId` at `index` (clamped). Orders in both affected
 * columns are renumbered 0..n-1. Entering a done column stamps
 * `completedAt`; leaving one clears it.
 */
export const moveTask = (
  tasks: readonly Task[],
  board: TaskBoard,
  taskId: string,
  columnId: string,
  index: number,
  now: string,
): Task[] => {
  const task = tasks.find((candidate) => candidate.id === taskId);
  const column = board.columns.find((candidate) => candidate.id === columnId);
  if (!task || !column) return [...tasks];

  const others = tasks.filter((candidate) => candidate.id !== taskId);
  const target = tasksInColumn(others, columnId);
  const clamped = Math.max(0, Math.min(index, target.length));
  const moved: Task = { ...task, columnId, order: clamped - 0.5 };
  if (column.isDone && !task.completedAt) moved.completedAt = now;
  if (!column.isDone && task.completedAt) delete moved.completedAt;

  return renumber([...others, moved], [task.columnId, columnId]);
};

export const addChecklistItem = (tasks: readonly Task[], taskId: string, text: string): Task[] =>
  tasks.map((task) =>
    task.id === taskId
      ? { ...task, checklist: [...task.checklist, { id: createId('check'), text: text.trim(), done: false }] }
      : task,
  );

export const toggleChecklistItem = (tasks: readonly Task[], taskId: string, itemId: string): Task[] =>
  tasks.map((task) =>
    task.id === taskId
      ? {
          ...task,
          checklist: task.checklist.map((item): TaskChecklistItem => (item.id === itemId ? { ...item, done: !item.done } : item)),
        }
      : task,
  );

export const removeChecklistItem = (tasks: readonly Task[], taskId: string, itemId: string): Task[] =>
  tasks.map((task) =>
    task.id === taskId ? { ...task, checklist: task.checklist.filter((item) => item.id !== itemId) } : task,
  );

export const checklistProgress = (task: Pick<Task, 'checklist'>): { done: number; total: number } => ({
  done: task.checklist.filter((item) => item.done).length,
  total: task.checklist.length,
});

export const isTaskOverdue = (task: Pick<Task, 'dueDate' | 'completedAt'>, today: string): boolean => {
  if (task.completedAt) return false;
  const due = isoDayNumber(task.dueDate);
  const now = isoDayNumber(today);
  return due !== null && now !== null && due < now;
};

/** Due within `days` days (inclusive of today), not overdue, not done. */
export const isTaskDueSoon = (task: Pick<Task, 'dueDate' | 'completedAt'>, today: string, days = 3): boolean => {
  if (task.completedAt) return false;
  const due = isoDayNumber(task.dueDate);
  const now = isoDayNumber(today);
  return due !== null && now !== null && due >= now && due - now <= days;
};

export interface TaskFilter {
  query?: string;
  assigneeId?: string | 'all' | 'unassigned';
  label?: string | 'all';
  priority?: TaskPriority | 'all';
}

export const filterTasks = (tasks: readonly Task[], filter: TaskFilter = {}): Task[] => {
  const query = (filter.query ?? '').trim().toLowerCase();
  return tasks.filter((task) => {
    if (filter.assigneeId === 'unassigned' && task.assigneeIds.length > 0) return false;
    if (filter.assigneeId && filter.assigneeId !== 'all' && filter.assigneeId !== 'unassigned' && !task.assigneeIds.includes(filter.assigneeId)) return false;
    if (filter.label && filter.label !== 'all' && !task.labels.includes(filter.label)) return false;
    if (filter.priority && filter.priority !== 'all' && (task.priority ?? 'normal') !== filter.priority) return false;
    if (!query) return true;
    const haystack = `${task.title} ${task.description ?? ''} ${task.labels.join(' ')}`.toLowerCase();
    return query.split(/\s+/).every((term) => haystack.includes(term));
  });
};

/** Every label used on a board, alphabetically. */
export const boardLabels = (tasks: readonly Task[]): string[] =>
  [...new Set(tasks.flatMap((task) => task.labels))].sort((a, b) => a.localeCompare(b));

export interface BoardSummary {
  total: number;
  done: number;
  overdue: number;
  dueSoon: number;
}

export const summarizeBoard = (tasks: readonly Task[], board: TaskBoard, today: string): BoardSummary => {
  const doneColumns = new Set(board.columns.filter((column) => column.isDone).map((column) => column.id));
  const onBoard = tasks.filter((task) => task.boardId === board.id);
  return {
    total: onBoard.length,
    done: onBoard.filter((task) => doneColumns.has(task.columnId)).length,
    overdue: onBoard.filter((task) => isTaskOverdue(task, today)).length,
    dueSoon: onBoard.filter((task) => isTaskDueSoon(task, today)).length,
  };
};

/** Priority first (urgent → low), then due date (soonest first, undated last), then column order. */
export const sortTasksByUrgency = (tasks: readonly Task[]): Task[] =>
  [...tasks].sort((a, b) => {
    const priority = PRIORITY_RANK[a.priority ?? 'normal'] - PRIORITY_RANK[b.priority ?? 'normal'];
    if (priority !== 0) return priority;
    const dueA = isoDayNumber(a.dueDate) ?? Number.MAX_SAFE_INTEGER;
    const dueB = isoDayNumber(b.dueDate) ?? Number.MAX_SAFE_INTEGER;
    if (dueA !== dueB) return dueA - dueB;
    return a.order - b.order;
  });

/** Tasks due on a given ISO day (for calendar overlays). */
export const tasksDueOn = (tasks: readonly Task[], iso: string): Task[] =>
  tasks.filter((task) => task.dueDate === iso);

/** Drop tasks that point at columns/boards that no longer exist (import hygiene). */
export const pruneOrphanTasks = (tasks: readonly Task[], boards: readonly TaskBoard[]): Task[] => {
  const columnIds = new Set(boards.flatMap((board) => board.columns.map((column) => `${board.id}:${column.id}`)));
  return tasks.filter((task) => columnIds.has(`${task.boardId}:${task.columnId}`));
};
