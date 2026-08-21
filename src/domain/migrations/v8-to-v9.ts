/**
 * v8 → v9 introduces optional Asset Library symbol references on shape
 * elements. Existing shapes remain ordinary shapes; no references are guessed.
 */
import type { Project } from '../../types';

type UnknownRecord = Record<string, unknown>;

export const migrateV8ToV9 = (raw: UnknownRecord): Project => ({
  ...(raw as unknown as Project),
  schemaVersion: 9,
});
