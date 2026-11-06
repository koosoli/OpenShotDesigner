import type { Project } from '../../types';
/** Optional per-fixture aim; missing values retain body heading and shared preview tilt. */
export const migrateV41ToV42 = (raw: Record<string, unknown>): Project => ({ ...raw, schemaVersion: 42 }) as unknown as Project;
