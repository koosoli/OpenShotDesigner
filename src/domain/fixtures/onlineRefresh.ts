/**
 * Online refresh of the fixture catalog (plan §17.3 + rule 30: degrade
 * gracefully). Syncs from the Open Fixture Library repository — see
 * `oflGithubSource.ts` for why the repo rather than OFL's own download URL.
 *
 * The snapshot (plus each file's git SHA) is cached in IndexedDB, so:
 *   - startup restores the last synced catalog instantly, offline included;
 *   - a refresh only downloads fixtures whose SHA changed;
 *   - any failure leaves the previous catalog in place and returns a
 *     human-readable status instead of throwing.
 */

import { idbGet, idbPut, isIndexedDbAvailable, STORE_META } from '../storage/idb';
import { setOflSnapshot } from './catalogStore';
import { adaptOflFixture, createFixtureDbManifest } from './oflAdapter';
import type { FixtureDbManifest } from './oflAdapter';
import {
  OFL_ATTRIBUTION,
  fetchOflFixtures,
  fetchOflManufacturers,
  fetchOflTree,
  toOflDump,
} from './oflGithubSource';
import type { FixtureProfile } from './types';

const STORED_KEY = 'fixture-db-online-v2';
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

interface StoredSnapshot {
  manifest: FixtureDbManifest;
  fixtures: FixtureProfile[];
  /** Repository path → git blob SHA, for incremental refreshes. */
  shas: Record<string, string>;
  /** Repository path → profile id, so unchanged files keep their adapted profile. */
  pathToId?: Record<string, string>;
}

export interface RefreshResult {
  status: 'updated' | 'unchanged' | 'offline' | 'error';
  message: string;
  count?: number;
  /** How many fixture files were downloaded in this run. */
  downloaded?: number;
}

export interface RefreshOptions {
  force?: boolean;
  onProgress?: (done: number, total: number) => void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Adapt every fixture in an OFL dump; unusable entries are skipped, never guessed. */
export const adaptOflDump = (dump: Record<string, unknown>, retrievedAt: string): FixtureProfile[] => {
  const date = retrievedAt.slice(0, 10);
  const provenance = { version: date, snapshotId: `ofl-${date}`, retrievedAt, license: OFL_ATTRIBUTION };
  const out: FixtureProfile[] = [];
  for (const [manufacturerKey, fixtures] of Object.entries(dump)) {
    if (manufacturerKey.startsWith('$') || !isRecord(fixtures)) continue;
    for (const fixtureJson of Object.values(fixtures)) {
      if (!isRecord(fixtureJson)) continue;
      const manufacturer =
        typeof fixtureJson.manufacturer === 'string' && fixtureJson.manufacturer ? fixtureJson.manufacturer : manufacturerKey;
      try {
        out.push(adaptOflFixture({ ...fixtureJson, manufacturer }, provenance));
      } catch {
        // structurally unusable entry — skipped, never guessed at
      }
    }
  }
  return out;
};

const readStored = async (): Promise<StoredSnapshot | null> => {
  if (!isIndexedDbAvailable()) return null;
  try {
    const stored = await idbGet<StoredSnapshot>(STORE_META, STORED_KEY);
    return stored && Array.isArray(stored.fixtures) && stored.manifest ? stored : null;
  } catch {
    return null;
  }
};

/** Activate the last synced snapshot (called at startup; instant and offline-safe). */
export const loadStoredOflSnapshot = async (): Promise<StoredSnapshot | null> => {
  const stored = await readStored();
  if (stored) setOflSnapshot(stored.fixtures, stored.manifest, 'online');
  return stored;
};

/**
 * Sync the newest fixture data from the Open Fixture Library repository.
 * `force` skips the 24 h staleness check. Never throws.
 */
export const refreshOflSnapshotOnline = async (options: RefreshOptions = {}): Promise<RefreshResult> => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { status: 'offline', message: 'Offline — using the stored fixture snapshot.' };
  }

  const stored = await readStored();
  if (!options.force && stored) {
    const age = Date.now() - Date.parse(stored.manifest.retrievedAt);
    if (Number.isFinite(age) && age < STALE_AFTER_MS) {
      setOflSnapshot(stored.fixtures, stored.manifest, 'online');
      return { status: 'unchanged', message: `Fixture data is current (${stored.fixtures.length} fixtures).`, count: stored.fixtures.length };
    }
  }

  try {
    const tree = await fetchOflTree();
    const previousShas = stored?.shas ?? {};
    const previousById = new Map((stored?.fixtures ?? []).map((profile) => [profile.id, profile] as const));
    const previousPathToId = stored?.pathToId ?? {};

    // Only files whose blob SHA changed (or that we have never adapted) are downloaded.
    const changed = tree.entries.filter((entry) => {
      if (previousShas[entry.path] !== entry.sha) return true;
      const id = previousPathToId[entry.path];
      return !id || !previousById.has(id);
    });

    if (changed.length === 0 && stored) {
      const manifest: FixtureDbManifest = { ...stored.manifest, retrievedAt: new Date().toISOString() };
      setOflSnapshot(stored.fixtures, manifest, 'online');
      await idbPut(STORE_META, STORED_KEY, { ...stored, manifest } satisfies StoredSnapshot).catch(() => undefined);
      return { status: 'unchanged', message: `Already up to date with the Open Fixture Library (${stored.fixtures.length} fixtures).`, count: stored.fixtures.length, downloaded: 0 };
    }

    const manufacturerNames = await fetchOflManufacturers().catch(() => ({}));
    const { fixtures: downloaded, failed } = await fetchOflFixtures(changed, { onProgress: options.onProgress });
    if (downloaded.length === 0) {
      return { status: 'error', message: 'No fixture files could be downloaded; keeping the current snapshot.' };
    }

    const retrievedAt = new Date().toISOString();
    const adaptedByPath = new Map<string, FixtureProfile>();
    for (const item of downloaded) {
      const dump = toOflDump([item], manufacturerNames);
      const [profile] = adaptOflDump(dump, retrievedAt);
      if (profile) adaptedByPath.set(item.entry.path, profile);
    }

    // Rebuild the catalog from the repository listing: unchanged files reuse
    // their stored profile, changed ones use the freshly adapted profile, and
    // files deleted upstream simply disappear.
    const profiles: FixtureProfile[] = [];
    const shas: Record<string, string> = {};
    const pathToId: Record<string, string> = {};
    for (const entry of tree.entries) {
      const fresh = adaptedByPath.get(entry.path);
      const reused = fresh ?? previousById.get(previousPathToId[entry.path] ?? '');
      if (!reused) continue;
      profiles.push(reused);
      shas[entry.path] = entry.sha;
      pathToId[entry.path] = reused.id;
    }
    if (profiles.length === 0) {
      return { status: 'error', message: 'The sync produced no usable fixtures; keeping the current snapshot.' };
    }

    const manifest = createFixtureDbManifest(profiles, {
      snapshotId: `ofl-git-${retrievedAt.slice(0, 10)}`,
      retrievedAt,
      license: OFL_ATTRIBUTION,
    });
    setOflSnapshot(profiles, manifest, 'online');
    if (isIndexedDbAvailable()) {
      await idbPut(STORE_META, STORED_KEY, { manifest, fixtures: profiles, shas, pathToId } satisfies StoredSnapshot).catch(() => undefined);
    }

    const failedNote = failed > 0 ? ` (${failed} file${failed === 1 ? '' : 's'} could not be read)` : '';
    return {
      status: 'updated',
      message: `Synced ${profiles.length} fixtures from the Open Fixture Library — ${adaptedByPath.size} new or changed${failedNote}.`,
      count: profiles.length,
      downloaded: adaptedByPath.size,
    };
  } catch (error) {
    const name = typeof error === 'object' && error !== null && 'name' in error ? String((error as { name: unknown }).name) : '';
    if (name === 'TimeoutError') {
      return { status: 'error', message: 'The fixture library did not respond in time; keeping the current snapshot.' };
    }
    if (error instanceof TypeError) {
      return { status: 'error', message: 'Could not reach the fixture library (network or browser policy); keeping the current snapshot.' };
    }
    const detail = error instanceof Error ? error.message : 'unknown error';
    return { status: 'error', message: `Fixture sync failed: ${detail}. Keeping the current snapshot.` };
  }
};
