import database from '../../generated/fixture-db.json';
import type { FixtureDbManifest } from './oflAdapter';
import type { FixtureProfile } from './types';

interface OfflineFixtureDatabase { manifest: FixtureDbManifest; fixtures: FixtureProfile[]; }
const fixtureDatabase = database as OfflineFixtureDatabase;

/** The snapshot shipped with the build. The ACTIVE catalog (bundled or online + curated + custom) lives in `catalogStore.ts`. */
export const OFFLINE_FIXTURE_DB_MANIFEST = fixtureDatabase.manifest;
export const OFFLINE_FIXTURE_PROFILES: readonly FixtureProfile[] = fixtureDatabase.fixtures;
