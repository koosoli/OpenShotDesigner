/**
 * v3 → v4 migration (plan §4).
 *
 * Adds the vNext production collections (locations, people, script scenes,
 * segments, production days, schedule blocks…). LOSSLESS and DETERMINISTIC:
 * absent collections are backfilled to empty arrays; existing data is never
 * touched.
 */

import type { Project } from '../../types';

type UnknownRecord = Record<string, unknown>;

const COLLECTIONS = [
  'locations',
  'people',
  'castAssignments',
  'characters',
  'scriptScenes',
  'breakdownItems',
  'productionSegments',
  'productionDays',
  'scheduleBlocks',
] as const;

export const migrateV3ToV4 = (raw: UnknownRecord): Project => {
  const project = { ...(raw as unknown as Project) } as Project & Record<string, unknown>;
  for (const key of COLLECTIONS) {
    if (!Array.isArray(project[key])) {
      project[key] = [];
    }
  }
  return { ...(project as unknown as Project), schemaVersion: 4 } as Project & { schemaVersion: number };
};
