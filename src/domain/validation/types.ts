/**
 * Composable domain validation framework (plan §3.6).
 *
 * Validators are pure functions returning structured issues. They run at
 * meaningful boundaries (load/import/migrate/save), never per pointer-move.
 */

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  severity: ValidationSeverity;
  /** Stable machine-readable code, e.g. `DANGLING_CAMERA_REF`. */
  code: string;
  entityId?: string;
  message: string;
}

export const issue = (
  severity: ValidationSeverity,
  code: string,
  message: string,
  entityId?: string,
): ValidationIssue => ({ severity, code, message, ...(entityId ? { entityId } : {}) });
