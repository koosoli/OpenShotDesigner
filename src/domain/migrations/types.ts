import type { Project } from '../../types';

/** Current persisted project schema version. Bump on every schema change. */
export const CURRENT_PROJECT_SCHEMA_VERSION = 28;

export interface MigrationResult {
  project: Project;
  /** Schema version the input was at, or null when it was already current/unknown. */
  migratedFrom: number | null;
}

export class MigrationError extends Error {
  constructor(
    message: string,
    public issues: string[],
  ) {
    super(message);
    this.name = 'MigrationError';
  }
}

