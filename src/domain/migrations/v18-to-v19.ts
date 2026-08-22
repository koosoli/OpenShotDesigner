/**
 * v18 → v19 introduces the `road` element type: streets, paths and driveways
 * drawn as a two-endpoint run with real carriageway width.
 *
 * Existing projects contain no roads, so there is nothing to backfill — the
 * bump exists because the persisted `ElementType` union widened, and because
 * imported JSON can carry roads that a hand-edit or an older export mangled.
 * Any road present is normalized so the renderer never divides by a missing
 * endpoint or draws a zero-width band:
 *  - a road without finite x2/y2 gets a straight default run,
 *  - a non-positive or non-numeric width falls back to the 120px default,
 *  - lanes clamp to 1..8 whole lanes,
 *  - unknown surface / marking values are dropped so the renderer's own
 *    defaults apply rather than a blank fill.
 *
 * LOSSLESS for well-formed data. DETERMINISTIC.
 */
import type { Project, RoadMarking, RoadSurface } from '../../types';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const ROAD_SURFACES: readonly RoadSurface[] = [
  'asphalt',
  'concrete',
  'gravel',
  'cobble',
  'dirt',
  'rail',
];

export const ROAD_MARKINGS: readonly RoadMarking[] = [
  'none',
  'dashed',
  'solid',
  'double',
  'crosswalk',
];

/** Default carriageway width in plan px (≈2.4 m at the default 50px/m). */
export const DEFAULT_ROAD_WIDTH = 120;

export const normalizeRoad = (road: UnknownRecord): void => {
  const x = isFiniteNumber(road.x) ? road.x : 0;
  const y = isFiniteNumber(road.y) ? road.y : 0;
  road.x = x;
  road.y = y;
  if (!isFiniteNumber(road.x2)) road.x2 = x + 320;
  if (!isFiniteNumber(road.y2)) road.y2 = y;

  road.width =
    isFiniteNumber(road.width) && road.width > 0 ? road.width : DEFAULT_ROAD_WIDTH;

  if ('lanes' in road) {
    if (!isFiniteNumber(road.lanes)) delete road.lanes;
    else road.lanes = Math.max(1, Math.min(8, Math.round(road.lanes)));
  }

  if ('surface' in road && !ROAD_SURFACES.includes(road.surface as RoadSurface)) {
    delete road.surface;
  }
  if ('marking' in road && !ROAD_MARKINGS.includes(road.marking as RoadMarking)) {
    delete road.marking;
  }
  if ('curveOffset' in road && !isFiniteNumber(road.curveOffset)) delete road.curveOffset;
  if ('sidewalkWidth' in road && !isFiniteNumber(road.sidewalkWidth)) delete road.sidewalkWidth;
};

export const migrateV18ToV19 = (raw: UnknownRecord): Project => {
  const project = { ...(raw as unknown as Project), schemaVersion: 19 };

  if (Array.isArray(raw.setups)) {
    for (const setup of raw.setups) {
      if (!isRecord(setup) || !Array.isArray(setup.elements)) continue;
      for (const element of setup.elements) {
        if (!isRecord(element) || element.type !== 'road') continue;
        normalizeRoad(element);
      }
    }
  }

  return project;
};
