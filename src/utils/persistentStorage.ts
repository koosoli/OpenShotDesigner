/**
 * Ask the browser not to evict the app's data under storage pressure.
 *
 * IndexedDB and localStorage live in "best effort" storage by default: when
 * the disk runs low the browser may silently delete whole origins, starting
 * with the ones the user visits least. `navigator.storage.persist()` moves
 * this origin into the persistent bucket, where eviction needs explicit user
 * action instead. It is a request, not a guarantee — the promise resolves
 * with whether the browser granted it.
 *
 * Fire-and-forget at startup (`initProjectLibrary`): no UI, no state, and a
 * missing API (older browsers, some private modes) simply resolves false.
 */

export const requestPersistentStorage = async (): Promise<boolean> => {
  try {
    const storage = navigator.storage;
    if (!storage || typeof storage.persist !== 'function') return false;
    if (typeof storage.persisted === 'function' && (await storage.persisted())) return true;
    return await storage.persist();
  } catch {
    return false;
  }
};
