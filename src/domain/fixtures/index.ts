export type {
  FixtureChannelDefinition,
  FixtureMode,
  FixtureProfile,
  FixtureProfileSource,
} from './types';
export type {
  OflChannelDefinition,
  OflChannelSlot,
  OflFixtureJson,
  OflMeta,
  OflMode,
  OflPhysical,
} from './oflTypes';
export {
  FIXTURE_DB_SCHEMA_ADAPTER_VERSION,
  adaptOflFixture,
  createFixtureDbManifest,
} from './oflAdapter';
export type { FixtureDbManifest, OflProvenance } from './oflAdapter';
export { fixtureBoundingVolumeLitres, fixtureModeById, searchFixtureProfiles } from './catalog';
export { OFFLINE_FIXTURE_DB_MANIFEST, OFFLINE_FIXTURE_PROFILES } from './offlineCatalog';
export {
  findProfileForModel,
  fixtureProfileLinkUpdates,
  fixtureProfileSummary,
  listBrandOptions,
  normalizeModelKey,
  profilesForBrand,
} from './brandCatalog';
export type { BrandOption, BrandPreset, FixtureProfileLinkUpdates } from './brandCatalog';
export { fixtureIdentityKey, mergeFixtureProfiles } from './catalogMerge';
export { CURATED_FILM_FIXTURES } from './curatedFilmFixtures';
export type { MergeReport } from './catalogMerge';
export {
  findFixtureProfile,
  getFixtureCatalog,
  setCustomFixtureProfiles,
  setOflSnapshot,
  subscribeFixtureCatalog,
} from './catalogStore';
export type { FixtureCatalogState } from './catalogStore';
export { OFL_EXPORT_URL, readOflExport } from './oflZip';
export { OFL_ATTRIBUTION, fetchOflFixtures, fetchOflManufacturers, fetchOflTree, toOflDump } from './oflGithubSource';
export type { OflTree, OflTreeEntry } from './oflGithubSource';
export { adaptOflDump, loadStoredOflSnapshot, refreshOflSnapshotOnline } from './onlineRefresh';
export type { RefreshOptions, RefreshResult } from './onlineRefresh';

/** Backwards-compatible name: looks up the ACTIVE catalog (bundled/online OFL + curated + custom). */
export { findFixtureProfile as fixtureProfileById } from './catalogStore';
