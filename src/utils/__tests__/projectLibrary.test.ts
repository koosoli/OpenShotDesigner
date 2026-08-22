import { beforeEach, describe, expect, it } from 'vitest';
import { CURRENT_PROJECT_SCHEMA_VERSION } from '../../domain/migrations';
import {
  createProject,
  getUnreadableProject,
  listUnreadableProjects,
  loadLibrary,
  readProject,
  removeProject,
  summarize,
  writeProject,
} from '../projectLibrary';

/**
 * The storage facade is the floor under every project in the app, and it had no
 * tests. These cover the read/write/summarize contract, and pin two behaviours
 * that were previously wrong: a project that fails to migrate must not look
 * like a project that does not exist, and it must never be stamped as current.
 */

const project = (over: Partial<ReturnType<typeof createProject>> = {}) => ({
  ...createProject({ title: 'Test production' }),
  ...over,
});

beforeEach(() => {
  for (const summary of loadLibrary()) removeProject(summary.id);
});

describe('summarize', () => {
  it('counts setups and shots, and reports whether there is a script', () => {
    const withSamples = createProject({ title: 'Sample', withSampleScenes: true });
    const summary = summarize(withSamples);
    expect(summary.title).toBe('Sample');
    expect(summary.setupCount).toBe(withSamples.setups.length);
    expect(summary.shotCount).toBe(
      withSamples.setups.reduce((total, setup) => total + setup.shots.length, 0),
    );
    expect(summary.hasScript).toBe(true);
  });

  it('falls back to a readable title', () => {
    expect(summarize(project({ title: '' })).title).toBe('Untitled project');
  });

  it('sorts a project with no updatedAt last rather than first', () => {
    expect(summarize(project({ updatedAt: undefined })).updatedAt).toBe('');
  });
});

describe('write / read round trip', () => {
  it('stores a project and reads it back', () => {
    const saved = project();
    writeProject(saved);
    expect(readProject(saved.id)?.id).toBe(saved.id);
  });

  it('stamps updatedAt on write, and honours touch:false', () => {
    const saved = project({ updatedAt: undefined });
    const summary = writeProject(saved);
    expect(summary.updatedAt).not.toBe('');

    const untouched = writeProject({ ...saved, updatedAt: '2020-01-01T00:00:00.000Z' }, { touch: false });
    expect(untouched.updatedAt).toBe('2020-01-01T00:00:00.000Z');
  });

  it('returns null for an id that was never stored', () => {
    expect(readProject('nope')).toBeNull();
  });

  it('returns null for a stored project with no setups', () => {
    const empty = { ...project(), setups: [] };
    writeProject(empty);
    expect(readProject(empty.id)).toBeNull();
  });

  it('lists projects newest first', () => {
    const older = writeProject({ ...project({ title: 'Older' }), updatedAt: '2024-01-01T00:00:00.000Z' }, { touch: false });
    const newer = writeProject({ ...project({ title: 'Newer' }), updatedAt: '2025-01-01T00:00:00.000Z' }, { touch: false });
    const ids = loadLibrary().map((entry) => entry.id);
    expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));
  });

  it('removes a project from the library', () => {
    const saved = project();
    writeProject(saved);
    removeProject(saved.id);
    expect(readProject(saved.id)).toBeNull();
    expect(loadLibrary().some((entry) => entry.id === saved.id)).toBe(false);
  });
});

describe('migration on read', () => {
  it('migrates an older project and persists the migrated form', () => {
    const old = { ...project(), schemaVersion: 15 };
    writeProject(old, { touch: false });
    const loaded = readProject(old.id);
    expect(loaded?.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    // Persisted, so a second read does not migrate again.
    expect(readProject(old.id)?.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
  });
});

describe('a project that cannot be migrated', () => {
  /** A version from the future: no migration path exists to today's schema. */
  const fromTheFuture = () => ({
    ...project({ title: 'From a newer build' }),
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION + 5,
  });

  it('is NOT silently stamped as current when written', () => {
    // Claiming a version the data does not satisfy means the next load skips
    // migration and hands malformed data straight to the app.
    const future = fromTheFuture();
    writeProject(future, { touch: false });
    const stored = loadLibrary().find((entry) => entry.id === future.id);
    expect(stored).toBeDefined();
    expect(getUnreadableProject(future.id)).toBeUndefined(); // not read yet
    expect(readProject(future.id)).toBeNull();
  });

  it('is reported with a reason instead of just vanishing', () => {
    const future = fromTheFuture();
    writeProject(future, { touch: false });
    readProject(future.id);

    const failure = getUnreadableProject(future.id);
    expect(failure).toBeDefined();
    expect(failure!.title).toBe('From a newer build');
    expect(failure!.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION + 5);
    expect(failure!.message).toMatch(/newer schema version/i);
    expect(listUnreadableProjects().map((entry) => entry.id)).toContain(future.id);
  });

  it('still appears in the library, so nothing looks deleted', () => {
    const future = fromTheFuture();
    writeProject(future, { touch: false });
    readProject(future.id);
    expect(loadLibrary().some((entry) => entry.id === future.id)).toBe(true);
  });

  it('leaves the stored data exactly as it was', () => {
    const future = fromTheFuture();
    writeProject(future, { touch: false });
    readProject(future.id);
    // A second read fails the same way rather than finding rewritten data.
    expect(readProject(future.id)).toBeNull();
    expect(getUnreadableProject(future.id)?.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION + 5);
  });

  it('clears the failure once the project becomes readable again', () => {
    const future = fromTheFuture();
    writeProject(future, { touch: false });
    readProject(future.id);
    expect(getUnreadableProject(future.id)).toBeDefined();

    writeProject({ ...future, schemaVersion: 15 }, { touch: false });
    expect(readProject(future.id)).not.toBeNull();
    expect(getUnreadableProject(future.id)).toBeUndefined();
  });
});
