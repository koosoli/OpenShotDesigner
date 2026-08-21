/**
 * Schema-contract test for the generated fixture-db snapshot
 * (plan §17.3). The snapshot is produced on demand by
 * `npm run fixtures:build` and is NOT fetched during tests/CI — when the
 * file is absent, these tests skip themselves.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import type { FixtureDbManifest } from '../fixtures/oflAdapter';
import type { FixtureProfile } from '../fixtures/types';

// Tests run with the repo root as working directory (npm scripts / CI).
const DB_PATH = path.resolve(process.cwd(), 'src/generated/fixture-db.json');
const INDEX_PATH = path.resolve(process.cwd(), 'src/generated/fixture-db-index.json');

interface GeneratedFixtureDb {
  manifest: FixtureDbManifest;
  fixtures: FixtureProfile[];
}

/** Recursively assert no NaN (or other non-finite) numbers survive. */
function assertNoNaN(value: unknown, where: string): void {
  if (typeof value === 'number') {
    expect(Number.isFinite(value), `non-finite number at ${where}`).toBe(true);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertNoNaN(item, `${where}[${i}]`));
    return;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      assertNoNaN(item, `${where}.${key}`);
    }
  }
}

function loadDb(): GeneratedFixtureDb | null {
  if (!existsSync(DB_PATH)) {
    console.warn(
      'fixture-db.json not generated yet — run `npm run fixtures:build`; skipping schema checks.',
    );
    return null;
  }
  return JSON.parse(readFileSync(DB_PATH, 'utf8')) as GeneratedFixtureDb;
}

describe('generated fixture-db snapshot schema contract', () => {
  it('has a complete manifest', () => {
    const db = loadDb();
    if (!db) return;
    expect(db.manifest).toBeTruthy();
    expect(db.manifest.provider).toBe('ofl');
    expect(typeof db.manifest.snapshotId).toBe('string');
    expect(db.manifest.snapshotId.length).toBeGreaterThan(0);
    expect(typeof db.manifest.retrievedAt).toBe('string');
    expect(Number.isNaN(Date.parse(db.manifest.retrievedAt))).toBe(false);
    expect(typeof db.manifest.license).toBe('string');
    expect(db.manifest.license.length).toBeGreaterThan(0);
    expect(typeof db.manifest.schemaAdapterVersion).toBe('number');
    expect(db.manifest.count).toBe(db.fixtures.length);
  });

  it('has unique fixture ids', () => {
    const db = loadDb();
    if (!db) return;
    const ids = new Set<string>();
    for (const fixture of db.fixtures) {
      expect(typeof fixture.id).toBe('string');
      expect(fixture.id.length).toBeGreaterThan(0);
      expect(ids.has(fixture.id), `duplicate fixture id: ${fixture.id}`).toBe(false);
      ids.add(fixture.id);
    }
  });

  it('has non-empty modes on every fixture', () => {
    const db = loadDb();
    if (!db) return;
    for (const fixture of db.fixtures) {
      expect(
        Array.isArray(fixture.modes) && fixture.modes.length > 0,
        `fixture ${fixture.id} has no modes`,
      ).toBe(true);
      for (const mode of fixture.modes) {
        expect(Number.isFinite(mode.channelCount)).toBe(true);
        expect(mode.channelCount).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('contains no NaN/non-finite values', () => {
    const db = loadDb();
    if (!db) return;
    assertNoNaN(db, 'db');
  });

  it('stays under the size guard or ships a slim index', () => {
    if (!existsSync(DB_PATH)) return;
    if (statSync(DB_PATH).size <= 4 * 1024 * 1024) return;
    expect(existsSync(INDEX_PATH), 'oversized snapshot missing slim index').toBe(true);
  });
});
