/**
 * Minimal IndexedDB helpers with a brand-neutral namespace (plan §3.7, §5.1).
 * Database/stores deliberately avoid baking the product name in.
 */

const DB_NAME = 'local-workspace-v1';
const DB_VERSION = 1;

export const STORE_PROJECTS = 'projects';
export const STORE_ASSETS = 'assets';
export const STORE_ASSET_META = 'asset-meta';
export const STORE_META = 'meta';

let dbPromise: Promise<IDBDatabase> | null = null;

/** An open that neither succeeds nor fails (blocked by another tab, stalled
 * private-mode storage) must not hang the app forever; callers fall back. */
const OPEN_TIMEOUT_MS = 5000;

export const isIndexedDbAvailable = (): boolean =>
  typeof indexedDB !== 'undefined';

export const openWorkspaceDb = (): Promise<IDBDatabase> => {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        fn();
      };
      const timer = window.setTimeout(
        () => finish(() => reject(new Error('Timed out opening IndexedDB'))),
        OPEN_TIMEOUT_MS,
      );
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_PROJECTS)) db.createObjectStore(STORE_PROJECTS);
        if (!db.objectStoreNames.contains(STORE_ASSETS)) db.createObjectStore(STORE_ASSETS);
        if (!db.objectStoreNames.contains(STORE_ASSET_META)) db.createObjectStore(STORE_ASSET_META);
        if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META);
      };
      request.onblocked = () => finish(() => reject(new Error('IndexedDB is blocked by another open tab')));
      request.onsuccess = () => {
        const db = request.result;
        // A timed-out/blocked open can still succeed later. The promise has
        // already rejected, so nobody owns this connection; close it or it can
        // silently block the next schema upgrade in another tab.
        if (settled) {
          db.close();
          return;
        }
        // Another tab upgrading the schema: close so it can proceed; the next
        // access re-opens at the new version.
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        finish(() => resolve(db));
      };
      request.onerror = () => finish(() => reject(request.error ?? new Error('Failed to open IndexedDB')));
    });
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
};

export const idbGet = <T>(store: string, key: string): Promise<T | undefined> =>
  openWorkspaceDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).get(key);
        req.onsuccess = () => resolve(req.result as T | undefined);
        req.onerror = () => reject(req.error);
      }),
  );

export const idbGetAllValues = <T>(store: string): Promise<T[]> =>
  openWorkspaceDb().then(
    (db) =>
      new Promise<T[]>((resolve, reject) => {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => resolve((req.result || []) as T[]);
        req.onerror = () => reject(req.error);
      }),
  );

export const idbGetAllKeys = (store: string): Promise<string[]> =>
  openWorkspaceDb().then(
    (db) =>
      new Promise<string[]>((resolve, reject) => {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).getAllKeys();
        req.onsuccess = () => resolve((req.result || []).map(String));
        req.onerror = () => reject(req.error);
      }),
  );

export const idbPut = (store: string, key: string, value: unknown): Promise<void> =>
  openWorkspaceDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );

export const idbDelete = (store: string, key: string): Promise<void> =>
  openWorkspaceDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
  );
