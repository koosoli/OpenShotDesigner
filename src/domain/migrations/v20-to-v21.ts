/**
 * v20 → v21 adds four optional, absent-safe groups:
 *
 *  - `Person.headshotFraming.rotation` — a tilt in degrees on the headshot crop.
 *  - `Person.rateCard` — a structured rate (amount, per day/week/flat, VAT).
 *  - `Project.budget` — currency and VAT settings, equipment rates, manual lines.
 *  - `Project.sceneNumbersLocked` — whether scene numbers are production numbers.
 *
 * Nothing is backfilled. A headshot with no rotation is upright, a person with
 * no rate card is unpriced (and reported as such, never priced at zero), a
 * project with no budget has an empty one, and a script whose numbering regime
 * was never chosen is decided by its own numbers on the next edit.
 *
 * Values already present are normalised so the budget never multiplies by a
 * string and the reframer never rotates by NaN:
 *  - rotation wraps into (-180, 180] and non-numeric values are dropped,
 *  - a rate card needs a finite non-negative amount; its basis falls back to
 *    `day`, and a negative or non-numeric VAT is dropped (= default VAT),
 *  - equipment rates need a string key; budget lines need a string id; either
 *    is dropped without its rate, and a line's category falls back to `other`,
 *  - budget settings fall back field by field to the defaults (EUR, 17 %, 5-day week),
 *  - `sceneNumbersLocked` is kept only when it is a boolean.
 *
 * LOSSLESS for well-formed data. DETERMINISTIC.
 */
import type { Project } from '../../types';
import { BUDGET_CATEGORIES, DEFAULT_BUDGET_SETTINGS, normaliseRateCard } from '../budget/logic';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const applyOrDelete = (target: UnknownRecord, key: string, value: unknown): void => {
  if (value === undefined) delete target[key];
  else target[key] = value;
};

/** Wrap into (-180, 180]; reject anything that is not a number. */
export const normalizeRotation = (raw: unknown): number | undefined => {
  if (!isFiniteNumber(raw)) return undefined;
  const wrapped = ((((raw + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 ? 180 : wrapped;
};

const cleanRateFields = (raw: UnknownRecord): UnknownRecord | undefined => {
  const card = normaliseRateCard(raw as { amount?: number; basis?: 'day' | 'week' | 'flat'; vatPercent?: number });
  if (!card) return undefined;
  const next: UnknownRecord = { ...raw, amount: card.amount, basis: card.basis };
  applyOrDelete(next, 'vatPercent', card.vatPercent);
  return next;
};

export const normalizeBudgetSettings = (raw: unknown): UnknownRecord => {
  const source = isRecord(raw) ? raw : {};
  const next: UnknownRecord = {
    currency: typeof source.currency === 'string' && source.currency.trim() ? source.currency.trim().toUpperCase() : DEFAULT_BUDGET_SETTINGS.currency,
    defaultVatPercent: isFiniteNumber(source.defaultVatPercent) && source.defaultVatPercent >= 0 ? source.defaultVatPercent : DEFAULT_BUDGET_SETTINGS.defaultVatPercent,
    weekDays: isFiniteNumber(source.weekDays) && source.weekDays > 0 ? Math.round(source.weekDays) : DEFAULT_BUDGET_SETTINGS.weekDays,
  };
  if (isFiniteNumber(source.contingencyPercent) && source.contingencyPercent > 0) next.contingencyPercent = source.contingencyPercent;
  return next;
};

export const normalizeBudget = (raw: unknown): UnknownRecord | undefined => {
  if (!isRecord(raw)) return undefined;
  const categories = new Set<string>(BUDGET_CATEGORIES.map((category) => category.key));
  const equipmentRates: UnknownRecord[] = [];
  if (Array.isArray(raw.equipmentRates)) {
    raw.equipmentRates.forEach((rate, index) => {
      if (!isRecord(rate) || typeof rate.key !== 'string' || !rate.key.trim()) return;
      const cleaned = cleanRateFields(rate);
      if (!cleaned) return;
      cleaned.id = typeof rate.id === 'string' && rate.id.trim() ? rate.id : `equipment-rate-migrated-${index}`;
      cleaned.label = typeof rate.label === 'string' && rate.label.trim() ? rate.label : rate.key;
      equipmentRates.push(cleaned);
    });
  }
  const lines: UnknownRecord[] = [];
  if (Array.isArray(raw.lines)) {
    raw.lines.forEach((line, index) => {
      if (!isRecord(line)) return;
      const cleaned = cleanRateFields(line);
      if (!cleaned) return;
      cleaned.id = typeof line.id === 'string' && line.id.trim() ? line.id : `budget-line-migrated-${index}`;
      cleaned.category = typeof line.category === 'string' && categories.has(line.category) ? line.category : 'other';
      cleaned.label = typeof line.label === 'string' ? line.label : '';
      applyOrDelete(cleaned, 'units', isFiniteNumber(line.units) && line.units >= 0 ? line.units : undefined);
      applyOrDelete(cleaned, 'quantity', isFiniteNumber(line.quantity) && line.quantity > 0 ? line.quantity : undefined);
      applyOrDelete(cleaned, 'notes', typeof line.notes === 'string' && line.notes.trim() ? line.notes : undefined);
      lines.push(cleaned);
    });
  }
  return { settings: normalizeBudgetSettings(raw.settings), lines, equipmentRates };
};

export const migrateV20ToV21 = (raw: UnknownRecord): Project => {
  const project = { ...(raw as unknown as Project), schemaVersion: 21 };
  const record = project as unknown as UnknownRecord;

  if (Array.isArray(raw.people)) {
    for (const person of raw.people) {
      if (!isRecord(person)) continue;
      if (isRecord(person.headshotFraming) && 'rotation' in person.headshotFraming) {
        applyOrDelete(person.headshotFraming, 'rotation', normalizeRotation(person.headshotFraming.rotation));
      }
      if ('aboveTheLine' in person && typeof person.aboveTheLine !== 'boolean') delete person.aboveTheLine;
      if ('rateCard' in person) {
        applyOrDelete(person, 'rateCard', isRecord(person.rateCard) ? normaliseRateCard(person.rateCard as never) : undefined);
      }
    }
  }

  if ('budget' in raw) applyOrDelete(record, 'budget', normalizeBudget(raw.budget));
  if ('sceneNumbersLocked' in raw && typeof raw.sceneNumbersLocked !== 'boolean') delete record.sceneNumbersLocked;

  return project;
};
