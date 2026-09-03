import { beforeEach, describe, expect, it } from 'vitest';
import { CURRENT_PROJECT_SCHEMA_VERSION } from '../../domain/migrations';
import {
  createProject,
  flushPendingWrites,
  getSaveState,
  getUnreadableProject,
  listUnreadableProjects,
  loadLibrary,
  markSavePending,
  maybeWriteBackupSnapshot,
  readBackupSnapshot,
  readProject,
  removeProject,
  restoreBackupSnapshot,
  summarize,
  ProjectWriteConflictError,
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

  it('refuses to overwrite a newer save made by another browser tab', () => {
    const saved = project({ updatedAt: '2026-01-01T10:00:00.000Z' });
    localStorage.setItem(
      `openshotdesigner_write_stamp_${saved.id}`,
      JSON.stringify({ sessionId: 'another-tab', updatedAt: '2026-01-01T10:01:00.000Z' }),
    );

    expect(() => writeProject(saved, { touch: false })).toThrow(ProjectWriteConflictError);
    expect(readProject(saved.id)).toBeNull();
    localStorage.removeItem(`openshotdesigner_write_stamp_${saved.id}`);
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

describe('save-state dirty marking', () => {
  it('moves idle to saving so the indicator never shows a stale saved state', () => {
    // NOTE: without initProjectLibrary the backend is synchronous localStorage
    // and writes never touch save-state — so this asserts the transition rule
    // itself, not a write round-trip. In production (IndexedDB) writes flip
    // idle -> saving -> saved via trackWrite; markSavePending covers the
    // debounce window in between.
    markSavePending();
    expect(getSaveState()).toBe('saving');
  });

  it('is idempotent while a save is already in flight', async () => {
    markSavePending();
    markSavePending();
    expect(getSaveState()).toBe('saving');
    await flushPendingWrites();
  });
});

describe('safety-copy backups', () => {
  it('writes and reads back a snapshot for the same project', () => {
    const saved = project({ title: 'Backup me' });
    writeProject(saved);
    maybeWriteBackupSnapshot({ ...saved, title: 'Backup me v2' });
    const backup = readBackupSnapshot(saved.id);
    expect(backup?.project.title).toBe('Backup me v2');
    expect(typeof backup?.savedAt).toBe('string');
  });

  it('restores the backup into the library', () => {
    const saved = project({ title: 'Live' });
    writeProject(saved);
    maybeWriteBackupSnapshot({ ...saved, title: 'From backup' });
    // Throttle guard uses in-memory timestamps per project id — a fresh id
    // guarantees the write above is not skipped in this test run.
    const restored = restoreBackupSnapshot(saved.id);
    expect(restored?.title).toBe('From backup');
  });

  it('returns null when no backup exists', () => {
    expect(readBackupSnapshot('no-such-project')).toBeNull();
    expect(restoreBackupSnapshot('no-such-project')).toBeNull();
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
