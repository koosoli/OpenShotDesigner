/**
 * Autosave and recovery.
 *
 * This app keeps everything in one browser. There is no server copy and no
 * sync, so persistence is not a convenience here — it is the only thing
 * standing between a user and losing a day's work. That makes these the
 * highest-consequence tests in the repo even though they assert very little.
 *
 * Two properties, both about what survives a reload:
 *
 *  - what the user did is still there when they come back;
 *  - storage that has gone bad does not take the app down with it. A project
 *    that cannot be read is a bad day; a project that cannot be read AND
 *    prevents the app from starting is an unrecoverable one, because the user
 *    cannot reach the export button to rescue anything else.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import { mountProvider, resetStorage, run, shotsOf, activeSetupOf } from './providerHarness';

afterEach(cleanup);

/**
 * Give the provider's debounced save time to reach storage.
 *
 * The debounce is 300ms and the write to IndexedDB is asynchronous after that,
 * so this waits comfortably past both. Timing-sensitive, but the alternative —
 * reaching into the provider to flush it — would test a private path rather
 * than the one a user's tab actually takes.
 */
const letAutosaveLand = () => new Promise((resolve) => setTimeout(resolve, 900));

describe('autosave', () => {
  /**
   * Asserted by reading IndexedDB rather than by remounting.
   *
   * A remount would be the more faithful "user reloads the tab", but this suite
   * runs each provider on a fresh module registry to keep tests isolated, and
   * fake-indexeddb keeps its data in module memory — so re-importing it empties
   * the database and the reload could never find anything. Reading the store
   * directly tests the property that actually matters, and the one a reload
   * depends on: the work reached durable storage rather than only React state.
   */
  const storedProjects = async () => {
    // Read back through the library's own API — the same call the app makes on
    // load — rather than a specific backend. Which store it lands in is an
    // implementation detail that has already changed once (localStorage with an
    // IndexedDB upgrade path); what a user cares about is that reopening finds
    // the work.
    const library = await import('../../utils/projectLibrary');
    await library.flushPendingWrites();
    return library
      .loadLibrary()
      .map((summary) => library.readProject(summary.id))
      .filter((project): project is NonNullable<typeof project> => project !== null);
  };

  it('writes the work to durable storage', async () => {
    const { result } = await mountProvider();
    let shotId = '';
    await run(() => {
      shotId = result.current.addShot({ name: 'Survives a reload' });
    });

    await letAutosaveLand();

    const stored = await storedProjects();
    expect(stored.length).toBeGreaterThan(0);
    const shots = stored.flatMap((project) =>
      project.setups.flatMap((setup) => setup.shots ?? []),
    );
    const saved = shots.find((shot) => shot.id === shotId);
    expect(saved?.name).toBe('Survives a reload');
  });

  it('writes project-level collections too, not just the open setup', async () => {
    const { result } = await mountProvider();
    await run(() => {
      result.current.updateProjectMeta({
        productionCompany: 'Persisted Films',
        takes: [{ id: 'take-1', shotId: 'some-shot', takeNumber: 1 }],
      });
    });

    await letAutosaveLand();

    const stored = await storedProjects();
    const project = stored.find((candidate) => candidate.productionCompany === 'Persisted Films');
    expect(project).toBeTruthy();
    expect(project?.takes).toHaveLength(1);
  });

  /** A later edit must replace the earlier snapshot, not sit beside it. */
  it('keeps the newest state rather than accumulating copies', async () => {
    const { result } = await mountProvider();
    await run(() => {
      result.current.updateProjectMeta({ productionCompany: 'First' });
    });
    await letAutosaveLand();
    await run(() => {
      result.current.updateProjectMeta({ productionCompany: 'Second' });
    });
    await letAutosaveLand();

    const stored = await storedProjects();
    expect(stored.some((project) => project.productionCompany === 'Second')).toBe(true);
    expect(stored.some((project) => project.productionCompany === 'First')).toBe(false);
  });
});

describe('recovery', () => {
  /**
   * Garbage in storage must not stop the app from starting. The user still
   * needs to reach the dashboard and the export button — that is the
   * difference between losing one project and losing everything.
   */
  it('starts anyway when the stored project is unreadable', async () => {
    await resetStorage();
    localStorage.setItem('floorplan-project', '{ this is not json');
    localStorage.setItem('osd:lastProjectId', 'a-project-that-does-not-exist');

    const { result } = await mountProvider({ preserveStorage: true });

    expect(result.current.project).toBeTruthy();
    expect(activeSetupOf(result.current)).toBeTruthy();
  });

  it('starts anyway when storage holds a project of the wrong shape', async () => {
    await resetStorage();
    localStorage.setItem('floorplan-project', JSON.stringify({ setups: 'not an array' }));

    const { result } = await mountProvider({ preserveStorage: true });

    expect(Array.isArray(result.current.project.setups)).toBe(true);
    expect(result.current.project.setups.length).toBeGreaterThan(0);
  });

  /**
   * A project saved by a NEWER build cannot be migrated backwards. Refusing it
   * is correct — guessing at a schema this build does not know would corrupt
   * it — but the app still has to come up.
   */
  it('starts anyway when storage holds a newer schema than this build knows', async () => {
    await resetStorage();
    localStorage.setItem(
      'floorplan-project',
      JSON.stringify({ schemaVersion: 9999, setups: [], activeSetupId: '' }),
    );

    const { result } = await mountProvider({ preserveStorage: true });
    expect(result.current.project).toBeTruthy();
  });
});
