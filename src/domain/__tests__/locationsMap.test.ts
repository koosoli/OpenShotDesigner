import { describe, it, expect } from 'vitest';
import {
  geocodeLocation,
  locationMapLinkUrl,
  locationOsmLinkUrl,
  locationPoint,
  locationQuery,
  osmEmbedUrl,
} from '../locations/map';

describe('location map adapters', () => {
  it('returns stored pins only when both coordinates are valid', () => {
    expect(locationPoint({ lat: 52.5, lng: 13.4 })).toEqual({ lat: 52.5, lng: 13.4 });
    expect(locationPoint({ lat: undefined, lng: undefined })).toBeNull();
    expect(locationPoint({ lat: Number.NaN, lng: 0 })).toBeNull();
    expect(locationPoint({ lat: 999, lng: 0 })).toBeNull();
  });

  it('builds a keyless OpenStreetMap embed around the pin', () => {
    const url = osmEmbedUrl({ lat: 52.52, lng: 13.405 });
    expect(url).toContain('https://www.openstreetmap.org/export/embed.html');
    expect(url).toContain('marker=52.520000,13.405000');
    expect(url).toContain('bbox=');
  });

  it('prefers the address over the name for geocode queries', () => {
    expect(locationQuery({ name: 'Arena', address: 'Main St 1, Berlin' })).toBe('Main St 1, Berlin');
    expect(locationQuery({ name: 'Arena', address: '   ' })).toBe('Arena');
    expect(locationQuery({ name: '', address: undefined })).toBe('');
  });

  it('links out with a pin when known and as text search otherwise', () => {
    const pinned = { name: 'X', lat: 48.85, lng: 2.35 };
    expect(locationMapLinkUrl(pinned)).toContain('query=48.850000,2.350000');
    expect(locationOsmLinkUrl(pinned)).toContain('mlat=48.850000');
    const unpinned = { name: 'Brandenburg Gate' };
    expect(locationMapLinkUrl(unpinned)).toContain('query=Brandenburg%20Gate');
    expect(locationOsmLinkUrl(unpinned)).toContain('search?query=Brandenburg%20Gate');
  });

  it('resolves geocode failures softly without throwing', async () => {
    await expect(geocodeLocation('')).resolves.toEqual({ status: 'not_found' });
    const result = await geocodeLocation('definitely not a place xyzzy', );
    expect(['not_found', 'unavailable']).toContain(result.status);
  });
});
