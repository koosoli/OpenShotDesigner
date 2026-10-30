import { afterEach, describe, expect, it, vi } from 'vitest';
import { RoomCache } from '../roomCache';
import { MAX_DOCUMENT_BYTES } from '../model';

const caches: RoomCache[] = [];
afterEach(() => { caches.splice(0).forEach((cache) => cache.close()); vi.useRealTimers(); vi.restoreAllMocks(); });
const cache = (name = crypto.randomUUID(), error = vi.fn()) => {
  const result = new RoomCache(name, error); caches.push(result); return result;
};

describe('bounded room recovery cache', () => {
  it('coalesces snapshots and flushes the final edit when closed', async () => {
    const name = crypto.randomUUID(); const first = cache(name);
    expect(await first.load()).toBeNull();
    first.save(new Uint8Array([1, 2])); first.save(new Uint8Array([3, 4])); first.close();
    const second = cache(name);
    expect(await second.load()).toEqual(new Uint8Array([3, 4]));
  });

  it('rejects oversized persisted data and bounds outgoing cache writes', async () => {
    const name = crypto.randomUUID(); const error = vi.fn(); const first = cache(name, error);
    await first.load(); first.save(new Uint8Array(MAX_DOCUMENT_BYTES + 1));
    expect(error).toHaveBeenCalledTimes(1);
    first.close(); expect(await cache(name).load()).toBeNull();
  });

  it('owns synchronous IndexedDB denial instead of leaking an unhandled rejection', async () => {
    vi.spyOn(indexedDB, 'open').mockImplementation(() => { throw new DOMException('Denied', 'SecurityError'); });
    await expect(cache().load()).rejects.toThrow('Denied');
  });

  it('closes a late database opening after its deadline', async () => {
    vi.useFakeTimers();
    const db = { close: vi.fn() };
    const request = { result: db, onsuccess: null as (() => void) | null, onerror: null, onupgradeneeded: null };
    vi.spyOn(indexedDB, 'open').mockReturnValue(request as unknown as IDBOpenDBRequest);
    const loading = cache().load(); const rejected = expect(loading).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(5001); await rejected;
    request.onsuccess!(); expect(db.close).toHaveBeenCalledTimes(1);
  });

  it('ignores an opening completed after the session closed', async () => {
    const first = cache(); const loading = first.load(); first.close();
    await expect(loading).rejects.toThrow('closed');
  });

  it('reports failed transactions once and stops retrying a broken cache', async () => {
    const error = vi.fn(); const first = cache(undefined, error); await first.load();
    const transaction = vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(() => { throw new Error('Disk full'); });
    first.save(new Uint8Array([1])); first.close();
    expect(error).toHaveBeenCalledTimes(1); expect(transaction).toHaveBeenCalledTimes(1);
  });
});
