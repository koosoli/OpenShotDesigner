import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  geocodeLocation,
  locationMapLinkUrl,
  locationOsmLinkUrl,
  locationPoint,
  locationQuery,
  osmEmbedUrl,
  reverseGeocode,
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

  describe('geocodeLocation (network stubbed — tests never touch Nominatim)', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('short-circuits empty queries', async () => {
      await expect(geocodeLocation('')).resolves.toEqual({ status: 'not_found' });
    });

    it('maps a successful lookup to a pin', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([{ lat: '52.5', lon: '13.4', display_name: 'Berlin' }]), { status: 200 })));
      await expect(geocodeLocation('Berlin')).resolves.toEqual({ status: 'ok', point: { lat: 52.5, lng: 13.4 }, label: 'Berlin' });
    });

    it('reports not_found for empty results and unavailable for HTTP errors', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', { status: 200 })));
      await expect(geocodeLocation('xyzzy')).resolves.toEqual({ status: 'not_found' });
      vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
      const failed = await geocodeLocation('xyzzy');
      expect(failed.status).toBe('unavailable');
    });

    it('resolves softly (never throws) on network errors and timeouts', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
      const offline = await geocodeLocation('xyzzy');
      expect(offline.status).toBe('unavailable');
      const timeout = new DOMException('Timed out', 'TimeoutError');
      vi.stubGlobal('fetch', vi.fn(async () => { throw timeout; }));
      const timedOut = await geocodeLocation('xyzzy');
      expect(timedOut).toEqual({ status: 'unavailable', message: 'Lookup timed out — check your connection.' });
    });

    it('reverse-geocodes a pin into an address and fails softly', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ display_name: 'Pariser Platz, Berlin' }), { status: 200 })));
      await expect(reverseGeocode({ lat: 52.516, lng: 13.378 })).resolves.toEqual({ status: 'ok', address: 'Pariser Platz, Berlin' });
      vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
      await expect(reverseGeocode({ lat: 0, lng: 0 })).resolves.toEqual({ status: 'not_found' });
      vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
      expect((await reverseGeocode({ lat: 1, lng: 1 })).status).toBe('unavailable');
      await expect(reverseGeocode({ lat: Number.NaN, lng: 1 })).resolves.toEqual({ status: 'not_found' });
    });

    it('passes a bounded abort signal to fetch', async () => {
      const fetchMock = vi.fn(async () => new Response('[]', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      await geocodeLocation('xyzzy');
      const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
      expect(init.signal).toBeInstanceOf(AbortSignal);
    });
  });
});
