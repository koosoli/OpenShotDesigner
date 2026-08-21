/**
 * Map-provider adapters for Location entities (plan rules 29/30).
 *
 * Explicit provider adapters only — no scraping, no third-party SDK, no API
 * keys required. OpenStreetMap is the default provider because it is keyless
 * and safe for the standalone/GitHub-Pages build; Google Maps is offered as a
 * plain link-out. Everything degrades gracefully offline: callers render the
 * stored address text when network features are unavailable.
 *
 * Attribution: maps and geocoding results © OpenStreetMap contributors
 * (geocoding via Nominatim, https://www.openstreetmap.org/copyright).
 */

import type { Location } from './types';

export interface GeoPoint {
  lat: number;
  lng: number;
}

const isValidPoint = (point: GeoPoint): boolean =>
  Number.isFinite(point.lat) &&
  Number.isFinite(point.lng) &&
  Math.abs(point.lat) <= 90 &&
  Math.abs(point.lng) <= 180;

/** Stored pin for a location, or null when it has none/invalid coordinates. */
export const locationPoint = (location: Pick<Location, 'lat' | 'lng'>): GeoPoint | null => {
  if (location.lat === undefined || location.lng === undefined) return null;
  const point = { lat: location.lat, lng: location.lng };
  return isValidPoint(point) ? point : null;
};

/** Free-text query used to geocode a location: address when set, else name. */
export const locationQuery = (location: Pick<Location, 'name' | 'address'>): string =>
  (location.address?.trim() || location.name.trim() || '').replace(/\s+/g, ' ');

const formatCoord = (value: number): string => value.toFixed(6);

/** Keyless OpenStreetMap iframe embed centered on a pin. */
export const osmEmbedUrl = (point: GeoPoint, zoom = 0.02): string => {
  const dLat = zoom / 2;
  const dLng = zoom;
  const bbox = [
    formatCoord(point.lng - dLng),
    formatCoord(point.lat - dLat),
    formatCoord(point.lng + dLng),
    formatCoord(point.lat + dLat),
  ].join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${formatCoord(point.lat)},${formatCoord(point.lng)}`;
};

/** Link-out URL for a location: pin when known, free-text search otherwise. */
export const locationMapLinkUrl = (
  location: Pick<Location, 'name' | 'address' | 'lat' | 'lng'>,
): string => {
  const point = locationPoint(location);
  if (point) {
    return `https://www.google.com/maps/search/?api=1&query=${formatCoord(point.lat)},${formatCoord(point.lng)}`;
  }
  const query = locationQuery(location);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
};

/** OpenStreetMap link-out centred on the pin (or the free-text search). */
export const locationOsmLinkUrl = (
  location: Pick<Location, 'name' | 'address' | 'lat' | 'lng'>,
): string => {
  const point = locationPoint(location);
  if (point) {
    return `https://www.openstreetmap.org/?mlat=${formatCoord(point.lat)}&mlon=${formatCoord(point.lng)}#map=16/${formatCoord(point.lat)}/${formatCoord(point.lng)}`;
  }
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(locationQuery(location))}`;
};

export type GeocodeResult =
  | { status: 'ok'; point: GeoPoint; label: string }
  | { status: 'not_found' }
  | { status: 'unavailable'; message: string };

interface NominatimPlace {
  lat?: string;
  lon?: string;
  display_name?: string;
}

/**
 * Resolve free text into coordinates via OSM Nominatim. Network-dependent:
 * every failure mode resolves (never throws) so the UI can fall back to the
 * stored address text.
 */
export const geocodeLocation = async (
  query: string,
  signal?: AbortSignal,
): Promise<GeocodeResult> => {
  const trimmed = query.trim();
  if (!trimmed) return { status: 'not_found' };
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(trimmed)}`;
  try {
    const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (!response.ok) {
      return { status: 'unavailable', message: `Lookup failed (HTTP ${response.status}).` };
    }
    const places = (await response.json()) as NominatimPlace[];
    const place = places[0];
    const lat = Number(place?.lat);
    const lng = Number(place?.lon);
    if (!place || !Number.isFinite(lat) || !Number.isFinite(lng)) return { status: 'not_found' };
    const point = { lat, lng };
    return { status: 'ok', point, label: place.display_name ?? trimmed };
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError'
      ? 'Lookup cancelled.'
      : 'Lookup unavailable — check your connection.';
    return { status: 'unavailable', message };
  }
};
