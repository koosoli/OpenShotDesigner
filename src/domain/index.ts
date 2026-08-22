/**
 * Domain layer barrel (plan §3.3). Domain code owns types, pure logic,
 * serialization/migration helpers, validation and tests.
 */
export * from './ids';
export * from './clone';
export * from './units';
export {
  CURRENT_PROJECT_SCHEMA_VERSION,
  MigrationError,
  detectSchemaVersion,
  migrateProject,
} from './migrations';
export type { MigrationResult } from './migrations';
export { validateProject, validateSetup, issue } from './validation';
export type { ValidationIssue, ValidationSeverity } from './validation';
export {
  removePowerCircuit,
  removePowerSource,
  removeRunOfShowCue,
  removeTrussElement,
} from './integrity';
export type { CircuitReferences, CueReferences, TrussReferences } from './integrity';
export * from './media';
