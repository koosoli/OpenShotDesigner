/**
 * v1 → v2 migration (plan §3.2).
 *
 * v1 = every project saved before schema versioning existed (no
 * `schemaVersion` field). The migration is LOSSLESS and DETERMINISTIC:
 *
 * - sets `schemaVersion: 2`
 * - backfills missing ids deterministically as `<kind>-migrated-<index>`
 *   (no randomness, so identical input always migrates to identical output)
 * - never drops, rewrites or renames existing data; optional arrays that were
 *   absent stay absent
 */

import type { Project } from '../../types';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const ensureId = (entity: UnknownRecord, kind: string, index: number): void => {
  if (typeof entity.id !== 'string' || entity.id.length === 0) {
    entity.id = `${kind}-migrated-${index}`;
  }
};

export const migrateV1ToV2 = (raw: UnknownRecord): Project => {
  const project = raw as unknown as Project;

  // Backfill missing setup/element/shot ids deterministically.
  const setups = Array.isArray(project.setups) ? project.setups : [];
  setups.forEach((setup, setupIndex) => {
    const record = setup as unknown as UnknownRecord;
    ensureId(record, 'setup', setupIndex);
    if (!Array.isArray(setup.elements)) return;
    setup.elements.forEach((element, elementIndex) => {
      if (isRecord(element)) ensureId(element, 'el', elementIndex);
    });
    if (Array.isArray(setup.shots)) {
      setup.shots.forEach((shot, shotIndex) => {
        if (isRecord(shot as unknown)) ensureId(shot as unknown as UnknownRecord, 'shot', shotIndex);
      });
    }
  });

  return { ...(project as Project), schemaVersion: 2 };
};
