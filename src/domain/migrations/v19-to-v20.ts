/**
 * v19 → v20 adds two optional, absent-safe groups:
 *
 *  - `SceneSetup.sunSettings` — sun and time-of-day planning for a scene
 *    (overlay on/off, plan north, the date and time being planned).
 *  - `ProductionDay.callSheet.personCalls` — individual call times, for the
 *    people who do not work to the general crew call.
 *
 * Nothing is backfilled. A scene with no sun settings behaves exactly as it did
 * (no overlay), and a person with no individual call works to the general crew
 * call, which is what every existing sheet already means.
 *
 * Values already present are normalised so the renderer never sees a nonsense
 * bearing or a call for nobody:
 *  - plan north wraps into 0..359 and non-numeric values are dropped,
 *  - the time of day clamps to a real minute of the day,
 *  - a date that is not YYYY-MM-DD is dropped, falling back to the project date,
 *  - individual calls that name nobody are dropped, and missing ids are minted
 *    deterministically from the row index.
 *
 * LOSSLESS for well-formed data. DETERMINISTIC.
 */
import type { Project } from '../../types';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Wrap any bearing into 0..359; reject anything that is not a number. */
export const normalizePlanNorth = (raw: unknown): number | undefined =>
  isFiniteNumber(raw) ? ((Math.round(raw) % 360) + 360) % 360 : undefined;

/** Clamp to a real minute of the day. */
export const normalizeTimeMinutes = (raw: unknown): number | undefined =>
  isFiniteNumber(raw) ? Math.max(0, Math.min(1439, Math.round(raw))) : undefined;

const applyOrDelete = (target: UnknownRecord, key: string, value: unknown): void => {
  if (value === undefined) delete target[key];
  else target[key] = value;
};

export const normalizeSunSettings = (raw: unknown): UnknownRecord | undefined => {
  if (!isRecord(raw)) return undefined;
  const next: UnknownRecord = { ...raw };
  applyOrDelete(next, 'enabled', typeof raw.enabled === 'boolean' ? raw.enabled : undefined);
  applyOrDelete(next, 'planNorthDeg', normalizePlanNorth(raw.planNorthDeg));
  applyOrDelete(next, 'timeMinutes', normalizeTimeMinutes(raw.timeMinutes));
  applyOrDelete(
    next,
    'date',
    typeof raw.date === 'string' && ISO_DATE.test(raw.date) ? raw.date : undefined,
  );
  return Object.keys(next).length > 0 ? next : undefined;
};

export const migrateV19ToV20 = (raw: UnknownRecord): Project => {
  const project = { ...(raw as unknown as Project), schemaVersion: 20 };

  if (Array.isArray(raw.setups)) {
    for (const setup of raw.setups) {
      if (!isRecord(setup) || !('sunSettings' in setup)) continue;
      applyOrDelete(setup, 'sunSettings', normalizeSunSettings(setup.sunSettings));
    }
  }

  if (Array.isArray(raw.productionDays)) {
    for (const day of raw.productionDays) {
      if (!isRecord(day) || !isRecord(day.callSheet)) continue;
      const callSheet = day.callSheet;
      if (!('personCalls' in callSheet)) continue;
      if (!Array.isArray(callSheet.personCalls)) {
        delete callSheet.personCalls;
        continue;
      }
      const cleaned: UnknownRecord[] = [];
      callSheet.personCalls.forEach((call, index) => {
        if (!isRecord(call)) return;
        const personId = typeof call.personId === 'string' ? call.personId.trim() : '';
        if (!personId) return; // a call for nobody cannot be shown or repaired
        const next: UnknownRecord = {
          id: typeof call.id === 'string' && call.id.trim() ? call.id : `call-migrated-${index}`,
          personId,
        };
        for (const key of ['time', 'note'] as const) {
          const value = typeof call[key] === 'string' ? (call[key] as string).trim() : '';
          if (value) next[key] = value;
        }
        cleaned.push(next);
      });
      if (cleaned.length > 0) callSheet.personCalls = cleaned;
      else delete callSheet.personCalls;
    }
  }

  return project;
};
