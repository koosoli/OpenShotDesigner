/**
 * v5 → v6 migration (plan §11, §23).
 *
 * Formalizes the rigging collections. LOSSLESS and DETERMINISTIC: absent
 * collections are backfilled to empty arrays; existing data untouched.
 */

import type { Project } from '../../types';

type UnknownRecord = Record<string, unknown>;

const COLLECTIONS = ['trussProfiles', 'trussElements', 'suspendedLoads', 'riggingItems'] as const;

export const migrateV5ToV6 = (raw: UnknownRecord): Project => {
  const project = { ...(raw as unknown as Project) } as Project & Record<string, unknown>;
  for (const key of COLLECTIONS) {
    if (!Array.isArray(project[key])) {
      project[key] = [];
    }
  }
  return { ...(project as unknown as Project), schemaVersion: 6 };
};
