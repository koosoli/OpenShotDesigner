/**
 * v17 → v18 adds an optional, absent-safe `LightElement.path` — the movement
 * waypoints a fixture follows during a take. Lights move more often than the
 * plan model assumed: followspots and practicals travel mid-take, and on an
 * event the whole position changes between numbers.
 *
 * Nothing is backfilled: a fixture with no path keeps standing still. While
 * stamping the version, any path already present is normalized so the renderer
 * and the interpolator never see corrupt nodes:
 *  - a `path` that is not an array is dropped,
 *  - waypoints without finite x/y or a usable beat are dropped (they cannot be
 *    drawn or interpolated, and a silently mis-placed fixture is worse than an
 *    absent one),
 *  - waypoints missing an id get one derived from their index, so React keys
 *    and drag targeting work,
 *  - a path left with no usable waypoints is removed entirely.
 *
 * LOSSLESS for well-formed data. DETERMINISTIC: ids come from the index, never
 * from randomness, so migrating the same file twice yields the same result.
 */
import type { Project } from '../../types';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** A waypoint is usable only when it has a position and a beat to sit on. */
export const normalizeLightWaypoint = (
  raw: unknown,
  index: number,
): UnknownRecord | undefined => {
  if (!isRecord(raw)) return undefined;
  if (!isFiniteNumber(raw.x) || !isFiniteNumber(raw.y)) return undefined;
  if (!isFiniteNumber(raw.beat)) return undefined;
  const next: UnknownRecord = {
    ...raw,
    id:
      typeof raw.id === 'string' && raw.id.trim().length > 0
        ? raw.id
        : `wp-migrated-${index}`,
  };
  if (!isFiniteNumber(next.rotation)) delete next.rotation;
  return next;
};

export const migrateV17ToV18 = (raw: UnknownRecord): Project => {
  const project = { ...(raw as unknown as Project), schemaVersion: 18 };

  if (Array.isArray(raw.setups)) {
    for (const setup of raw.setups) {
      if (!isRecord(setup) || !Array.isArray(setup.elements)) continue;
      for (const element of setup.elements) {
        if (!isRecord(element) || element.type !== 'light') continue;
        if (!('path' in element)) continue;
        if (!Array.isArray(element.path)) {
          delete element.path;
          continue;
        }
        const cleaned = element.path
          .map((waypoint, index) => normalizeLightWaypoint(waypoint, index))
          .filter((waypoint): waypoint is UnknownRecord => waypoint !== undefined);
        if (cleaned.length > 0) element.path = cleaned;
        else delete element.path;
      }
    }
  }

  return project;
};
