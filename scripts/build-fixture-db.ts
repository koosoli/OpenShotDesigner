/**
 * Build-time OFL fixture-db snapshot generation (plan §17.3).
 *
 * Fetches the Open Fixture Library ZIP export, adapts every entry through
 * the pure OFL adapter (`src/domain/fixtures/oflAdapter.ts`) and writes
 * `src/generated/fixture-db.json`:
 *   { manifest: FixtureDbManifest, fixtures: FixtureProfile[] }
 *
 * The same ZIP reader and adapter run in the browser for the online refresh
 * (`src/domain/fixtures/onlineRefresh.ts`), so bundled and live snapshots are
 * always shaped identically.
 *
 * This script is NOT part of the normal build or CI pipeline:
 *
 *   npm run fixtures:build          (= npx --yes tsx scripts/build-fixture-db.ts)
 *
 * Failure policy: network/parse failures are non-fatal by design — the
 * script warns and exits 0. Set FORCE_FIXTURE_DB=1 to make failures exit 1.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createFixtureDbManifest } from '../src/domain/fixtures/oflAdapter.ts';
import { OFL_EXPORT_URL, readOflExport } from '../src/domain/fixtures/oflZip.ts';
import { adaptOflDump } from '../src/domain/fixtures/onlineRefresh.ts';

const GENERATED_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/generated');
const OUTPUT_PATH = path.join(GENERATED_DIR, 'fixture-db.json');
const SIZE_GUARD_BYTES = 4 * 1024 * 1024;

async function main(): Promise<number> {
  const force = process.env.FORCE_FIXTURE_DB === '1';
  let dump: Record<string, unknown>;
  try {
    console.log(`Fetching OFL fixture library: ${OFL_EXPORT_URL}`);
    const response = await fetch(OFL_EXPORT_URL, { headers: { accept: 'application/zip' } });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    dump = await readOflExport(new Uint8Array(await response.arrayBuffer()));
  } catch (error) {
    console.warn(`OFL fetch failed: ${error instanceof Error ? error.message : String(error)}`);
    console.warn('Skipping fixture-db generation.' + (force ? '' : ' This is non-fatal; set FORCE_FIXTURE_DB=1 to hard-fail.'));
    return force ? 1 : 0;
  }

  const retrievedAt = new Date().toISOString();
  const profiles = adaptOflDump(dump, retrievedAt);
  if (profiles.length === 0) {
    console.warn('No usable OFL fixtures adapted — skipping fixture-db generation.');
    return force ? 1 : 0;
  }
  const manifest = createFixtureDbManifest(profiles, {
    snapshotId: `ofl-${retrievedAt.slice(0, 10)}`,
    retrievedAt,
    license: 'CDDL-1.0 (see OFL repo)',
  });
  const payload = JSON.stringify({ manifest, fixtures: profiles });
  await mkdir(GENERATED_DIR, { recursive: true });
  await writeFile(OUTPUT_PATH, payload, 'utf8');
  const bytes = Buffer.byteLength(payload, 'utf8');
  console.log(`Wrote ${OUTPUT_PATH}: ${profiles.length} fixtures, ${(bytes / 1024).toFixed(0)} KiB`);
  if (bytes > SIZE_GUARD_BYTES) {
    console.warn(`Output exceeds ${SIZE_GUARD_BYTES} bytes — consider lazy-loading per manufacturer.`);
  }
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error('Unexpected fixture-db build error:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
