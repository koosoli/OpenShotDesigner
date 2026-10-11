/**
 * Whole-collection edits for the planning modules — mood boards, task boards,
 * run of show, power, coverage, the standing call sheet — as commands.
 *
 * These panels edit their own list and nothing else, so one command per list
 * with an updater over the committed value is enough: the write is named in
 * undo ("Add task board", "Edit power plan") instead of "Update project
 * metadata", and two writes in one tick both land.
 */
import type { Project } from '../../types';
import type { MoodBoard } from '../moodboard';
import type { Task, TaskBoard } from '../tasks';
import type { CoverageMatrix, RunOfShowCue } from '../scheduling';
import type { PowerPlan } from '../power';
import type { StandingCallSheet } from '../reports';
import type { ProjectBudget } from '../budget';
import type { ContinuityNote } from '../continuity';
import type { ReadinessDismissal } from '../readiness';
import type { ReviewComment } from '../comments';
import type { RiggingAssumptions, TrussElement } from '../rigging';
import type { Person } from '../people/types';
import type { CommandResult } from './types';
import { commandTimestamp } from './types';

const meta = (type: string, description: string): CommandResult['meta'] => ({ type, timestamp: commandTimestamp(), description });

const requireFunction = (name: string, value: unknown) => {
  if (typeof value !== 'function') throw new Error(`${name}: update must be a function.`);
};

export interface UpdateMoodBoardsInput {
  update: (boards: MoodBoard[]) => MoodBoard[];
  description?: string;
}

export const updateMoodBoardsCommand = (project: Project, input: UpdateMoodBoardsInput): CommandResult => {
  requireFunction('updateMoodBoards', input.update);
  return {
    project: { ...project, moodBoards: input.update(project.moodBoards ?? []) },
    meta: meta('updateMoodBoards', input.description ?? 'Edit mood board'),
  };
};

export interface UpdateTaskBoardsInput {
  boards?: (boards: TaskBoard[]) => TaskBoard[];
  tasks?: (tasks: Task[]) => Task[];
  description?: string;
}

/** Boards and their tasks together, so deleting a board takes its tasks in the same undo step. */
export const updateTaskBoardsCommand = (project: Project, input: UpdateTaskBoardsInput): CommandResult => {
  if (!input.boards && !input.tasks) throw new Error('updateTaskBoards: nothing to update.');
  return {
    project: {
      ...project,
      ...(input.boards ? { taskBoards: input.boards(project.taskBoards ?? []) } : {}),
      ...(input.tasks ? { tasks: input.tasks(project.tasks ?? []) } : {}),
    },
    meta: meta('updateTaskBoards', input.description ?? 'Edit tasks'),
  };
};

export interface SetRunOfShowInput {
  cues: RunOfShowCue[];
  /** Rows of the coverage matrix follow the cues; pass it when they changed together. */
  coverageMatrix?: CoverageMatrix;
  description?: string;
}

export const setRunOfShowCommand = (project: Project, input: SetRunOfShowInput): CommandResult => ({
  project: { ...project, runOfShowCues: input.cues, ...(input.coverageMatrix ? { coverageMatrix: input.coverageMatrix } : {}) },
  meta: meta('setRunOfShow', input.description ?? 'Edit run of show'),
});

export const setPowerPlanCommand = (project: Project, input: { plan: PowerPlan; description?: string }): CommandResult => ({
  project: { ...project, powerPlan: input.plan },
  meta: meta('setPowerPlan', input.description ?? 'Edit power plan'),
});

export const setCoverageMatrixCommand = (project: Project, input: { matrix: CoverageMatrix; description?: string }): CommandResult => ({
  project: { ...project, coverageMatrix: input.matrix },
  meta: meta('setCoverageMatrix', input.description ?? 'Edit coverage matrix'),
});

export const patchStandingCallSheetCommand = (project: Project, input: { updates: Partial<StandingCallSheet> }): CommandResult => ({
  project: { ...project, standingCallSheet: { ...(project.standingCallSheet ?? {}), ...input.updates } },
  meta: meta('patchStandingCallSheet', 'Edit standing call sheet'),
});

/** Budget edits run against the committed budget (an empty one when there is none yet). */
export const updateBudgetCommand = (
  project: Project,
  input: { update: (budget: ProjectBudget | undefined) => ProjectBudget; description?: string },
): CommandResult => {
  requireFunction('updateBudget', input.update);
  return { project: { ...project, budget: input.update(project.budget) }, meta: meta('updateBudget', input.description ?? 'Edit budget') };
};

/** Merge fields into one contact, against the committed list (rates, notes). */
export const patchPersonCommand = (
  project: Project,
  input: { personId: string; updates: Partial<Person>; description?: string },
): CommandResult => {
  const person = (project.people ?? []).find((candidate) => candidate.id === input.personId);
  if (!person) throw new Error(`patchPerson: unknown person id "${input.personId}".`);
  return {
    project: { ...project, people: (project.people ?? []).map((candidate) => (candidate.id === input.personId ? { ...candidate, ...input.updates } : candidate)) },
    meta: { ...meta('patchPerson', input.description ?? `Edit ${person.displayName}`), entityId: person.id },
  };
};

export const updateContinuityNotesCommand = (
  project: Project,
  input: { update: (notes: ContinuityNote[]) => ContinuityNote[]; description?: string },
): CommandResult => {
  requireFunction('updateContinuityNotes', input.update);
  return { project: { ...project, continuityNotes: input.update(project.continuityNotes ?? []) }, meta: meta('updateContinuityNotes', input.description ?? 'Edit continuity notes') };
};

/** An emptied list is stored as absent, as before. */
export const updateReadinessDismissalsCommand = (
  project: Project,
  input: { update: (dismissals: ReadinessDismissal[]) => ReadinessDismissal[]; description?: string },
): CommandResult => {
  requireFunction('updateReadinessDismissals', input.update);
  const next = input.update(project.readinessDismissals ?? []);
  return { project: { ...project, readinessDismissals: next.length ? next : undefined }, meta: meta('updateReadinessDismissals', input.description ?? 'Edit readiness') };
};

/** An emptied list is stored as absent, as before. */
export const updateReviewCommentsCommand = (
  project: Project,
  input: { update: (comments: ReviewComment[]) => ReviewComment[]; description?: string },
): CommandResult => {
  requireFunction('updateReviewComments', input.update);
  const next = input.update(project.reviewComments ?? []);
  return { project: { ...project, reviewComments: next.length ? next : undefined }, meta: meta('updateReviewComments', input.description ?? 'Edit review notes') };
};

/** Truss runs as a list — for dragging and rotating on the plan. */
export const updateTrussElementsCommand = (
  project: Project,
  input: { update: (elements: TrussElement[]) => TrussElement[]; description?: string },
): CommandResult => {
  requireFunction('updateTrussElements', input.update);
  return { project: { ...project, trussElements: input.update(project.trussElements ?? []) }, meta: meta('updateTrussElements', input.description ?? 'Move truss') };
};

export const setRiggingAssumptionsCommand = (project: Project, input: { assumptions: RiggingAssumptions }): CommandResult => ({
  project: { ...project, riggingAssumptions: input.assumptions },
  meta: meta('setRiggingAssumptions', 'Edit rigging assumptions'),
});
