import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestPersistentStorage } from '../persistentStorage';

const setStorage = (value: unknown): void => {
  Object.defineProperty(navigator, 'storage', { value, configurable: true, writable: true });
};

describe('requestPersistentStorage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error restoring the environment's own property
    delete navigator.storage;
  });

  it('asks once and passes the answer through', async () => {
    const persist = vi.fn(async () => true);
    setStorage({ persist, persisted: async () => false });
    await expect(requestPersistentStorage()).resolves.toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('skips the request when already persistent', async () => {
    const persist = vi.fn(async () => true);
    setStorage({ persist, persisted: async () => true });
    await expect(requestPersistentStorage()).resolves.toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it('resolves false instead of throwing when storage is missing', async () => {
    setStorage(undefined);
    await expect(requestPersistentStorage()).resolves.toBe(false);
  });
});
