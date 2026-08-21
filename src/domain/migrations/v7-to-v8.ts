/**
 * v7 → v8 formalizes explicit DMX fixture-mode footprint fields on light
 * elements and day-specific call-sheet detail fields. Both are optional:
 * legacy projects retain unknown technical data rather than receiving guesses.
 */
import type { Project } from '../../types';

type UnknownRecord = Record<string, unknown>;

export const migrateV7ToV8 = (raw: UnknownRecord): Project => ({
  ...(raw as unknown as Project),
  productionCalendarEvents: Array.isArray(raw.productionCalendarEvents) ? raw.productionCalendarEvents as Project['productionCalendarEvents'] : [],
  schemaVersion: 8,
});
