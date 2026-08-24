/**
 * How far apart two location pins are.
 *
 * Great-circle distance on a spherical Earth. The schedule-health checks use
 * it to ask whether a day's locations are plausibly one company move apart,
 * which is a question about kilometres, not about roads — and pretending
 * otherwise would need a routing provider the standalone build must work
 * without (rules 3 and 30).
 *
 * That limit is the important part, so it is named rather than buried: this is
 * the crow-flying distance. Two pins 8 km apart across a river with no bridge
 * are an hour's move, and the warning that reads "these are close" would be
 * wrong. It is a planning aid (rule 15) and the caller says so.
 */

const EARTH_RADIUS_KM = 6371.0088;
const DEG = Math.PI / 180;

export interface LatLng {
  lat: number;
  lng: number;
}

/** True when both coordinates are present and usable. */
export const hasPin = (
  point: { lat?: number; lng?: number } | undefined | null,
): point is LatLng =>
  !!point &&
  typeof point.lat === 'number' &&
  Number.isFinite(point.lat) &&
  Math.abs(point.lat) <= 90 &&
  typeof point.lng === 'number' &&
  Number.isFinite(point.lng) &&
  Math.abs(point.lng) <= 180;

/**
 * Kilometres between two pins, straight line over the surface.
 *
 * Uses the haversine form rather than the spherical law of cosines: the
 * latter loses precision for short distances, and short distances are the
 * whole point here — the interesting comparison is between two unit bases in
 * the same city, not between continents.
 */
export const distanceKm = (from: LatLng, to: LatLng): number => {
  const dLat = (to.lat - from.lat) * DEG;
  const dLng = (to.lng - from.lng) * DEG;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(from.lat * DEG) * Math.cos(to.lat * DEG) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
};

/**
 * The furthest-apart pair in a set of pins, or null when fewer than two carry
 * coordinates. Points without a pin are skipped rather than treated as (0, 0),
 * which is in the Atlantic and would make every day look like a world tour.
 */
export const widestSeparation = <T extends { lat?: number; lng?: number }>(
  points: readonly T[],
): { from: T; to: T; km: number } | null => {
  const pinned = points.filter((point): point is T & LatLng => hasPin(point));
  let widest: { from: T; to: T; km: number } | null = null;
  for (let i = 0; i < pinned.length; i += 1) {
    for (let j = i + 1; j < pinned.length; j += 1) {
      const km = distanceKm(pinned[i], pinned[j]);
      if (!widest || km > widest.km) widest = { from: pinned[i], to: pinned[j], km };
    }
  }
  return widest;
};
