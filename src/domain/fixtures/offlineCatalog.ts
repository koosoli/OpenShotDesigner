import database from '../../generated/fixture-db.json';
import type { FixtureDbManifest } from './oflAdapter';
import type { FixtureProfile } from './types';

interface OfflineFixtureDatabase { manifest: FixtureDbManifest; fixtures: FixtureProfile[]; }
const fixtureDatabase = database as OfflineFixtureDatabase;

export const OFFLINE_FIXTURE_DB_MANIFEST = fixtureDatabase.manifest;
export const OFFLINE_FIXTURE_PROFILES: readonly FixtureProfile[] = fixtureDatabase.fixtures;
export const fixtureProfileById = (id: string | undefined): FixtureProfile | undefined =>
  id ? OFFLINE_FIXTURE_PROFILES.find((profile) => profile.id === id) : undefined;
