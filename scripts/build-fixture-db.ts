/**
 * Build-time OFL fixture-db snapshot generation (plan §17.3).
 *
 * Fetches the Open Fixture Library single-file JSON dump, adapts every
 * entry through the pure OFL adapter (`src/domain/fixtures/oflAdapter.ts`)
 * and writes `src/generated/fixture-db.json`:
 *   { manifest: FixtureDbManifest, fixtures: FixtureProfile[] }
 *
 * This script is NOT part of the normal build or CI pipeline. Run it
 * manually / on demand:
 *
 *   npm run fixtures:build          (= npx --yes tsx scripts/build-fixture-db.ts)
 *
 * No dependencies are added; the script uses only Node built-ins plus
 * global fetch (Node >= 18). It is written in erasable-syntax-only TS so
 * it can also run via `node --experimental-strip-types`.
 *
 * Failure policy: network/parse failures are non-fatal by design — the
 * script warns and exits 0 so it can never break CI. Set
 * FORCE_FIXTURE_DB=1 to make failures exit 1 instead.
 *
 * Size guard: if the generated dump exceeds ~4 MB, a slim index
 * (id/manufacturer/model/categories) is additionally written to
 * `src/generated/fixture-db-index.json`.
 *
 * TODO(lazy-loading): once the full snapshot regularly exceeds the
 * size guard, stop shipping the full fixture array to the browser and
 * load per-manufacturer slices lazily from the slim index instead.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  adaptOflFixture,
  createFixtureDbManifest,
} from '../src/domain/fixtures/oflAdapter.ts';
import type { FixtureProfile } from '../src/domain/fixtures/types.ts';

const OFL_EXPORT_URL = 'https://open-fixture-library.org/download.ofl';

const GENERATED_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/generated',
);
const OUTPUT_PATH = path.join(GENERATED_DIR, 'fixture-db.json');
const INDEX_PATH = path.join(GENERATED_DIR, 'fixture-db-index.json');
const SIZE_GUARD_BYTES = 4 * 1024 * 1024;

interface SlimIndexEntry {
  id: string;
  manufacturer: string;
  model: string;
  categories: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function fetchZip(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { headers: { accept: 'application/zip' } });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

const u16 = (bytes: Uint8Array, at: number): number => bytes[at] | (bytes[at + 1] << 8);
const u32 = (bytes: Uint8Array, at: number): number => u16(bytes, at) | (u16(bytes, at + 2) << 16);

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Read OFL's standard ZIP export without introducing a browser dependency. */
async function readOflExport(bytes: Uint8Array): Promise<Record<string, unknown>> {
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (u32(bytes, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Invalid OFL ZIP export (missing central directory)');
  let cursor = u32(bytes, eocd + 16);
  const decoder = new TextDecoder();
  const files = new Map<string, unknown>();
  while (cursor < bytes.length && u32(bytes, cursor) === 0x02014b50) {
    const method = u16(bytes, cursor + 10);
    const compressedSize = u32(bytes, cursor + 20);
    const nameLength = u16(bytes, cursor + 28);
    const extraLength = u16(bytes, cursor + 30);
    const commentLength = u16(bytes, cursor + 32);
    const localOffset = u32(bytes, cursor + 42);
    const name = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));
    const localNameLength = u16(bytes, localOffset + 26);
    const localExtraLength = u16(bytes, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    const data = method === 0 ? compressed : method === 8 ? await inflateRaw(compressed) : undefined;
    if (data && name.endsWith('.json')) files.set(name, JSON.parse(decoder.decode(data)) as unknown);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  const manufacturers = isRecord(files.get('manufacturers.json')) ? files.get('manufacturers.json') as Record<string, unknown> : {};
  const dump: Record<string, unknown> = {};
  for (const [pathName, json] of files) {
    const parts = pathName.split('/');
    if (parts.length !== 2 || !pathName.endsWith('.json') || parts[0] === 'schemas') continue;
    const maker = parts[0];
    if (!isRecord(json)) continue;
    const makerInfo = manufacturers[maker];
    const manufacturer = isRecord(makerInfo) && typeof makerInfo.name === 'string' ? makerInfo.name : maker;
    const group = isRecord(dump[maker]) ? dump[maker] as Record<string, unknown> : (dump[maker] = {} as Record<string, unknown>) as Record<string, unknown>;
    group[parts[1].replace(/\.json$/, '')] = { ...json, manufacturer };
  }
  return dump;
}

/** Download OFL's current ZIP export and normalize it into the adapter input. */
async function fetchOflDump(): Promise<Record<string, unknown> | null> {
  try {
    console.log(`Fetching OFL fixture library: ${OFL_EXPORT_URL}`);
    return await readOflExport(await fetchZip(OFL_EXPORT_URL));
  } catch (error) {
    console.warn(`OFL fetch failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Adapt every fixture in the OFL dump. The dump nests fixtures as
 * `{ manufacturer-key: { fixture-key: fixtureJson } }`; the adapter
 * requires `manufacturer` on the fixture itself, so inject it from the
 * outer key when absent. Unusable entries are skipped with a warning.
 */
function adaptAll(dump: Record<string, unknown>, provenance: {
  snapshotId: string;
  retrievedAt: string;
  license: string;
  version: string;
}): { profiles: FixtureProfile[]; skipped: number } {
  const profiles: FixtureProfile[] = [];
  let skipped = 0;

  for (const [manufacturerKey, fixtures] of Object.entries(dump)) {
    if (manufacturerKey.startsWith('$')) continue; // e.g. $schema
    if (!isRecord(fixtures)) {
      skipped += 1;
      continue;
    }
    for (const [fixtureKey, fixtureJson] of Object.entries(fixtures)) {
      if (!isRecord(fixtureJson)) {
        skipped += 1;
        continue;
      }
      const enriched: Record<string, unknown> = {
        ...fixtureJson,
        manufacturer:
          typeof fixtureJson.manufacturer === 'string' &&
          fixtureJson.manufacturer.length > 0
            ? fixtureJson.manufacturer
            : manufacturerKey,
      };
      try {
        profiles.push(adaptOflFixture(enriched, provenance));
      } catch (error) {
        skipped += 1;
        console.warn(
          `Skipping unusable OFL fixture ${manufacturerKey}/${fixtureKey}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  return { profiles, skipped };
}

async function main(): Promise<number> {
  const force = process.env.FORCE_FIXTURE_DB === '1';
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10);

  const dump = await fetchOflDump();
  if (dump === null) {
    console.warn(
      'OFL fixture library unavailable (network failure?) — skipping fixture-db generation.' +
        (force ? '' : ' This is non-fatal; set FORCE_FIXTURE_DB=1 to hard-fail.'),
    );
    return force ? 1 : 0;
  }

  const provenance = {
    // Commit-ish is not exposed by the dump; use the retrieval date.
    version: dateStamp,
    snapshotId: `ofl-${dateStamp}`,
    retrievedAt: now.toISOString(),
    license: 'CDDL-1.0 (see OFL repo)',
  };

  const { profiles, skipped } = adaptAll(dump, provenance);
  if (profiles.length === 0) {
    console.warn('No usable OFL fixtures adapted — skipping fixture-db generation.');
    return force ? 1 : 0;
  }

  const manifest = createFixtureDbManifest(profiles, provenance);
  const payload = JSON.stringify({ manifest, fixtures: profiles });

  await mkdir(GENERATED_DIR, { recursive: true });
  await writeFile(OUTPUT_PATH, payload, 'utf8');

  const bytes = Buffer.byteLength(payload, 'utf8');
  console.log(
    `Wrote ${OUTPUT_PATH}: ${profiles.length} fixtures, ${(bytes / 1024).toFixed(0)} KiB` +
      (skipped > 0 ? ` (${skipped} entries skipped)` : ''),
  );

  if (bytes > SIZE_GUARD_BYTES) {
    // TODO(lazy-loading): see header note — switch consumers to the slim index.
    const index: SlimIndexEntry[] = profiles.map((p) => ({
      id: p.id,
      manufacturer: p.manufacturer,
      model: p.model,
      categories: p.categories,
    }));
    await writeFile(INDEX_PATH, JSON.stringify(index), 'utf8');
    console.warn(
      `Output exceeds ${SIZE_GUARD_BYTES} bytes; wrote slim index ${INDEX_PATH}.`,
    );
  }

  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(
      'Unexpected fixture-db build error:',
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  });
