/**
 * v9 → v10 introduces optional scale-calibration provenance on background
 * images. Existing reference images remain unchanged; calibration is never
 * guessed from pixels or filenames.
 */
import type { Project } from '../../types';

type UnknownRecord = Record<string, unknown>;

export const migrateV9ToV10 = (raw: UnknownRecord): Project => ({
  ...(raw as unknown as Project),
  schemaVersion: 10,
});
