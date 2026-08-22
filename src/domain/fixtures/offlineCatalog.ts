import type { FixtureDbManifest } from './oflAdapter';
import type { FixtureProfile } from './types';

/**
 * The OFL snapshot shipped with the build.
 *
 * It is loaded with a DYNAMIC import on purpose. The snapshot is ~1.2 MB of
 * JSON — around 40% of the whole bundle — and a static import put all of it in
 * the entry chunk, so every first-time visitor downloaded the entire fixture
 * database before the app could paint, whether or not they ever opened the
 * fixture picker. Splitting it out is the single biggest first-load saving
 * available, and the catalog store already knows how to swap the OFL half of
 * the catalog in at runtime (that is how the online refresh works).
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
 */
export const loadOfflineFixtureDb = (): Promise<OfflineFixtureDatabase> => {
  if (!inFlight) {
    inFlight = import('../../generated/fixture-db.json')
      .then((module) => (module.default ?? module) as unknown as OfflineFixtureDatabase)
      .catch((error) => {
        inFlight = null;
        throw error;
      });
  }
  return inFlight;
};
