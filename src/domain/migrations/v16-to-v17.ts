/**
 * v16 → v17 adds two optional, absent-safe groups:
 *
 *  - `Person.hotelName` / `.hotelAddress` / `.hotelCheckIn` / `.hotelCheckOut`
 *    — lodging for away shoots, printed as an accommodation table.
 *  - `ProductionDay.callSheet.pickupNotes` / `.pickups[]` — transport
 *    arrangements and the per-person pick-up list on a call sheet.
 *
 * Nothing is backfilled: a person with no hotel and a day with no pick-ups keep
 * exactly the behaviour they had. While stamping the version, values already
 * present are normalized so downstream consumers never see corrupt data:
 *  - non-string lodging values and blank strings are stripped,
 *  - pick-up rows without a usable `personId` are dropped (a pick-up for
 *    nobody cannot be rendered or repaired),
 *  - pick-up rows missing an `id` are given one, so React keys and edits work.
 *
 * LOSSLESS for well-formed data. DETERMINISTIC: ids are derived from the row's
 * index, never random, so migrating the same file twice gives the same result.
 */
import type { Project } from '../../types';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Trim a free-text field; blank becomes absent (unknown, never ""). */
export const normalizeOptionalText = (raw: unknown): string | undefined => {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const LODGING_KEYS = ['hotelName', 'hotelAddress', 'hotelCheckIn', 'hotelCheckOut'] as const;
const PICKUP_TEXT_KEYS = ['time', 'location', 'notes'] as const;

const applyOrDelete = (target: UnknownRecord, key: string, value: unknown): void => {
  if (value === undefined) delete target[key];
  else target[key] = value;
};

export const migrateV16ToV17 = (raw: UnknownRecord): Project => {
  const project = { ...(raw as unknown as Project), schemaVersion: 17 };

  if (Array.isArray(raw.people)) {
    for (const person of raw.people) {
      if (!isRecord(person)) continue;
      for (const key of LODGING_KEYS) {
        if (!(key in person)) continue;
        applyOrDelete(person, key, normalizeOptionalText(person[key]));
      }
    }
  }

  if (Array.isArray(raw.productionDays)) {
    for (const day of raw.productionDays) {
      if (!isRecord(day) || !isRecord(day.callSheet)) continue;
      const callSheet = day.callSheet;
      if ('pickupNotes' in callSheet) {
        applyOrDelete(callSheet, 'pickupNotes', normalizeOptionalText(callSheet.pickupNotes));
      }
      if (!('pickups' in callSheet)) continue;
      if (!Array.isArray(callSheet.pickups)) {
        delete callSheet.pickups;
        continue;
      }
      const cleaned: UnknownRecord[] = [];
      callSheet.pickups.forEach((pickup, index) => {
        if (!isRecord(pickup)) return;
        const personId = normalizeOptionalText(pickup.personId);
        if (!personId) return; // a pick-up for nobody cannot be shown or fixed
        const next: UnknownRecord = {
          id: normalizeOptionalText(pickup.id) ?? `pickup-migrated-${index}`,
          personId,
        };
        for (const key of PICKUP_TEXT_KEYS) {
          const value = normalizeOptionalText(pickup[key]);
          if (value !== undefined) next[key] = value;
        }
        cleaned.push(next);
      });
      if (cleaned.length > 0) callSheet.pickups = cleaned;
      else delete callSheet.pickups;
    }
  }

  return project;
};
