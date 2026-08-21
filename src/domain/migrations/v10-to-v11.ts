/** v10 → v11 formalizes per-beat actor speech without altering waypoint cues. */
import type { Project } from '../../types';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export const migrateV10ToV11 = (raw: UnknownRecord): Project => {
  const setups = Array.isArray(raw.setups)
    ? raw.setups.map((setup) => {
        if (!isRecord(setup) || !Array.isArray(setup.elements)) return setup;
        return {
          ...setup,
          elements: setup.elements.map((element) => {
            if (!isRecord(element) || element.type !== 'actor' || Array.isArray(element.speechCues)) {
              return element;
            }
            return { ...element, speechCues: [] };
          }),
        };
      })
    : raw.setups;

  return { ...(raw as unknown as Project), setups, schemaVersion: 11 } as Project;
};
