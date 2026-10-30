/** v38 adds optional screenplay styles, annotations, bookmarks, alternatives and structure.
 * Existing note lines retain their text and IDs; no implicit content conversion is made. */
import type { Project } from '../../types';
export const migrateV37ToV38 = (raw: Record<string, unknown>): Project => ({ ...raw, schemaVersion: 38 }) as unknown as Project;
