/**
 * v15 → v16 adds three groups of optional, absent-safe fields:
 *
 *  - `LightElement.shutterCutDeg` — barn-door / framing-shutter cut angle for
 *    the new shutter modifier.
 *  - `PowerConsumer.trussElementId` / `.distroZone` — which truss run or
 *    distribution zone a load belongs to, so power can be reported per truss.
 *  - `PowerCircuit.phaseLeg` — which leg of a 3-phase supply feeds a circuit.
 *
 * Nothing is backfilled: absence keeps its meaning (unknown / unassigned,
 * plan rule 13), so a v15 project loads with exactly the behaviour it had.
 * While stamping the version, values already present are normalized so
 * downstream consumers never see corrupt data:
 *  - out-of-range or non-numeric shutter angles are stripped,
 *  - non-string truss ids and blank distro zones are stripped,
 *  - phase legs outside 1..3 are stripped.
 *
 * LOSSLESS for well-formed data. DETERMINISTIC: identical input always yields
 * identical output.
 */
import type { Project } from '../../types';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Clamp-free validation: a shutter cut is a finite angle within 0..85°. */
export const normalizeShutterCutDeg = (raw: unknown): number | undefined => {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  if (raw < 0 || raw > 85) return undefined;
  return raw;
};

/** Keep only well-formed ids; absence means "not assigned to a truss". */
export const normalizeOptionalId = (raw: unknown): string | undefined =>
  typeof raw === 'string' && raw.trim().length > 0 ? raw : undefined;

/** Trim a zone label; blank becomes absent so it never groups as "". */
export const normalizeDistroZone = (raw: unknown): string | undefined => {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

/** Only L1/L2/L3 are legs; anything else means "not assigned". */
export const normalizePhaseLeg = (raw: unknown): 1 | 2 | 3 | undefined =>
  raw === 1 || raw === 2 || raw === 3 ? raw : undefined;

/** Delete the key when normalization rejected the value, else write it back. */
const applyOrDelete = (target: UnknownRecord, key: string, value: unknown): void => {
  if (value === undefined) delete target[key];
  else target[key] = value;
};

export const migrateV15ToV16 = (raw: UnknownRecord): Project => {
  const project = { ...(raw as unknown as Project), schemaVersion: 16 };

  if (Array.isArray(raw.setups)) {
    for (const setup of raw.setups) {
      if (!isRecord(setup) || !Array.isArray(setup.elements)) continue;
      for (const element of setup.elements) {
        if (!isRecord(element) || element.type !== 'light') continue;
        if (!('shutterCutDeg' in element)) continue;
        applyOrDelete(element, 'shutterCutDeg', normalizeShutterCutDeg(element.shutterCutDeg));
      }
    }
  }

  if (isRecord(raw.powerPlan)) {
    const powerPlan = raw.powerPlan;
    if (Array.isArray(powerPlan.consumers)) {
      for (const consumer of powerPlan.consumers) {
        if (!isRecord(consumer)) continue;
        if ('trussElementId' in consumer) {
          applyOrDelete(consumer, 'trussElementId', normalizeOptionalId(consumer.trussElementId));
        }
        if ('distroZone' in consumer) {
          applyOrDelete(consumer, 'distroZone', normalizeDistroZone(consumer.distroZone));
        }
      }
    }
    if (Array.isArray(powerPlan.circuits)) {
      for (const circuit of powerPlan.circuits) {
        if (!isRecord(circuit)) continue;
        if (!('phaseLeg' in circuit)) continue;
        applyOrDelete(circuit, 'phaseLeg', normalizePhaseLeg(circuit.phaseLeg));
      }
    }
  }

  return project;
};
