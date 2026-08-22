/**
 * Online refresh of the OFL snapshot (plan §17.3 + rule 30: degrade gracefully).
 *
 * When the browser is online we fetch Open Fixture Library's current export,
 * adapt it with the same pure adapter the build uses, persist it in
 * IndexedDB and swap it into the active catalog. Offline, blocked by CORS, or
 * on any error, the bundled snapshot stays in place and the caller gets a
 * human-readable status instead of an exception.
 */

import { idbGet, idbPut, isIndexedDbAvailable, STORE_META } from '../storage/idb';
import { setOflSnapshot } from './catalogStore';
import { adaptOflFixture, createFixtureDbManifest } from './oflAdapter';
import type { FixtureDbManifest } from './oflAdapter';
import { OFL_EXPORT_URL, readOflExport } from './oflZip';
import type { FixtureProfile } from './types';

const STORED_KEY = 'fixture-db-online-v1';
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

interface StoredSnapshot {
  manifest: FixtureDbManifest;
  fixtures: FixtureProfile[];
}

export interface RefreshResult {
  status: 'updated' | 'unchanged' | 'offline' | 'blocked' | 'error';
  message: string;
  count?: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Adapt every fixture in an OFL dump; unusable entries are skipped, never guessed. */
export const adaptOflDump = (dump: Record<string, unknown>, retrievedAt: string): FixtureProfile[] => {
  const date = retrievedAt.slice(0, 10);
  const provenance = { version: date, snapshotId: `ofl-${date}`, retrievedAt, license: 'CDDL-1.0 (see OFL repo)' };
  const out: FixtureProfile[] = [];
  for (const [manufacturerKey, fixtures] of Object.entries(dump)) {
    if (manufacturerKey.startsWith('$') || !isRecord(fixtures)) continue;
    for (const fixtureJson of Object.values(fixtures)) {
      if (!isRecord(fixtureJson)) continue;
      const manufacturer = typeof fixtureJson.manufacturer === 'string' && fixtureJson.manufacturer ? fixtureJson.manufacturer : manufacturerKey;
      try {
        out.push(adaptOflFixture({ ...fixtureJson, manufacturer }, provenance));
      } catch {
        // structurally unusable entry
      }
    }
  }
  return out;
};

/** Load a previously fetched online snapshot from IndexedDB into the catalog. */
export const loadStoredOflSnapshot = async (): Promise<StoredSnapshot | null> => {
  if (!isIndexedDbAvailable()) return null;
  try {
    const stored = await idbGet<StoredSnapshot>(STORE_META, STORED_KEY);
    if (!stored || !Array.isArray(stored.fixtures) || !stored.manifest) return null;
    setOflSnapshot(stored.fixtures, stored.manifest, 'online');
    return stored;
  } catch {
    return null;
  }
};

/**
 * Fetch the newest OFL export and activate it. `force` skips the 24 h
 * staleness check. Never throws.
 */
export const refreshOflSnapshotOnline = async (options: { force?: boolean } = {}): Promise<RefreshResult> => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { status: 'offline', message: 'Offline — using the bundled fixture snapshot.' };
  }
  try {
    if (!options.force && isIndexedDbAvailable()) {
      const stored = await idbGet<StoredSnapshot>(STORE_META, STORED_KEY);
      const age = stored ? Date.now() - Date.parse(stored.manifest.retrievedAt) : Number.POSITIVE_INFINITY;
      if (stored && Number.isFinite(age) && age < STALE_AFTER_MS) {
        setOflSnapshot(stored.fixtures, stored.manifest, 'online');
        return { status: 'unchanged', message: `Fixture database is current (${stored.manifest.snapshotId}).`, count: stored.fixtures.length };
      }
    }
    const response = await fetch(OFL_EXPORT_URL, { mode: 'cors', headers: { accept: 'application/zip' }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) {
      return { status: 'error', message: `Open Fixture Library answered HTTP ${response.status}; keeping the current snapshot.` };
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const dump = await readOflExport(bytes);
    const retrievedAt = new Date().toISOString();
    const fixtures = adaptOflDump(dump, retrievedAt);
    if (fixtures.length === 0) {
      return { status: 'error', message: 'The downloaded export contained no usable fixtures; keeping the current snapshot.' };
    }
    const manifest = createFixtureDbManifest(fixtures, {
      snapshotId: `ofl-${retrievedAt.slice(0, 10)}`,
      retrievedAt,
      license: 'CDDL-1.0 (see OFL repo)',
    });
    setOflSnapshot(fixtures, manifest, 'online');
    if (isIndexedDbAvailable()) {
      await idbPut(STORE_META, STORED_KEY, { manifest, fixtures } satisfies StoredSnapshot).catch(() => undefined);
    }
    return { status: 'updated', message: `Fixture database refreshed from Open Fixture Library (${fixtures.length} fixtures).`, count: fixtures.length };
  } catch (error) {
    const name = typeof error === 'object' && error !== null && 'name' in error ? String((error as { name: unknown }).name) : '';
    if (name === 'TimeoutError') {
      return { status: 'error', message: 'Open Fixture Library did not respond in time; keeping the current snapshot.' };
    }
    // A TypeError from fetch is the browser refusing a cross-origin response.
    if (error instanceof TypeError) {
      return { status: 'blocked', message: 'The browser blocked the download (no CORS headers from open-fixture-library.org). Run `npm run fixtures:build` to refresh the bundled snapshot.' };
    }
    return { status: 'error', message: 'Could not read the Open Fixture Library export; keeping the current snapshot.' };
  }
};
