/**
 * v2 → v3 migration (plan §6.1, §6.4).
 *
 * Adds the plan layer system and plan groups. LOSSLESS and DETERMINISTIC:
 * - setups without `layers` receive the default layer stack with stable,
 *   deterministic ids (`layer-architecture`, `layer-production`, …)
 * - `groups` is initialized to an empty array when absent
 * - elements keep `layerId` undefined (= unlayered, always rendered), so no
 *   existing drawing changes appearance
 */

import type { PlanLayer, Project } from '../../types';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Deterministic default layer stack (stable ids, fixed order). */
export const DEFAULT_LAYERS: PlanLayer[] = [
  { id: 'layer-architecture', name: 'Architecture', visible: true, locked: false, printVisible: true, order: 0 },
  { id: 'layer-production', name: 'Production', visible: true, locked: false, printVisible: true, order: 1 },
  { id: 'layer-lighting', name: 'Lighting', visible: true, locked: false, printVisible: true, order: 2 },
  { id: 'layer-rigging', name: 'Rigging', visible: true, locked: false, printVisible: true, order: 3 },
  { id: 'layer-cables', name: 'Cables', visible: true, locked: false, printVisible: true, order: 4 },
  { id: 'layer-annotations', name: 'Annotations', visible: true, locked: false, printVisible: true, order: 5 },
  { id: 'layer-references', name: 'References', visible: true, locked: false, printVisible: false, order: 6 },
];

export const migrateV2ToV3 = (raw: UnknownRecord): Project => {
  const project = raw as unknown as Project;

  if (Array.isArray(project.setups)) {
    project.setups.forEach((setup) => {
      if (!isRecord(setup)) return;
      if (!Array.isArray(setup.layers)) {
        setup.layers = DEFAULT_LAYERS.map((layer) => ({ ...layer }));
      }
      if (!Array.isArray(setup.groups)) {
        setup.groups = [];
      }
    });
  }

  return { ...(project as Project), schemaVersion: 3 };
};
