/**
 * Brand / model catalog that merges the hand-curated lighting presets with
 * the real-fixture database (OFL snapshot + custom profiles) — plan §17.
 *
 * Presets are quick names a gaffer types from memory; profiles carry the
 * measured data (watts, weight, dimensions, DMX modes). This module lets the
 * UI show one brand list and one model list, and — when a preset name
 * clearly matches a profile — link the technical data automatically. Matching
 * is conservative: an uncertain match returns `undefined` rather than a guess
 * (plan rule 13/28).
 */

import type { FixtureProfile } from './types';
import { fixtureModeById } from './catalog';

export interface BrandPreset {
  brand: string;
  models: string[];
}

export interface BrandOption {
  brand: string;
  /** True when the brand comes from the curated preset list. */
  preset: boolean;
  /** Number of database profiles under this manufacturer. */
  profileCount: number;
}

/** Lowercase alphanumerics only: "SkyPanel S60-C" → "skypanels60c". */
export const normalizeModelKey = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

const sameBrand = (a: string, b: string): boolean => normalizeModelKey(a) === normalizeModelKey(b);

/** Merged brand list: presets first (their order), then database-only manufacturers alphabetically. */
export const listBrandOptions = (
  presets: readonly BrandPreset[],
  profiles: readonly FixtureProfile[],
): BrandOption[] => {
  const counts = new Map<string, { label: string; count: number }>();
  for (const profile of profiles) {
    const key = normalizeModelKey(profile.manufacturer);
    if (!key) continue;
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { label: profile.manufacturer, count: 1 });
  }
  const out: BrandOption[] = presets.map((preset) => ({
    brand: preset.brand,
    preset: true,
    profileCount: counts.get(normalizeModelKey(preset.brand))?.count ?? 0,
  }));
  const presetKeys = new Set(presets.map((preset) => normalizeModelKey(preset.brand)));
  const extras = [...counts.entries()]
    .filter(([key]) => !presetKeys.has(key))
    .map(([, entry]) => ({ brand: entry.label, preset: false, profileCount: entry.count }))
    .sort((a, b) => a.brand.localeCompare(b.brand));
  return [...out, ...extras];
};

/** Database profiles for a brand, sorted by model name. */
export const profilesForBrand = (profiles: readonly FixtureProfile[], brand: string | undefined): FixtureProfile[] => {
  if (!brand) return [];
  return profiles
    .filter((profile) => sameBrand(profile.manufacturer, brand))
    .sort((a, b) => a.model.localeCompare(b.model));
};

/**
 * Find the database profile a preset model name refers to.
 * Exact normalized match wins; otherwise the profile whose normalized model
 * is a whole prefix/suffix token of the preset (or vice versa) and is the
 * longest such candidate. Ambiguous short overlaps return `undefined`.
 */
export const findProfileForModel = (
  profiles: readonly FixtureProfile[],
  brand: string | undefined,
  model: string | undefined,
): FixtureProfile | undefined => {
  if (!model) return undefined;
  const wanted = normalizeModelKey(model);
  if (wanted.length < 3) return undefined;
  const pool = brand ? profilesForBrand(profiles, brand) : [...profiles];
  const exact = pool.find((profile) => normalizeModelKey(profile.model) === wanted);
  if (exact) return exact;

  let best: { profile: FixtureProfile; overlap: number } | undefined;
  for (const profile of pool) {
    const key = normalizeModelKey(profile.model);
    if (key.length < 4) continue;
    const contained = wanted.includes(key) ? key.length : key.includes(wanted) ? wanted.length : 0;
    if (contained === 0) continue;
    // Require the shorter string to cover most of the longer one so "S60"
    // never grabs "S60-C" *and* "S360-C" at once.
    const ratio = contained / Math.max(key.length, wanted.length);
    if (ratio < 0.6) continue;
    if (!best || contained > best.overlap) best = { profile, overlap: contained };
  }
  return best?.profile;
};

/** Element fields a profile drives. Kept as a plain shape so the inspector and picker share it. */
export interface FixtureProfileLinkUpdates {
  brand: string;
  fixtureModel: string;
  fixtureProfileId: string;
  fixtureModeId: string | undefined;
  dmxModeName: string | undefined;
  dmxChannelCount: number | undefined;
}

/** The element updates that link a profile (and optional mode) to a light. */
export const fixtureProfileLinkUpdates = (profile: FixtureProfile, modeId?: string): FixtureProfileLinkUpdates => {
  const mode = fixtureModeById(profile, modeId ?? profile.modes[0]?.id);
  return {
    brand: profile.manufacturer,
    fixtureModel: profile.model,
    fixtureProfileId: profile.id,
    fixtureModeId: mode?.id,
    dmxModeName: mode?.channelCount ? mode.name : undefined,
    dmxChannelCount: mode?.channelCount || undefined,
  };
};

/** Short technical summary for list rows, e.g. "300 W · 8.5 kg · 4 modes". Unknown values are omitted, never zeroed. */
export const fixtureProfileSummary = (profile: FixtureProfile): string => {
  const parts: string[] = [];
  if (profile.powerWatts !== undefined) parts.push(`${profile.powerWatts} W`);
  if (profile.weightKg !== undefined) parts.push(`${profile.weightKg} kg`);
  if (profile.modes.length > 0) parts.push(`${profile.modes.length} mode${profile.modes.length === 1 ? '' : 's'}`);
  return parts.join(' · ');
};
