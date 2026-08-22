/**
 * Production task board (plan §4 — creative project management).
 *
 * A board owns ordered columns; tasks reference a board and a column. Tasks
 * are project-level shared state (collaboration-ready, globally unique ids)
 * and never require a screenplay (plan rule 1). Assignees reference Person
 * ids from the people domain.
 */

export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface TaskChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface TaskColumn {
  id: string;
  title: string;
  order: number;
  /** Moving a task into this column marks it completed. */
  isDone?: boolean;
}

export interface TaskBoard {
  id: string;
  title: string;
  columns: TaskColumn[];
}

export interface TaskLink {
  kind: 'script_scene' | 'shot' | 'location' | 'production_day' | 'calendar_event' | 'setup';
  id: string;
}

export interface Task {
  id: string;
  boardId: string;
  columnId: string;
  title: string;
  description?: string;
  priority?: TaskPriority;
  /** ISO yyyy-mm-dd; absent = no deadline. */
  dueDate?: string;
  assigneeIds: string[];
  labels: string[];
  checklist: TaskChecklistItem[];
  /** Position within the column. */
  order: number;
  createdAt: string;
  completedAt?: string;
  link?: TaskLink;
}
