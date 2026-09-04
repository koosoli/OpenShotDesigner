/**
 * Shared result shape for the framework-free domain commands.
 *
 * Every command takes a project plus a small input, validates the input
 * first, and returns a new project with human-readable metadata. The metadata
 * describes the intent ("Move Scene 17 from Day 4 to Day 5"), never the
 * mechanism ("Update project metadata"), so a future collaboration log or
 * undo entry can quote it directly.
 */
import type { Project } from '../../types';

export interface CommandMeta {
  /** Stable command name, e.g. "deleteShot". */
  type: string;
  /** Id of the primary entity the command acted on, when there is one. */
  entityId?: string;
  /** ISO timestamp of when the command ran. */
  timestamp: string;
  /** Human-readable description of what happened. */
  description: string;
}

export interface CommandResult<TProject = Project> {
  project: TProject;
  meta: CommandMeta;
  warnings?: string[];
}

/** Current time as an ISO timestamp for command metadata. */
export const commandTimestamp = (): string => new Date().toISOString();
