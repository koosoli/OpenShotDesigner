/**
 * Which store a save lands in, when the answer is still being decided.
 *
 * `initProjectLibrary` picks IndexedDB when it is available and imports the
 * old localStorage library exactly once, guarded by an `lsImportedV1` flag.
 * That makes a save issued while the decision is in flight dangerous in a
 * specific way: it lands in localStorage, and once the one-time import has
 * already run, nothing ever reads it again. The work is on disk and invisible,
 * which is worse than a save that fails loudly.
 *
 * `main.tsx` renders inside init's `.finally()`, so production never opens that
 * window. These tests exist so it stays closed as a property of the library
 * rather than of the order two files happen to run in — the kind of implicit
 * sequencing that survives right up until someone adds a second entry point.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DB_NAME = 'local-workspace-v1';

const wipe = async () => {
  localStorage.clear();
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
};

/** A minimal project the library will accept and store. */
const project = (id: string, title: string) =>
  ({
    id,
    title,
    director: '',
    cinematographer: '',
    date: '2026-08-24',
    activeSetupId: 'setup-1',
    setups: [
      {
        id: 'setup-1',
        name: 'Setup',
        sceneNumber: '1',
        location: 'INT. ROOM',
        timeOfDay: 'Day INT',
        elements: [],
        shots: [],
      },
    ],
  }) as never;

beforeEach(async () => {
  vi.resetModules();
  await wipe();
});

afterEach(async () => {
  await wipe();
});

describe('project library backend', () => {
  it('sends a save issued before initialisation settles to IndexedDB', async () => {
    const library = await import('../../utils/projectLibrary');
    const { idbGetAllValues, STORE_PROJECTS } = await import('../storage/idb');

    // Deliberately not awaited: this is the race — a render that saves while
    // the backend is still being chosen.
    const initialising = library.initProjectLibrary();
    library.writeProject(project('proj-race', 'Written mid-init'));

    await initialising;
    await library.flushPendingWrites();

    const stored = await idbGetAllValues<{ id: string }>(STORE_PROJECTS);
    expect(stored.map((entry) => entry.id)).toContain('proj-race');
    // And not stranded in the store that gets imported only once.
    expect(localStorage.getItem('openshotdesigner_project_proj-race')).toBeNull();
  });

  it('sends ordinary saves after initialisation to IndexedDB', async () => {
    const library = await import('../../utils/projectLibrary');
    const { idbGetAllValues, STORE_PROJECTS } = await import('../storage/idb');

    await library.initProjectLibrary();
    library.writeProject(project('proj-normal', 'Written after init'));
    await library.flushPendingWrites();

    const stored = await idbGetAllValues<{ id: string }>(STORE_PROJECTS);
    expect(stored.map((entry) => entry.id)).toContain('proj-normal');
  });

  it('reads back what it wrote, whichever store was used', async () => {
    const library = await import('../../utils/projectLibrary');
    await library.initProjectLibrary();
    library.writeProject(project('proj-roundtrip', 'Round trip'));
    await library.flushPendingWrites();

    expect(library.readProject('proj-roundtrip')?.title).toBe('Round trip');
  });

  /**
   * A library that was never initialised keeps the localStorage default. That
   * is the historical behaviour and the reason deferring writes is safe to
   * add: a caller that does not opt in is not left with saves queued behind a
   * promise that will never resolve.
   */
  it('still saves when nobody initialises the library', async () => {
    const library = await import('../../utils/projectLibrary');
    library.writeProject(project('proj-uninit', 'No init'));

    expect(library.readProject('proj-uninit')?.title).toBe('No init');
    expect(localStorage.getItem('openshotdesigner_project_proj-uninit')).toBeTruthy();
  });

  it('initialises once however many callers ask', async () => {
    const library = await import('../../utils/projectLibrary');
    await Promise.all([
      library.initProjectLibrary(),
      library.initProjectLibrary(),
      library.initProjectLibrary(),
    ]);

    library.writeProject(project('proj-once', 'Once'));
    await library.flushPendingWrites();
    expect(library.readProject('proj-once')?.title).toBe('Once');
  });
});
