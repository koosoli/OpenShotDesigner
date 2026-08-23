import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The failure and lifecycle paths of the IndexedDB open, which are the reason
 * the app has a localStorage fallback at all: a storage layer that never
 * settles is worse than one that fails, because the caller cannot fall back
 * from a promise that stays pending.
 *
 * Each test imports a FRESH copy of the module. `openWorkspaceDb` memoizes its
 * connection in module scope, so a shared import would let one test's outcome
 * decide the next test's.
 */

/** The subset of IDBOpenDBRequest the facade actually attaches handlers to. */
interface FakeOpenRequest {
  onupgradeneeded: (() => void) | null;
  onblocked: (() => void) | null;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  result: IDBDatabase;
  error: DOMException | null;
}

const makeFakeOpenRequest = (): FakeOpenRequest => ({
  onupgradeneeded: null,
  onblocked: null,
  onsuccess: null,
  onerror: null,
  result: {} as IDBDatabase,
  error: null,
});

/** Replace the global factory with one that hands back a request we drive. */
const stubIndexedDbOpen = (request: FakeOpenRequest) => {
  vi.stubGlobal('indexedDB', { open: () => request } as unknown as IDBFactory);
};

/** Fresh module instance, so the memoized connection promise starts empty. */
const importIdb = async () => {
  vi.resetModules();
  return import('../storage/idb');
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('an open that never settles', () => {
  it('rejects after the timeout instead of leaving callers pending forever', async () => {
    // Private-mode storage and a stalled browser process both produce an open
    // request that fires nothing at all. Without the timeout the app shell
    // would sit on a loading spinner with no way to reach the fallback.
    vi.useFakeTimers();
    const request = makeFakeOpenRequest();
    stubIndexedDbOpen(request);

    const { openWorkspaceDb } = await importIdb();
    const opening = openWorkspaceDb();
    const settled = expect(opening).rejects.toThrow(/timed out/i);

    await vi.advanceTimersByTimeAsync(5000);
    await settled;
  });

  it('lets a later attempt retry, because a failed open is not cached', async () => {
    // The user may re-enter the app, or close the tab that was in the way. A
    // permanently cached rejection would make the failure stick for the whole
    // session.
    vi.useFakeTimers();
    const first = makeFakeOpenRequest();
    stubIndexedDbOpen(first);

    const { openWorkspaceDb } = await importIdb();
    const failing = openWorkspaceDb();
    const rejected = expect(failing).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(5000);
    await rejected;

    const second = makeFakeOpenRequest();
    stubIndexedDbOpen(second);
    const retry = openWorkspaceDb();
    const db = {} as IDBDatabase;
    second.result = db;
    second.onsuccess?.();
    await expect(retry).resolves.toBe(db);
  });
});

describe('an open blocked by another tab', () => {
  it('rejects with a message naming the other tab', async () => {
    // `onblocked` means an older connection elsewhere is holding the schema.
    // The app cannot proceed, but it must say why rather than hang.
    const request = makeFakeOpenRequest();
    stubIndexedDbOpen(request);

    const { openWorkspaceDb } = await importIdb();
    const opening = openWorkspaceDb();
    const rejected = expect(opening).rejects.toThrow(/blocked by another open tab/i);
    request.onblocked?.();
    await rejected;
  });

  it('ignores a success that arrives after the request already failed', async () => {
    // A blocked open can still complete later once the other tab closes. By
    // then the caller has taken the fallback path, and resolving a settled
    // promise a second time must be a no-op rather than a state flip.
    const request = makeFakeOpenRequest();
    stubIndexedDbOpen(request);

    const { openWorkspaceDb } = await importIdb();
    const opening = openWorkspaceDb();
    const rejected = expect(opening).rejects.toThrow(/blocked/i);
    request.onblocked?.();
    request.result = {} as IDBDatabase;
    request.onsuccess?.();
    await rejected;
  });

  it('surfaces the underlying error when the open fails outright', async () => {
    const request = makeFakeOpenRequest();
    stubIndexedDbOpen(request);

    const { openWorkspaceDb } = await importIdb();
    const opening = openWorkspaceDb();
    const rejected = expect(opening).rejects.toThrow(/quota/i);
    request.error = new DOMException('Quota exceeded', 'QuotaExceededError');
    request.onerror?.();
    await rejected;
  });
});

describe('another tab upgrading the schema', () => {
  it('closes this connection so the upgrade can proceed, and re-opens next time', async () => {
    // A newer build in a second tab opens the database at a higher version.
    // If this tab held its connection open, that tab's upgrade would be
    // blocked forever and the user would see a dead app in the new tab.
    const { openWorkspaceDb, idbPut, STORE_META } = await importIdb();
    await openWorkspaceDb();
    await idbPut(STORE_META, 'lifecycle-probe', true);

    const outcome = await new Promise<string>((resolve) => {
      const request = indexedDB.open('local-workspace-v1', 2);
      request.onblocked = () => resolve('blocked');
      request.onsuccess = () => {
        request.result.close();
        resolve('upgraded');
      };
      request.onerror = () => resolve('error');
    });
    // 'blocked' here would mean the versionchange handler never closed us.
    expect(outcome).toBe('upgraded');

    // The memoized promise was dropped too, so the next access genuinely
    // re-opens rather than handing out the connection it just closed. This
    // build only knows version 1, so that re-open is refused by the newer
    // database — an honest error, not a silent write into a closed handle.
    await expect(openWorkspaceDb()).rejects.toThrow(/version/i);
  });
});
