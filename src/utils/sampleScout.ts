/**
 * Example scouting reports for the bundled sample locations, so the scouting
 * section, the candidate chips on the script's location report and the scout
 * pages of the location PDF all show something on a fresh example project.
 *
 * The "photos" are small inline SVG sketches, not photographs: an example
 * should not ship somebody's real building, and inline images need no asset
 * store write (the example fill is synchronous). The PDF skips them because
 * it can only embed raster images; a real scout photo prints.
 */
import type { LocationScout, LocationScoutPhoto } from '../domain/locations';

const sketch = (title: string, body: string, sky: string): string => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">`
    + `<rect width="400" height="300" fill="${sky}"/>`
    + body
    + `<rect x="0" y="262" width="400" height="38" fill="#0f172a" opacity="0.72"/>`
    + `<text x="14" y="287" font-family="Helvetica,Arial,sans-serif" font-size="17" fill="#f8fafc">${title}</text>`
    + `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const DINER_FRONT = sketch(
  'Diner — street side, dusk',
  '<rect x="40" y="110" width="320" height="140" fill="#7c2d12"/>'
    + '<rect x="60" y="140" width="110" height="70" fill="#fde68a"/><rect x="190" y="140" width="110" height="70" fill="#fde68a"/>'
    + '<rect x="315" y="150" width="30" height="100" fill="#451a03"/>'
    + '<rect x="110" y="70" width="180" height="32" rx="6" fill="#e11d48"/><text x="200" y="93" text-anchor="middle" font-family="Helvetica" font-size="18" fill="#fff">DINER</text>'
    + '<rect x="0" y="250" width="400" height="12" fill="#334155"/>',
  '#1e3a8a',
);

const DINER_BOOTH = sketch(
  'North window booth — practical neon',
  '<rect x="0" y="0" width="400" height="300" fill="#292524"/>'
    + '<rect x="40" y="30" width="320" height="120" fill="#0c4a6e"/><rect x="60" y="50" width="120" height="16" rx="4" fill="#f472b6"/>'
    + '<rect x="60" y="170" width="280" height="22" fill="#a8a29e"/>'
    + '<rect x="40" y="160" width="40" height="100" fill="#b91c1c"/><rect x="320" y="160" width="40" height="100" fill="#b91c1c"/>',
  '#292524',
);

const STAGE_GRID = sketch(
  'Stage 2 — grid at 6 m, blackout',
  '<rect x="0" y="0" width="400" height="300" fill="#111827"/>'
    + '<g stroke="#6b7280" stroke-width="3">'
    + '<line x1="20" y1="40" x2="380" y2="40"/><line x1="20" y1="70" x2="380" y2="70"/>'
    + '<line x1="80" y1="30" x2="80" y2="80"/><line x1="200" y1="30" x2="200" y2="80"/><line x1="320" y1="30" x2="320" y2="80"/></g>'
    + '<rect x="120" y="150" width="160" height="90" fill="#374151"/><circle cx="200" cy="120" r="14" fill="#fbbf24"/>',
  '#111827',
);

export interface SampleScout {
  scout: LocationScout;
  /** Inline image refs, in the order they appear in `referenceAssetIds`. */
  photoRefs: string[];
}

/** Scout report for a bundled sample location, by its name. */
export const sampleScoutFor = (locationName: string): SampleScout | undefined => {
  if (locationName === 'Riverside Diner') {
    const photos: Record<string, LocationScoutPhoto> = {
      [DINER_FRONT]: { caption: 'Street side at dusk — unit base is round the back', takenAt: '2026-09-12T19:40:00', heading: 200 },
      [DINER_BOOTH]: { caption: 'North window booth, neon stays on', takenAt: '2026-09-12T20:05:00', heading: 0 },
    };
    return {
      photoRefs: [DINER_FRONT, DINER_BOOTH],
      scout: {
        status: 'approved',
        candidateFor: 'LIVING ROOM',
        scoutedOn: '2026-09-12',
        scoutedBy: 'Location manager',
        rating: 4,
        power: 'House 3x 32A in the kitchen; generator spot in the rear lot',
        parking: 'Rear lot for two trucks; crew cars on Riverside Promenade after 18:00',
        restrooms: 'Two on site, usable after closing',
        holding: 'Back dining room for cast; catering in the rear lot',
        access: 'Ground floor, double doors 1.6 m wide, no steps',
        sound: 'Fridge compressors must be switched off per take; light traffic after 22:00',
        light: 'North window, no direct sun; practical neon sign in shot',
        cellSignal: 'Good on all carriers; guest wifi',
        permits: 'Pavement permit for the generator, applied for',
        fee: '€1,200 per shoot night incl. one prep evening',
        photos,
      },
    };
  }
  if (locationName === 'Kreuzberg Studio, Stage 2') {
    return {
      photoRefs: [STAGE_GRID],
      scout: {
        status: 'shortlisted',
        candidateFor: 'INTERROGATION ROOM',
        scoutedOn: '2026-09-14',
        scoutedBy: 'Production designer',
        rating: 5,
        power: '400 A three-phase distro on stage, dimmer room next to the dock',
        parking: 'Studio lot, 20 spaces',
        restrooms: 'Studio facilities',
        holding: 'Green room upstairs',
        access: 'Loading dock with scissor lift',
        sound: 'Sound stage, quiet',
        light: 'Full blackout; rigging grid at 6 m',
        fee: 'Day rate incl. build day, quote pending',
        photos: { [STAGE_GRID]: { caption: 'Grid and blackout — interrogation set goes centre stage', takenAt: '2026-09-14T11:15:00' } },
      },
    };
  }
  return undefined;
};
