/**
 * v34 -> v35 adds one optional, absent-safe field:
 *
 * - `Project.productionReportNotes` — the hand-written part of each day's
 *   production report (delays, accidents, remarks, prepared by); absent
 *   means no notes.
 *
 * Nothing existing changes meaning, so this only stamps the version.
 */
import type { Project } from '../../types';

type UnknownRecord = Record<string, unknown>;

export const migrateV34ToV35 = (raw: UnknownRecord): Project => {
  const project = raw as unknown as Project;
  return { ...project, schemaVersion: 35 };
};
