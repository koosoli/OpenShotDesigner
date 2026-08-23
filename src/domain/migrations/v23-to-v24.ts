/**
 * v23 → v24 opens the continuity log:
 *
 *  - `Project.takes` — one record per take actually shot. NOT backfilled: it
 *    is optional and absent-safe, and every reader already resolves it as
 *    `takes ?? []`. Writing `[]` into a project that never shot anything would
 *    make the migration rewrite content it has nothing to say about, which the
 *    lossless-migration tests rightly object to.
 *  - `Shot.unplanned` — shot on the day without having been planned.
 *    Normalised the way v22→v23 normalises `noShot`: kept when it is exactly
 *    `true`, removed otherwise, so absent can only ever mean "planned".
 *
 * Nothing is fabricated from `Shot.takesCount`. A stored count of 3 says three
 * takes happened, but not what they were called, which day they were on or
 * which was good — three blank records would look like a log somebody kept.
 * The count stays where it is and `takesCountFor` falls back to it until the
 * log has something to say, which is the honest reading of both values.
 *
 * LOSSLESS for well-formed data. DETERMINISTIC.
 */
import type { Project } from '../../types';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export const migrateV23ToV24 = (raw: UnknownRecord): Project => {
  const project = { ...(raw as unknown as Project), schemaVersion: 24 };

  if (Array.isArray(raw.setups)) {
    for (const setup of raw.setups) {
      if (!isRecord(setup) || !Array.isArray(setup.shots)) continue;
      for (const shot of setup.shots) {
        if (!isRecord(shot) || !('unplanned' in shot)) continue;
        if (shot.unplanned !== true) delete shot.unplanned;
      }
    }
  }

  return project;
};
