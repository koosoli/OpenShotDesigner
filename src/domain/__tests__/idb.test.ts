import { beforeEach, describe, expect, it } from 'vitest';
import {
  idbDelete,
  idbGet,
  idbGetAllValues,
  idbPut,
  isIndexedDbAvailable,
  openWorkspaceDb,
  STORE_ASSETS,
  STORE_ASSET_META,
  STORE_META,
  STORE_PROJECTS,
} from '../storage/idb';

/**
 * Every project, every asset and every piece of workspace metadata in the app
 * is written through these four functions, and they had no tests at all. These
 * cover the contract the rest of the codebase relies on: a value survives a
 * write/read round trip unchanged, a key that was never written reads as
 * undefined rather than throwing, a second write to the same key replaces the
 * first instead of accumulating, and the four stores are genuinely separate
 * namespaces.
 *
 * The lifecycle and failure paths (open timeout, blocked open, another tab
 * upgrading the schema) live in idbLifecycle.test.ts, because they each need a
 * fresh module instance and one of them permanently bumps the database
 * version.
 */

/** A project-shaped value: structured-cloneable, nested, with an array. */
const storedProject = (id: string, title: string) => ({
  id,
  title,
  schemaVersion: 23,
  setups: [{ id: 'setup-1', name: 'Scene 1', shots: [{ id: 'shot-1', order: 1 }] }],
  updatedAt: '2026-08-23T09:00:00.000Z',
});

beforeEach(async () => {
  // Each test starts from an empty projects store; the facade has no "clear",
  // so the test deletes what it finds, exactly as the app would.
  const existing = await idbGetAllValues<{ id: string }>(STORE_PROJECTS);
  for (const project of existing) await idbDelete(STORE_PROJECTS, project.id);
});

describe('isIndexedDbAvailable', () => {
  it('reports the presence of the global the facade needs', () => {
    // The app branches on this to fall back to localStorage, so it must track
    // the actual global rather than a build-time constant.
    expect(isIndexedDbAvailable()).toBe(typeof indexedDB !== 'undefined');
  });
});

describe('openWorkspaceDb', () => {
  it('creates the four stores the app persists into', async () => {
    const db = await openWorkspaceDb();
    expect([...db.objectStoreNames].sort()).toEqual(
      [STORE_ASSETS, STORE_ASSET_META, STORE_META, STORE_PROJECTS].sort(),
    );
  });

  it('hands every caller the same connection rather than opening one per call', async () => {
    // Assets, projects and metadata all write concurrently on startup. If each
    // call opened its own connection the app would hold a fistful of them and
    // any schema upgrade would be permanently blocked.
    const [first, second] = await Promise.all([openWorkspaceDb(), openWorkspaceDb()]);
    expect(first).toBe(second);
    expect(await openWorkspaceDb()).toBe(first);
  });
});

describe('write / read round trip', () => {
  it('reads back a stored project with its nested structure intact', async () => {
    const project = storedProject('proj-round-trip', 'Night Shoot');
    await idbPut(STORE_PROJECTS, project.id, project);
    const read = await idbGet<typeof project>(STORE_PROJECTS, project.id);
    expect(read).toEqual(project);
    // Structured clone, not a shared reference: mutating the value the caller
    // handed in must not reach back into storage.
    expect(read).not.toBe(project);
  });

  it('resolves undefined for a key that was never written', async () => {
    // The library distinguishes "absent" from "unreadable", which only works
    // because a miss resolves quietly instead of rejecting.
    await expect(idbGet(STORE_PROJECTS, 'proj-never-saved')).resolves.toBeUndefined();
  });

  it('overwrites in place, so a re-save leaves exactly one record', async () => {
    const id = 'proj-overwrite';
    await idbPut(STORE_PROJECTS, id, storedProject(id, 'First title'));
    await idbPut(STORE_PROJECTS, id, storedProject(id, 'Renamed'));

    const all = await idbGetAllValues<{ id: string; title: string }>(STORE_PROJECTS);
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe('Renamed');
  });

  it('round-trips the falsy values the meta store actually holds', async () => {
    // `lsImportedV1` is a boolean flag; if `false` or `0` came back as
    // undefined the one-time localStorage import would run on every startup.
    await idbPut(STORE_META, 'flag-false', false);
    await idbPut(STORE_META, 'count-zero', 0);
    await idbPut(STORE_META, 'text-empty', '');
    expect(await idbGet<boolean>(STORE_META, 'flag-false')).toBe(false);
    expect(await idbGet<number>(STORE_META, 'count-zero')).toBe(0);
    expect(await idbGet<string>(STORE_META, 'text-empty')).toBe('');
  });

  it('round-trips binary data byte for byte', async () => {
    // Assets are persisted as typed arrays precisely because they clone
    // reliably; high bytes and zero bytes must survive untouched.
    const bytes = new Uint8Array([0, 1, 127, 128, 254, 255]);
    await idbPut(STORE_ASSETS, 'asset-bytes', { __assetBlob: true, type: 'image/png', data: bytes });
    const read = await idbGet<{ data: Uint8Array }>(STORE_ASSETS, 'asset-bytes');
    expect(Array.from(read!.data)).toEqual([0, 1, 127, 128, 254, 255]);
  });
});

describe('idbGetAllValues', () => {
  it('lists every value in a store and no keys from its neighbours', async () => {
    await idbPut(STORE_PROJECTS, 'proj-a', storedProject('proj-a', 'A'));
    await idbPut(STORE_PROJECTS, 'proj-b', storedProject('proj-b', 'B'));
    // Same key in a different store: the stores are separate namespaces, so
    // this must not leak into the project listing.
    await idbPut(STORE_ASSET_META, 'proj-a', { mimeType: 'image/png', byteSize: 3 });

    const listed = await idbGetAllValues<{ id: string }>(STORE_PROJECTS);
    expect(listed.map((project) => project.id).sort()).toEqual(['proj-a', 'proj-b']);
  });

  it('resolves an empty array for an empty store rather than undefined', async () => {
    // The library hydrates with `stored.forEach(...)`, so an empty store has to
    // come back as an array or startup throws.
    await expect(idbGetAllValues(STORE_PROJECTS)).resolves.toEqual([]);
  });
});

describe('idbDelete', () => {
  it('removes only the requested key', async () => {
    await idbPut(STORE_PROJECTS, 'proj-keep', storedProject('proj-keep', 'Keep'));
    await idbPut(STORE_PROJECTS, 'proj-drop', storedProject('proj-drop', 'Drop'));

    await idbDelete(STORE_PROJECTS, 'proj-drop');

    expect(await idbGet(STORE_PROJECTS, 'proj-drop')).toBeUndefined();
    expect(await idbGet(STORE_PROJECTS, 'proj-keep')).toBeDefined();
  });

  it('resolves rather than rejecting when the key is already gone', async () => {
    // Deleting a project deletes its assets too, and the same asset can be
    // dropped twice; a second delete must not surface as a save error.
    await expect(idbDelete(STORE_PROJECTS, 'proj-never-existed')).resolves.toBeUndefined();
  });
});

describe('transaction failures', () => {
  it('rejects instead of hanging when the store does not exist', async () => {
    // A typo in a store name used to be silently swallowed by the promise
    // wrapper; the caller must see it.
    await expect(idbGet('no-such-store', 'k')).rejects.toBeTruthy();
    await expect(idbPut('no-such-store', 'k', 1)).rejects.toBeTruthy();
  });

  it('rejects when a value cannot be structured-cloned', async () => {
    // Project state occasionally picks up a function or a DOM node by accident.
    // The write must fail loudly so the save state turns to 'error'.
    await expect(idbPut(STORE_META, 'unclonable', { fn: () => undefined })).rejects.toBeTruthy();
  });
});
