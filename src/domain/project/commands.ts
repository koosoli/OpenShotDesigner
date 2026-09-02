/**
 * Small, framework-free project command boundary.
 *
 * React, undo history and persistence deliberately stay outside this module.
 * That makes every project mutation reducible to the same deterministic
 * operation today, and gives collaboration/autosave one place to attach
 * command metadata later without moving the whole app to another state stack.
 */
import type { Project } from '../../types';

export type ProjectChange =
  | Partial<Project>
  | ((previous: Project) => Partial<Project>);

export type ProjectCommandDomain =
  | 'project'
  | 'plan'
  | 'script'
  | 'shots'
  | 'schedule'
  | 'people'
  | 'technical'
  | 'comments';

export interface ProjectCommandMetadata {
  /** Human-readable intent for diagnostics and a future collaboration log. */
  label: string;
  domain: ProjectCommandDomain;
  /** False for intermediate pointer/gesture writes that must not create undo entries. */
  record?: boolean;
}

export const applyProjectCommand = (
  previous: Project,
  change: ProjectChange,
): Project => {
  const patch = typeof change === 'function' ? change(previous) : change;
  return { ...previous, ...patch };
};
