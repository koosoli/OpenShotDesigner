import type { Project } from '../../types';

/** Older cameras and walls keep their preset tilt and preview height. */
export const migrateV39ToV40 = (raw: Record<string, unknown>): Project => ({ ...raw, schemaVersion: 40 }) as unknown as Project;
