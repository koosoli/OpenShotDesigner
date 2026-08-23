/**
 * v22 → v23 adds one optional, absent-safe field:
 *
 *  - `AVScriptRow.noShot` — the row is deliberately not a shot (titles,
 *    graphics, stock, a music-only beat), so the AV/shot-list coverage check
 *    stops asking it to become a camera on the floor plan.
 *
 * Nothing is backfilled: absent means an ordinary shot row, which is what
 * every existing row is.
 *
 * Values already present are normalised so the flag can only ever mean one
 * thing: it is kept when it is exactly `true` and removed otherwise, since
 * absent already carries "this is a shot row".
 *
 * LOSSLESS for well-formed data. DETERMINISTIC.
 */
import type { Project } from '../../types';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export const migrateV22ToV23 = (raw: UnknownRecord): Project => {
  const project = { ...(raw as unknown as Project), schemaVersion: 23 };
  if (Array.isArray(raw.avScriptRows)) {
    for (const row of raw.avScriptRows) {
      if (!isRecord(row) || !('noShot' in row)) continue;
      if (row.noShot !== true) delete row.noShot;
    }
  }
  return project;
};
