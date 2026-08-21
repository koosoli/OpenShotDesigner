/** v11 → v12 reserves stable fixture-profile references on light elements.
 * Existing lights intentionally remain unlinked; no technical data is guessed. */
import type { Project } from '../../types';

type UnknownRecord = Record<string, unknown>;

export const migrateV11ToV12 = (raw: UnknownRecord): Project =>
  ({ ...(raw as unknown as Project), schemaVersion: 12 }) as Project;
