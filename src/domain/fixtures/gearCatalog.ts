/**
 * Brand / model options for the gear list, merging the department catalogue
 * in `utils/equipmentList` with the real-fixture database (OFL snapshot +
 * curated film table + custom profiles) — plan §17.
 *
 * The department catalogue is a list of names a gaffer types from memory; the
 * database carries the measured data (watts, weight, dimensions, DMX modes).
 * Until now the Gear tab could only offer the former, so a lighting row added
 * there had no way to reach a DMX footprint even when the exact fixture was
 * sitting in the database. These helpers let one dropdown show both, keep the
 * two sources visibly separate, and — when a database model is chosen — hand
 * back the equipment-item fields that record WHICH profile it was, not merely
 * what it was called.
 *
 * Only the lighting department has a fixture database behind it; every other
 * category falls through to the department names unchanged.
 */

import { fixtureModeById } from './catalog';
import { normalizeModelKey } from './brandCatalog';
import type { FixtureMode, FixtureProfile } from './types';

/** A brand offered by the dropdown, and where it came from. */
export interface GearBrandOption {
  brand: string;
  /** Present in the hand-maintained department catalogue. */
  fromDepartment: boolean;
  /** Number of database profiles filed under this manufacturer (0 = none). */
  profileCount: number;
}

/** A model offered by the dropdown. `profile` is set for database entries. */
export interface GearModelOption {
  model: string;
  profile?: FixtureProfile;
}

/**
 * Department brands first (their curated order is deliberate), then database
 * manufacturers that the department list does not already name, alphabetically.
 * A brand present in both keeps its department position and gains the count.
 */
export const mergeGearBrands = (
  departmentBrands: readonly string[],
  profiles: readonly FixtureProfile[],
): GearBrandOption[] => {
  const counts = new Map<string, { label: string; count: number }>();
  for (const profile of profiles) {
    const key = normalizeModelKey(profile.manufacturer);
    if (!key) continue;
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { label: profile.manufacturer, count: 1 });
  }

  // A department "brand" is sometimes a slash-joined pairing ("Aputure /
  // Amaran"), which no manufacturer key will ever equal. Those simply report
  // zero profiles rather than being dropped — the names still work.
  const departmentKeys = new Set(departmentBrands.map(normalizeModelKey));
  const merged: GearBrandOption[] = departmentBrands.map((brand) => ({
    brand,
    fromDepartment: true,
    profileCount: counts.get(normalizeModelKey(brand))?.count ?? 0,
  }));
  const databaseOnly = [...counts.entries()]
    .filter(([key]) => !departmentKeys.has(key))
    .map(([, entry]) => ({ brand: entry.label, fromDepartment: false, profileCount: entry.count }))
    .sort((a, b) => a.brand.localeCompare(b.brand));
  return [...merged, ...databaseOnly];
};

/**
 * Models for a brand: the department names first, then database profiles for
 * that manufacturer that no department name already covers.
 *
 * De-duplication is by normalized model key, so "SkyPanel S60-C" from the
 * department list and "SkyPanel S60-C" from OFL collapse into one option —
 * and the surviving option carries the profile, so choosing the familiar name
 * still links the technical data.
 */
export const mergeGearModels = (
  departmentModels: readonly string[],
  profiles: readonly FixtureProfile[],
  brand: string | undefined,
): GearModelOption[] => {
  const brandKey = brand ? normalizeModelKey(brand) : '';
  const forBrand = brandKey
    ? profiles.filter((profile) => normalizeModelKey(profile.manufacturer) === brandKey)
    : [];
  const byModelKey = new Map<string, FixtureProfile>();
  for (const profile of forBrand) {
    const key = normalizeModelKey(profile.model);
    if (key && !byModelKey.has(key)) byModelKey.set(key, profile);
  }

  const seen = new Set<string>();
  const out: GearModelOption[] = [];
  for (const model of departmentModels) {
    const key = normalizeModelKey(model);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ model, profile: byModelKey.get(key) });
  }
  const extras = [...byModelKey.entries()]
    .filter(([key]) => !seen.has(key))
    .map(([, profile]) => ({ model: profile.model, profile }))
    .sort((a, b) => a.model.localeCompare(b.model));
  return [...out, ...extras];
};

/** "Standard (8 ch)" — a mode named with its footprint, for dropdowns. */
export const fixtureModeLabel = (mode: FixtureMode): string =>
  `${mode.name} (${mode.channelCount} ch)`;

/**
 * The technical one-liner written into an item's specs, so the gear manifest,
 * CSV export and print views carry the database facts without having to learn
 * about profiles. Unknown values are omitted rather than printed as zero.
 */
export const fixtureSpecsLine = (profile: FixtureProfile, modeId?: string): string => {
  const parts: string[] = [];
  if (profile.colorTemperatureK?.min !== undefined) {
    const { min, max } = profile.colorTemperatureK;
    parts.push(max !== undefined && max !== min ? `${min}–${max}K` : `${min}K`);
  }
  if (profile.powerWatts !== undefined) parts.push(`${profile.powerWatts} W`);
  if (profile.weightKg !== undefined) parts.push(`${profile.weightKg} kg`);
  const mode = fixtureModeById(profile, modeId ?? profile.modes[0]?.id);
  if (mode) parts.push(`DMX ${fixtureModeLabel(mode)}`);
  else if (profile.modes.length === 0) parts.push('No DMX modes listed');
  return parts.join(' · ');
};

/** Equipment-item fields a database profile drives. */
export interface GearProfileUpdates {
  brand: string;
  model: string;
  fixtureProfileId: string;
  fixtureModeId: string | undefined;
  specs: string;
}

/**
 * The item updates that link a database profile (and optional DMX mode) to a
 * gear row. The profile ID is the fact; brand, model and specs are its
 * description — writing all four keeps the row readable in exports while
 * letting logistics, power and rigging match on the id.
 */
export const gearProfileUpdates = (profile: FixtureProfile, modeId?: string): GearProfileUpdates => {
  const mode = fixtureModeById(profile, modeId ?? profile.modes[0]?.id);
  return {
    brand: profile.manufacturer,
    model: profile.model,
    fixtureProfileId: profile.id,
    fixtureModeId: mode?.id,
    specs: fixtureSpecsLine(profile, mode?.id),
  };
};
