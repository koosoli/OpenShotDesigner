/**
 * v4 → v5 migration (plan §15.2, §20, §22, §24).
 *
 * Adds run-of-show cues, the power plan, logistics containers/packed items,
 * and semantic port-aware cable endpoints. LOSSLESS and DETERMINISTIC:
 * absent collections are backfilled to empty defaults; existing cable labels
 * are untouched (their new element/port reference fields stay undefined).
 */

import type { Project } from '../../types';

type UnknownRecord = Record<string, unknown>;

const ARRAY_COLLECTIONS = ['runOfShowCues', 'logisticsContainers', 'packedItems'] as const;

export const migrateV4ToV5 = (raw: UnknownRecord): Project => {
  const project = { ...(raw as unknown as Project) } as Project & Record<string, unknown>;

  for (const key of ARRAY_COLLECTIONS) {
    if (!Array.isArray(project[key])) {
      project[key] = [];
    }
  }
  if (!project.powerPlan || typeof project.powerPlan !== 'object') {
    project.powerPlan = { sources: [], circuits: [], consumers: [] };
  } else if (!Array.isArray((project.powerPlan as unknown as UnknownRecord).consumers)) {
    (project.powerPlan as unknown as UnknownRecord).consumers = [];
  }

  return { ...(project as unknown as Project), schemaVersion: 5 };
};
