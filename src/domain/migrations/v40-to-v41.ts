import type { Project } from '../../types';

/** Every plan element may have an optional vertical offset. Preserve existing placements. */
export const migrateV40ToV41 = (raw: Record<string, unknown>): Project => ({ ...raw, schemaVersion: 41 }) as unknown as Project;
