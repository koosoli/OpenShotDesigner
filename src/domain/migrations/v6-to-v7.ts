/**
 * v6 → v7 migration (plan §4.13, §11–§15 formalization wave).
 *
 * Backfills every optional collection introduced since v6 to empty defaults
 * (rigging collections, named revisions, coverage matrix). Setup-level
 * location links (locationId / masterPlanForLocationId) are absent-safe and
 * intentionally left undefined for existing data — lossless, deterministic.
 */

import type { Project } from '../../types';

type UnknownRecord = Record<string, unknown>;

const COLLECTIONS = [
  'trussProfiles',
  'trussElements',
  'suspendedLoads',
  'riggingItems',
  'revisions',
] as const;

export const migrateV6ToV7 = (raw: UnknownRecord): Project => {
  const project = { ...(raw as unknown as Project) } as Project & Record<string, unknown>;
  for (const key of COLLECTIONS) {
    if (!Array.isArray(project[key])) {
      project[key] = [];
    }
  }
  return { ...(project as unknown as Project), schemaVersion: 7 };
};
