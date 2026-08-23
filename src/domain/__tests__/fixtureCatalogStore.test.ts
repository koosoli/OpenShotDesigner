import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FixtureDbManifest } from '../fixtures/oflAdapter';
import type { FixtureProfile } from '../fixtures/types';
import type { OfflineFixtureDatabase } from '../fixtures/offlineCatalog';

/**
 * The active fixture catalog store: one module-level state holding the OFL
 * snapshot (bundled or freshly downloaded), the supplementary film table and
 * the user's own profiles, with a subscribe/notify contract the React tree
 * hangs off.
 *
 * The merge itself is covered by catalogMerge.test.ts and the OFL adapter by
 * oflAdapter.test.ts. What is untested is the store around them: that the
 * catalog is usable before the 1.2 MB snapshot has arrived, that replacing one
 * layer does not disturb the others, that subscribers are told, and above all
 * that a slow bundled load cannot land on top of a newer online snapshot that
 * overtook it.
 *
 * The state is module-level, so every test imports its own copy of the module.
 */

const profile = (id: string, manufacturer: string, model: string, powerWatts?: number): FixtureProfile => ({
  id,
  category: 'lighting',
  manufacturer,
  model,
  categories: [],
  modes: [],
  ...(powerWatts !== undefined ? { powerWatts } : {}),
  source: { provider: id.split(':')[0], sourceId: model },
});

const manifest = (snapshotId: string, count: number): FixtureDbManifest => ({
  provider: 'ofl',
  snapshotId,
  retrievedAt: '2026-08-23T00:00:00.000Z',
  license: 'CDDL-1.0 (see OFL repo)',
  schemaAdapterVersion: 1,
  count,
});

/**
 * A fresh store whose bundled snapshot comes from `loadBundled` instead of the
 * real generated JSON, so these tests neither pull in a megabyte of fixtures
 * nor depend on what happens to be in the shipped snapshot this week.
 */
const freshStore = async (loadBundled: () => Promise<OfflineFixtureDatabase>) => {
  vi.resetModules();
  const actual = await vi.importActual<typeof import('../fixtures/offlineCatalog')>(
    '../fixtures/offlineCatalog',
  );
  vi.doMock('../fixtures/offlineCatalog', () => ({
    ...actual,
    loadOfflineFixtureDb: loadBundled,
  }));
  return import('../fixtures/catalogStore');
};

/** A store whose bundled snapshot never arrives unless a test asks for it. */
const neverLoads = () => new Promise<OfflineFixtureDatabase>(() => undefined);

afterEach(() => {
  vi.doUnmock('../fixtures/offlineCatalog');
  vi.resetModules();
});

describe('before any snapshot has loaded', () => {
  it('serves the curated film table rather than an empty catalog', async () => {
    // The bundled snapshot is a dynamic import and can take a moment. A user
    // who opens the fixture picker in that window must see a smaller catalog,
    // never a broken one.
    const { getFixtureCatalog } = await freshStore(neverLoads);
    const { CURATED_FILM_FIXTURES } = await import('../fixtures/curatedFilmFixtures');
    const state = getFixtureCatalog();

    expect(state.oflSource).toBe('pending');
    expect(state.counts.ofl).toBe(0);
    expect(state.counts.curated).toBe(CURATED_FILM_FIXTURES.length);
    expect(state.profiles.length).toBeGreaterThan(0);
  });

  it('advertises the pending manifest as explicitly empty instead of faking one', async () => {
    // Anything showing provenance ("OFL snapshot 2026-05, 4 812 fixtures")
    // would otherwise print numbers for a database that is not loaded.
    const { getFixtureCatalog } = await freshStore(neverLoads);
    expect(getFixtureCatalog().manifest).toMatchObject({ snapshotId: 'pending', count: 0 });
  });
});

describe('replacing a layer of the catalog', () => {
  it('swaps the OFL layer and leaves the curated and custom layers alone', async () => {
    const store = await freshStore(neverLoads);
    store.setCustomFixtureProfiles([profile('manual:acme/blaster', 'Acme', 'Blaster', 50)]);
    const curatedCount = store.getFixtureCatalog().counts.curated;

    store.setOflSnapshot([profile('ofl:arri/skypanel-s60c', 'ARRI', 'SkyPanel S60-C', 420)], manifest('2026-05', 1), 'online');

    const state = store.getFixtureCatalog();
    expect(state.oflSource).toBe('online');
    expect(state.manifest.snapshotId).toBe('2026-05');
    expect(state.counts).toEqual({ ofl: 1, curated: curatedCount, custom: 1 });
    expect(store.findFixtureProfile('manual:acme/blaster')).toBeDefined();
  });

  it('replaces the custom profiles rather than accumulating them', async () => {
    // This is called after every local save and delete. If it appended, a
    // deleted custom profile would stay in the picker until reload.
    const store = await freshStore(neverLoads);
    store.setCustomFixtureProfiles([
      profile('manual:acme/one', 'Acme', 'One'),
      profile('manual:acme/two', 'Acme', 'Two'),
    ]);
    expect(store.getFixtureCatalog().counts.custom).toBe(2);

    store.setCustomFixtureProfiles([profile('manual:acme/one', 'Acme', 'One')]);

    expect(store.getFixtureCatalog().counts.custom).toBe(1);
    expect(store.findFixtureProfile('manual:acme/two')).toBeUndefined();
  });

  it('lets an OFL entry win over a custom profile for the same fixture', async () => {
    // The merge rule, seen through the store: a user's hand-entered SkyPanel
    // gives way to the real OFL definition once the snapshot arrives.
    const store = await freshStore(neverLoads);
    store.setCustomFixtureProfiles([profile('manual:arri/skypanel-s60-c', 'arri', 'skypanel s60 c', 999)]);
    store.setOflSnapshot([profile('ofl:arri/skypanel-s60c', 'ARRI', 'SkyPanel S60C', 420)], manifest('2026-05', 1), 'bundled');

    const { fixtureIdentityKey } = await import('../fixtures/catalogMerge');
    const skypanels = store
      .getFixtureCatalog()
      .profiles.filter((entry) => fixtureIdentityKey(entry) === 'arri/skypanels60c');
    expect(skypanels).toHaveLength(1);
    expect(skypanels[0].powerWatts).toBe(420);
  });
});

describe('subscribers', () => {
  it('is told about every catalog change, and hands back a fresh state object', async () => {
    // Components read through useSyncExternalStore, which compares the
    // returned state by identity. Mutating the old object in place would
    // notify without re-rendering.
    const store = await freshStore(neverLoads);
    const seen: number[] = [];
    const unsubscribe = store.subscribeFixtureCatalog(() => seen.push(store.getFixtureCatalog().counts.custom));
    const before = store.getFixtureCatalog();

    store.setCustomFixtureProfiles([profile('manual:acme/one', 'Acme', 'One')]);
    store.setOflSnapshot([profile('ofl:x/y', 'X', 'Y')], manifest('s', 1), 'online');

    expect(seen).toEqual([1, 1]);
    expect(store.getFixtureCatalog()).not.toBe(before);
    unsubscribe();
  });

  it('sees the new state already in place when it is called, not the old one', async () => {
    // A listener that re-reads the store must not observe the previous
    // catalog; that ordering bug shows up as a UI one change behind.
    const store = await freshStore(neverLoads);
    let observed = -1;
    store.subscribeFixtureCatalog(() => {
      observed = store.getFixtureCatalog().counts.ofl;
    });
    store.setOflSnapshot([profile('ofl:x/y', 'X', 'Y'), profile('ofl:x/z', 'X', 'Z')], manifest('s', 2), 'online');
    expect(observed).toBe(2);
  });

  it('stops notifying once unsubscribed', async () => {
    const store = await freshStore(neverLoads);
    let calls = 0;
    const unsubscribe = store.subscribeFixtureCatalog(() => {
      calls += 1;
    });
    store.setCustomFixtureProfiles([profile('manual:acme/one', 'Acme', 'One')]);
    unsubscribe();
    store.setCustomFixtureProfiles([]);
    expect(calls).toBe(1);
  });
});

describe('ensureBundledFixtureSnapshot', () => {
  it('loads the bundled snapshot into the catalog once', async () => {
    const load = vi.fn(async () => ({
      manifest: manifest('bundled-2026-05', 1),
      fixtures: [profile('ofl:arri/skypanel-s60c', 'ARRI', 'SkyPanel S60C', 420)],
    }));
    const store = await freshStore(load);

    await store.ensureBundledFixtureSnapshot();
    expect(store.getFixtureCatalog()).toMatchObject({
      oflSource: 'bundled',
      counts: expect.objectContaining({ ofl: 1 }),
    });

    // Called from several mount points; the second call must be a no-op.
    await store.ensureBundledFixtureSnapshot();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('never downgrades an online snapshot that won the race', async () => {
    // The refresh and the bundled load start together. If the bundled load
    // finishes second and writes anyway, the user's just-downloaded catalog is
    // silently replaced by the older shipped one.
    let resolveBundled: (database: OfflineFixtureDatabase) => void = () => undefined;
    const load = vi.fn(
      () =>
        new Promise<OfflineFixtureDatabase>((resolve) => {
          resolveBundled = resolve;
        }),
    );
    const store = await freshStore(load);

    const pending = store.ensureBundledFixtureSnapshot();
    store.setOflSnapshot([profile('ofl:new/a', 'New', 'A'), profile('ofl:new/b', 'New', 'B')], manifest('online-2026-08', 2), 'online');

    resolveBundled({ manifest: manifest('bundled-2026-05', 1), fixtures: [profile('ofl:old/a', 'Old', 'A')] });
    await pending;

    const state = store.getFixtureCatalog();
    expect(state.oflSource).toBe('online');
    expect(state.manifest.snapshotId).toBe('online-2026-08');
    expect(state.counts.ofl).toBe(2);
  });

  it('keeps the curated catalog working when the snapshot fails to load', async () => {
    // The fixture database is optional data. A failed dynamic import (offline,
    // a cache miss on a stale service worker) must not take the app down.
    const load = vi.fn(() => Promise.reject(new Error('chunk load failed')));
    const store = await freshStore(load);

    await expect(store.ensureBundledFixtureSnapshot()).resolves.toBeUndefined();

    const state = store.getFixtureCatalog();
    expect(state.oflSource).toBe('pending');
    expect(state.profiles.length).toBeGreaterThan(0);

    // Still pending means a later attempt is allowed to try again.
    await store.ensureBundledFixtureSnapshot();
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe('findFixtureProfile', () => {
  it('looks up whichever layer the profile came from', async () => {
    const store = await freshStore(neverLoads);
    store.setOflSnapshot([profile('ofl:arri/skypanel-s60c', 'ARRI', 'SkyPanel S60C', 420)], manifest('s', 1), 'online');
    store.setCustomFixtureProfiles([profile('manual:acme/blaster', 'Acme', 'Blaster', 50)]);

    expect(store.findFixtureProfile('ofl:arri/skypanel-s60c')?.powerWatts).toBe(420);
    expect(store.findFixtureProfile('manual:acme/blaster')?.powerWatts).toBe(50);
  });

  it('returns undefined for an unknown id and for no id at all', async () => {
    // Equipment rows carry an optional profile id; the undefined case is the
    // common one, not an error.
    const store = await freshStore(neverLoads);
    expect(store.findFixtureProfile('ofl:nobody/nothing')).toBeUndefined();
    expect(store.findFixtureProfile(undefined)).toBeUndefined();
  });

  it('stops finding a profile once its layer has been replaced', async () => {
    const store = await freshStore(neverLoads);
    store.setOflSnapshot([profile('ofl:old/a', 'Old', 'A')], manifest('old', 1), 'bundled');
    expect(store.findFixtureProfile('ofl:old/a')).toBeDefined();

    store.setOflSnapshot([profile('ofl:new/a', 'New', 'A')], manifest('new', 1), 'online');
    expect(store.findFixtureProfile('ofl:old/a')).toBeUndefined();
  });
});
