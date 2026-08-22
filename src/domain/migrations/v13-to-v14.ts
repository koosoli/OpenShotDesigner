/**
 * v13 → v14 adds optional, absent-safe plan-group animation fields:
 *  - `PlanGroup.path` — group keyframes (pivot position + rotation delta per beat),
 *  - `PlanGroup.basePivot` — pivot captured when the first keyframe was added.
 *
 * While stamping the version, any group animation data present is normalized
 * so downstream interpolation never sees corrupt numbers:
 *  - waypoints with non-finite x/y (or an un-coercible beat) are dropped,
 *  - beats are coerced to finite numbers >= 1,
 *  - non-finite optional `rotation` values are stripped (waypoint kept),
 *  - the path is sorted ascending by beat and identical beats dedupe, keeping
 *    the last occurrence,
 *  - empty/invalid paths drop `path`, and then `basePivot` too.
 *
 * LOSSLESS for well-formed data: every other field — including unknown extra
 * waypoint fields and groups without animation data — is preserved verbatim.
 * DETERMINISTIC: identical input always yields identical output.
 */
import type { Project } from '../../types';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Coerce a raw waypoint beat to a finite number >= 1; null when impossible. */
export const coerceWaypointBeat = (raw: unknown): number | null =>
  isFiniteNumber(raw) ? Math.max(1, raw) : null;

/**
 * Normalize one raw group animation path. See module docblock for the rules.
 * Returns null when nothing usable remains.
 */
export const normalizeGroupPathWaypoints = (raw: unknown): UnknownRecord[] | null => {
  if (!Array.isArray(raw)) return null;

  const cleaned: UnknownRecord[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    if (!isFiniteNumber(entry.x) || !isFiniteNumber(entry.y)) continue;
    const beat = coerceWaypointBeat(entry.beat);
    if (beat === null) continue;
    const waypoint: UnknownRecord = { ...entry, beat };
    if ('rotation' in waypoint && !isFiniteNumber(waypoint.rotation)) {
      delete waypoint.rotation;
    }
    cleaned.push(waypoint);
  }

  // Stable ascending sort keeps original order among equal beats, so the
  // dedupe below deterministically keeps the LAST of each identical beat.
  cleaned.sort((a, b) => (a.beat as number) - (b.beat as number));
  const kept: UnknownRecord[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const next = cleaned[i + 1];
    if (!next || next.beat !== cleaned[i].beat) kept.push(cleaned[i]);
  }

  return kept.length > 0 ? kept : null;
};

/** Keep basePivot only when it is a finite {x, y} pair. */
export const normalizeGroupBasePivot = (
  raw: unknown,
): { x: number; y: number } | null => {
  if (!isRecord(raw)) return null;
  return isFiniteNumber(raw.x) && isFiniteNumber(raw.y)
    ? { x: raw.x, y: raw.y }
    : null;
};

/**
 * Normalize a single raw group record. Returns a NEW record (input untouched);
 * null only when the entry is not a record at all (passed through by caller).
 */
export const normalizeGroupAnimationEntry = (raw: unknown): UnknownRecord | null => {
  if (!isRecord(raw)) return null;

  const path = normalizeGroupPathWaypoints(raw.path);
  const next: UnknownRecord = { ...raw };
  if (path) {
    next.path = path;
    const basePivot = normalizeGroupBasePivot(next.basePivot);
    if (basePivot) {
      next.basePivot = basePivot;
    } else {
      delete next.basePivot;
    }
  } else {
    delete next.path;
    delete next.basePivot;
  }
  return next;
};

export const migrateV13ToV14 = (raw: UnknownRecord): Project => {
  const project = { ...(raw as unknown as Project), schemaVersion: 14 };

  // Normalize in the raw-record domain so untyped/legacy group entries stay
  // tolerated (non-record setups/groups pass through untouched).
  if (Array.isArray(raw.setups)) {
    for (const setup of raw.setups) {
      if (!isRecord(setup) || !Array.isArray(setup.groups)) continue;
      setup.groups = setup.groups.map(
        (group) => normalizeGroupAnimationEntry(group) ?? group,
      );
    }
  }

  return project;
};
