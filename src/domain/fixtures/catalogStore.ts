/**
 * The active fixture catalog: bundled OFL snapshot (or a newer one fetched
 * online) merged with the supplementary film table and the user's custom
 * profiles. OFL always wins on duplicates.
 * A tiny subscribe/notify store so React components re-render when the
 * catalog changes; no React import here so domain code can read it too.
 */

import { mergeFixtureProfiles } from './catalogMerge';
import { CURATED_FILM_FIXTURES } from './curatedFilmFixtures';
import type { FixtureDbManifest } from './oflAdapter';
import { PENDING_FIXTURE_DB_MANIFEST, loadOfflineFixtureDb } from './offlineCatalog';
import type { FixtureProfile } from './types';

export interface FixtureCatalogState {
  profiles: FixtureProfile[];
  /** Manifest of the OFL snapshot currently in use (bundled or online). */
  manifest: FixtureDbManifest;
  /** Where the OFL part came from. `pending` = the bundled snapshot is still loading. */
  oflSource: 'pending' | 'bundled' | 'online';
  counts: { ofl: number; curated: number; custom: number };
}

// The bundled snapshot arrives asynchronously (see offlineCatalog). Until it
// does the catalog is the curated film table plus the user's own profiles,
// which is a smaller but entirely valid catalog — never a broken one.
let oflProfiles: readonly FixtureProfile[] = [];
let oflManifest: FixtureDbManifest = PENDING_FIXTURE_DB_MANIFEST;
let oflSource: FixtureCatalogState['oflSource'] = 'pending';
let customProfiles: readonly FixtureProfile[] = [];
let state: FixtureCatalogState = build();
const listeners = new Set<() => void>();

function build(): FixtureCatalogState {
  const { profiles } = mergeFixtureProfiles(oflProfiles, CURATED_FILM_FIXTURES, customProfiles);
  return {
    profiles,
    manifest: oflManifest,
    oflSource,
    counts: { ofl: oflProfiles.length, curated: CURATED_FILM_FIXTURES.length, custom: customProfiles.length },
  };
}

const emit = () => {
  state = build();
  listeners.forEach((listener) => listener());
};

export const getFixtureCatalog = (): FixtureCatalogState => state;

export const subscribeFixtureCatalog = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Load the bundled OFL snapshot into the catalog, once.
 *
 * Safe to call from anywhere, any number of times: concurrent calls share one
 * load, and a snapshot already replaced by a newer ONLINE one is never
 * downgraded back to the bundled copy. Failure is swallowed — the app keeps
 * working on the curated catalog rather than breaking over an optional
 * database.
 */
export const ensureBundledFixtureSnapshot = async (): Promise<void> => {
  if (oflSource !== 'pending') return;
  try {
    const database = await loadOfflineFixtureDb();
    if (oflSource !== 'pending') return; // an online refresh won the race
    setOflSnapshot(database.fixtures, database.manifest, 'bundled');
  } catch {
    // Optional data: leave the curated catalog in place.
  }
};

/** Replace the OFL part of the catalog (online refresh). */
export const setOflSnapshot = (profiles: readonly FixtureProfile[], manifest: FixtureDbManifest, source: FixtureCatalogState['oflSource']): void => {
  oflProfiles = profiles;
  oflManifest = manifest;
  oflSource = source;
  emit();
};

/** Replace the user's custom profiles (after a local save/delete). */
export const setCustomFixtureProfiles = (profiles: readonly FixtureProfile[]): void => {
  customProfiles = profiles;
  emit();
};

/** Look a profile up in the ACTIVE catalog (replaces the bundled-only lookup). */
export const findFixtureProfile = (id: string | undefined): FixtureProfile | undefined =>
  id ? state.profiles.find((profile) => profile.id === id) : undefined;
