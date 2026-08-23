import fixtureDbUrl from '../../generated/fixture-db.json?url';
import type { FixtureDbManifest } from './oflAdapter';
import type { FixtureProfile } from './types';

/**
 * The OFL snapshot shipped with the build.
 *
 * It is fetched at runtime on purpose. The snapshot is ~1.2 MB of JSON —
 * around 40% of the whole bundle — and a static import put all of it in the
 * entry chunk, so every first-time visitor downloaded the entire fixture
 * database before the app could paint, whether or not they ever opened the
 * fixture picker. Splitting it out is the single biggest first-load saving
 * available, and the catalog store already knows how to swap the OFL half of
 * the catalog in at runtime (that is how the online refresh works).
 *
 * `?url` rather than a dynamic `import()` of the JSON: as a module the whole
 * snapshot has to be parsed as JavaScript, where as a fetched asset it goes
 * through the browser's JSON parser, which is considerably faster for a file
 * this size and does not occupy the module graph. Vite emits it as a hashed
 * static asset and rewrites the URL for the GitHub Pages base path, so nothing
 * here has to know where the app is deployed.
 *
 * The ACTIVE catalog (bundled or online + curated + custom) lives in
 * `catalogStore.ts`; nothing should read this module directly except that store
 * and tests that assert on the shipped data.
 */

export interface OfflineFixtureDatabase {
  manifest: FixtureDbManifest;
  fixtures: FixtureProfile[];
}

/** Manifest used before the snapshot has arrived: explicitly empty, not fake. */
export const PENDING_FIXTURE_DB_MANIFEST: FixtureDbManifest = {
  provider: 'ofl',
  snapshotId: 'pending',
  retrievedAt: '',
  license: 'CDDL-1.0 (see OFL repo)',
  schemaAdapterVersion: 1,
  count: 0,
};

let inFlight: Promise<OfflineFixtureDatabase> | null = null;

/**
 * Load the bundled snapshot, once. Concurrent callers share the same promise,
 * and a failed load is not cached, so a later attempt can retry.
 *
 * Under vitest there is no server to fetch from, so the module is imported
 * directly there — the tests that read the real snapshot are asserting on the
 * shipped data, not on how the browser gets hold of it.
 */
export const loadOfflineFixtureDb = (): Promise<OfflineFixtureDatabase> => {
  if (!inFlight) {
    inFlight = (
      import.meta.env?.MODE === 'test'
        ? import('../../generated/fixture-db.json').then(
            (module) => (module.default ?? module) as unknown as OfflineFixtureDatabase,
          )
        : fetch(fixtureDbUrl).then((response) => {
            if (!response.ok) {
              throw new Error(`Fixture snapshot request failed: ${response.status}`);
            }
            return response.json() as Promise<OfflineFixtureDatabase>;
          })
    ).catch((error: unknown) => {
      inFlight = null;
      throw error;
    });
  }
  return inFlight;
};
