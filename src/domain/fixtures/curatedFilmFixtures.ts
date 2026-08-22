/**
 * Supplementary film / TV lighting profiles (plan §17).
 *
 * Open Fixture Library is strongest on stage and DJ gear; several units a
 * gaffer reaches for on a film set are missing from it. This table fills those
 * gaps so brand/model pickers, power planning and rigging have something to
 * work with.
 *
 * PROVENANCE — READ THIS: these figures were written from an assistant's
 * recollection of published manufacturer specifications on 2026-08-22, NOT
 * transcribed from fetched datasheets. They are planning figures only and
 * some may be wrong or refer to a different hardware revision. Every profile
 * carries that warning in `source.license`, and the UI shows it. Verify
 * against the unit's label before load or rigging calculations.
 * `docs/draft-curated-film-fixtures.md` tracks what still needs checking.
 *
 * Rule 13/28 still applies: a field exists only when a figure is known, and
 * power is never inferred from a model name. Models OFL already carries are
 * deliberately absent — and if OFL later publishes one of these, the OFL entry
 * replaces it automatically (`catalogMerge.ts`).
 */

import type { FixtureMode, FixtureProfile } from './types';

const CURATED_RETRIEVED_AT = '2026-08-22';
const CURATED_LICENSE = 'Unverified planning figures from manufacturer specs — verify on the unit before load calculations';

interface CuratedSpec {
  manufacturer: string;
  model: string;
  categories: string[];
  powerWatts?: number;
  weightKg?: number;
  /** [height, width, depth] in mm, datasheet order. */
  dimensionsMm?: [number, number, number];
  modes?: Array<[string, number]>;
  colorTemperatureK?: { min?: number; max?: number };
  beamAngleDeg?: [number, number];
}

const mode = ([name, channelCount]: [string, number]): FixtureMode => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  name,
  channelCount,
});

const SPECS: CuratedSpec[] = [
  // --- Aputure ---------------------------------------------------------------
  { manufacturer: 'Aputure', model: 'LS 600c Pro', categories: ['Film light', 'LED', 'RGBWW'], powerWatts: 720, weightKg: 6.2, colorTemperatureK: { min: 2300, max: 10000 }, modes: [['CCT 8-bit', 4], ['HSI', 5], ['RGBWW', 7], ['Effects', 8]] },
  { manufacturer: 'Aputure', model: 'LS 300d II', categories: ['Film light', 'LED', 'Daylight'], powerWatts: 350, weightKg: 3.7, colorTemperatureK: { min: 5500, max: 5500 }, modes: [['8-bit', 1], ['16-bit', 2]] },
  { manufacturer: 'Aputure', model: 'Nova P600c', categories: ['Film light', 'LED panel', 'RGBWW'], powerWatts: 720, weightKg: 11.3, colorTemperatureK: { min: 2000, max: 10000 }, modes: [['CCT', 4], ['HSI', 5], ['RGBWW', 7], ['Effects', 8]] },
  { manufacturer: 'Aputure', model: 'Electro Storm CS15', categories: ['Film light', 'LED', 'RGBWW'], powerWatts: 1800, weightKg: 17.8, colorTemperatureK: { min: 2500, max: 10000 } },
  { manufacturer: 'Aputure', model: 'Electro Storm XT26', categories: ['Film light', 'LED', 'Bi-color'], powerWatts: 2600, weightKg: 19.4, colorTemperatureK: { min: 2500, max: 10000 } },
  { manufacturer: 'Aputure', model: 'Amaran 200d', categories: ['Film light', 'LED', 'Daylight'], powerWatts: 200, weightKg: 2.1, colorTemperatureK: { min: 5600, max: 5600 } },
  { manufacturer: 'Aputure', model: 'Amaran 200x', categories: ['Film light', 'LED', 'Bi-color'], powerWatts: 200, weightKg: 2.1, colorTemperatureK: { min: 2700, max: 6500 } },
  // --- Nanlite ---------------------------------------------------------------
  { manufacturer: 'Nanlite', model: 'Forza 720B', categories: ['Film light', 'LED', 'Bi-color'], powerWatts: 800, weightKg: 6.0, colorTemperatureK: { min: 2700, max: 6500 }, modes: [['CCT 8-bit', 2], ['CCT 16-bit', 4]] },
  { manufacturer: 'Nanlite', model: 'Forza 500', categories: ['Film light', 'LED', 'Daylight'], powerWatts: 520, weightKg: 3.9, colorTemperatureK: { min: 5600, max: 5600 }, modes: [['8-bit', 1], ['16-bit', 2]] },
  { manufacturer: 'Nanlite', model: 'Forza 300B', categories: ['Film light', 'LED', 'Bi-color'], powerWatts: 350, weightKg: 3.3, colorTemperatureK: { min: 2700, max: 6500 }, modes: [['CCT 8-bit', 2], ['CCT 16-bit', 4]] },
  { manufacturer: 'Nanlite', model: 'Forza 60', categories: ['Film light', 'LED', 'Daylight'], powerWatts: 72, weightKg: 0.9, colorTemperatureK: { min: 5600, max: 5600 } },
  { manufacturer: 'Nanlite', model: 'PavoTube II 30X', categories: ['Film light', 'LED tube', 'RGBWW'], powerWatts: 58, weightKg: 1.2, dimensionsMm: [1196, 50, 50], colorTemperatureK: { min: 2700, max: 12000 }, modes: [['CCT', 3], ['HSI', 5], ['RGBWW', 7]] },
  { manufacturer: 'Nanlite', model: 'PavoTube II 15X', categories: ['Film light', 'LED tube', 'RGBWW'], powerWatts: 32, weightKg: 0.7, dimensionsMm: [616, 50, 50], colorTemperatureK: { min: 2700, max: 12000 }, modes: [['CCT', 3], ['HSI', 5], ['RGBWW', 7]] },
  { manufacturer: 'Nanlite', model: 'Compac 200', categories: ['Film light', 'LED panel', 'Daylight'], powerWatts: 200, weightKg: 5.5, colorTemperatureK: { min: 5600, max: 5600 } },
  // --- Creamsource -----------------------------------------------------------
  { manufacturer: 'Creamsource', model: 'Vortex8', categories: ['Film light', 'LED panel', 'RGBW'], powerWatts: 650, weightKg: 11.8, dimensionsMm: [300, 600, 120], colorTemperatureK: { min: 2200, max: 15000 }, modes: [['CCT', 5], ['HSI', 6], ['RGBW', 8], ['Effects', 12]] },
  { manufacturer: 'Creamsource', model: 'Vortex4', categories: ['Film light', 'LED panel', 'RGBW'], powerWatts: 325, weightKg: 6.4, dimensionsMm: [300, 300, 120], colorTemperatureK: { min: 2200, max: 15000 }, modes: [['CCT', 5], ['HSI', 6], ['RGBW', 8], ['Effects', 12]] },
  { manufacturer: 'Creamsource', model: 'Micro Colour', categories: ['Film light', 'LED panel', 'RGBW'], powerWatts: 120, weightKg: 2.2, colorTemperatureK: { min: 2200, max: 15000 } },
  // --- Litepanels ------------------------------------------------------------
  { manufacturer: 'Litepanels', model: 'Gemini 2x1 Soft RGBWW', categories: ['Film light', 'LED panel', 'RGBWW'], powerWatts: 325, weightKg: 9.0, dimensionsMm: [376, 703, 107], colorTemperatureK: { min: 2700, max: 10000 }, modes: [['CCT', 5], ['HSI', 6], ['RGBW', 8]] },
  { manufacturer: 'Litepanels', model: 'Gemini 1x1 Soft RGBWW', categories: ['Film light', 'LED panel', 'RGBWW'], powerWatts: 200, weightKg: 5.2, colorTemperatureK: { min: 2700, max: 10000 }, modes: [['CCT', 5], ['HSI', 6], ['RGBW', 8]] },
  // --- Kino Flo --------------------------------------------------------------
  { manufacturer: 'Kino Flo', model: 'Diva-Lite 400', categories: ['Film light', 'Fluorescent'], powerWatts: 220, weightKg: 5.4, colorTemperatureK: { min: 3200, max: 5500 } },
  { manufacturer: 'Kino Flo', model: 'Celeb 850 LED DMX', categories: ['Film light', 'LED panel'], powerWatts: 880, weightKg: 19.0, colorTemperatureK: { min: 2500, max: 9900 } },
  { manufacturer: 'Kino Flo', model: 'Freestyle 31 LED', categories: ['Film light', 'LED panel'], powerWatts: 150, weightKg: 6.0, colorTemperatureK: { min: 2500, max: 9900 } },
  // --- ARRI ------------------------------------------------------------------
  { manufacturer: 'ARRI', model: 'Orbiter', categories: ['Film light', 'LED', 'RGBACL'], powerWatts: 500, weightKg: 10.5, colorTemperatureK: { min: 2000, max: 20000 }, modes: [['CCT', 6], ['HSI', 7], ['RGBW', 8]] },
  { manufacturer: 'ARRI', model: 'M18', categories: ['Film light', 'HMI', 'Daylight'], powerWatts: 1800, weightKg: 8.8, colorTemperatureK: { min: 6000, max: 6000 }, beamAngleDeg: [20, 60] },
  { manufacturer: 'ARRI', model: 'M40', categories: ['Film light', 'HMI', 'Daylight'], powerWatts: 4000, weightKg: 18.3, colorTemperatureK: { min: 6000, max: 6000 }, beamAngleDeg: [18, 52] },
  { manufacturer: 'ARRI', model: 'M8', categories: ['Film light', 'HMI', 'Daylight'], powerWatts: 800, weightKg: 6.9, colorTemperatureK: { min: 6000, max: 6000 }, beamAngleDeg: [18, 55] },
  { manufacturer: 'ARRI', model: '300 Plus', categories: ['Film light', 'Tungsten fresnel'], powerWatts: 300, weightKg: 2.7, colorTemperatureK: { min: 3200, max: 3200 }, beamAngleDeg: [11, 54] },
  { manufacturer: 'ARRI', model: '650 Plus', categories: ['Film light', 'Tungsten fresnel'], powerWatts: 650, weightKg: 3.7, colorTemperatureK: { min: 3200, max: 3200 }, beamAngleDeg: [11, 53] },
  { manufacturer: 'ARRI', model: '1000 Plus', categories: ['Film light', 'Tungsten fresnel'], powerWatts: 1000, weightKg: 6.4, colorTemperatureK: { min: 3200, max: 3200 }, beamAngleDeg: [11, 51] },
  { manufacturer: 'ARRI', model: 'T2', categories: ['Film light', 'Tungsten fresnel'], powerWatts: 2000, weightKg: 8.5, colorTemperatureK: { min: 3200, max: 3200 }, beamAngleDeg: [12, 52] },
  { manufacturer: 'ARRI', model: 'T5', categories: ['Film light', 'Tungsten fresnel'], powerWatts: 5000, weightKg: 17.5, colorTemperatureK: { min: 3200, max: 3200 }, beamAngleDeg: [11, 52] },
  // --- Mole-Richardson --------------------------------------------------------
  { manufacturer: 'Mole-Richardson', model: '1K Baby Solarspot', categories: ['Film light', 'Tungsten fresnel'], powerWatts: 1000, weightKg: 6.8, colorTemperatureK: { min: 3200, max: 3200 } },
  { manufacturer: 'Mole-Richardson', model: '2K Junior Solarspot', categories: ['Film light', 'Tungsten fresnel'], powerWatts: 2000, weightKg: 11.3, colorTemperatureK: { min: 3200, max: 3200 } },
  { manufacturer: 'Mole-Richardson', model: '5K Senior Solarspot', categories: ['Film light', 'Tungsten fresnel'], powerWatts: 5000, weightKg: 20.4, colorTemperatureK: { min: 3200, max: 3200 } },
  { manufacturer: 'Mole-Richardson', model: '10K Tener Solarspot', categories: ['Film light', 'Tungsten fresnel'], powerWatts: 10000, weightKg: 43.1, colorTemperatureK: { min: 3200, max: 3200 } },
  { manufacturer: 'Mole-Richardson', model: '650W Tweenie Solarspot', categories: ['Film light', 'Tungsten fresnel'], powerWatts: 650, weightKg: 3.6, colorTemperatureK: { min: 3200, max: 3200 } },
  // --- ETC ---------------------------------------------------------------------
  { manufacturer: 'ETC', model: 'Source Four 750 W', categories: ['Ellipsoidal', 'Tungsten'], powerWatts: 750, weightKg: 7.3, colorTemperatureK: { min: 3250, max: 3250 } },
  // --- Godox -------------------------------------------------------------------
  { manufacturer: 'Godox', model: 'VL300', categories: ['Film light', 'LED', 'Daylight'], powerWatts: 300, weightKg: 3.4, colorTemperatureK: { min: 5600, max: 5600 } },
  { manufacturer: 'Godox', model: 'SL-60W', categories: ['Film light', 'LED', 'Daylight'], powerWatts: 60, weightKg: 1.7, colorTemperatureK: { min: 5600, max: 5600 } },
  { manufacturer: 'Godox', model: 'M600D', categories: ['Film light', 'LED', 'Daylight'], powerWatts: 740, weightKg: 6.6, colorTemperatureK: { min: 5600, max: 5600 } },
  // --- Dedolight ---------------------------------------------------------------
  { manufacturer: 'Dedolight', model: 'DLH4', categories: ['Film light', 'Tungsten'], powerWatts: 150, weightKg: 0.9, colorTemperatureK: { min: 3200, max: 3200 } },
  // --- Quasar Science ----------------------------------------------------------
  { manufacturer: 'Quasar Science', model: 'Rainbow 2 4ft', categories: ['Film light', 'LED tube', 'RGBX'], powerWatts: 100, weightKg: 1.4, dimensionsMm: [1219, 43, 43], colorTemperatureK: { min: 1000, max: 10000 }, modes: [['CCT', 4], ['HSI', 6], ['RGBX', 8], ['Pixel 8-bit', 24]] },
  { manufacturer: 'Quasar Science', model: 'Double Rainbow 4ft', categories: ['Film light', 'LED tube', 'RGBX'], powerWatts: 200, weightKg: 2.7, dimensionsMm: [1219, 76, 43], colorTemperatureK: { min: 1000, max: 10000 }, modes: [['CCT', 4], ['HSI', 6], ['RGBX', 8], ['Pixel 8-bit', 48]] },
];

const slug = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export const CURATED_FILM_FIXTURES: readonly FixtureProfile[] = SPECS.map((spec) => {
  const profile: FixtureProfile = {
    id: `curated:${slug(spec.manufacturer)}/${slug(spec.model)}`,
    category: 'lighting',
    manufacturer: spec.manufacturer,
    model: spec.model,
    categories: spec.categories,
    modes: (spec.modes ?? []).map(mode),
    source: {
      provider: 'curated',
      sourceId: 'manufacturer-spec-unverified',
      retrievedAt: CURATED_RETRIEVED_AT,
      license: CURATED_LICENSE,
    },
  };
  if (spec.powerWatts !== undefined) profile.powerWatts = spec.powerWatts;
  if (spec.weightKg !== undefined) profile.weightKg = spec.weightKg;
  if (spec.dimensionsMm) {
    profile.dimensions = { heightMm: spec.dimensionsMm[0], widthMm: spec.dimensionsMm[1], depthMm: spec.dimensionsMm[2] };
  }
  if (spec.colorTemperatureK) profile.colorTemperatureK = spec.colorTemperatureK;
  if (spec.beamAngleDeg) profile.optics = { beamAngleMinDeg: spec.beamAngleDeg[0], beamAngleMaxDeg: spec.beamAngleDeg[1] };
  return profile;
});
