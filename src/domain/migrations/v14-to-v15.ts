/**
 * v14 → v15 adds an optional, absent-safe `ActorElement.characterId`
 * (link a floor-plan actor marker to a script `Character`).
 *
 * While stamping the version, any character link already present is
 * normalized so downstream consumers never see corrupt values:
 *  - non-string `characterId` values are stripped,
 *  - empty/whitespace-only strings are stripped (absent = unlinked),
 *  - everything else is preserved verbatim.
 *
 * LOSSLESS for well-formed data. DETERMINISTIC: identical input always
 * yields identical output.
 */
import type { Project } from '../../types';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Keep only well-formed string ids; strip junk so absence means "unlinked". */
export const normalizeActorCharacterId = (raw: unknown): string | undefined =>
  typeof raw === 'string' && raw.trim().length > 0 ? raw : undefined;

export const migrateV14ToV15 = (raw: UnknownRecord): Project => {
  const project = { ...(raw as unknown as Project), schemaVersion: 15 };

  if (Array.isArray(raw.setups)) {
    for (const setup of raw.setups) {
      if (!isRecord(setup) || !Array.isArray(setup.elements)) continue;
      for (const element of setup.elements) {
        if (!isRecord(element) || element.type !== 'actor') continue;
        if (!('characterId' in element)) continue;
        const normalized = normalizeActorCharacterId(element.characterId);
        if (normalized === undefined) {
          delete element.characterId;
        } else {
          element.characterId = normalized;
        }
      }
    }
  }

  return project;
};
