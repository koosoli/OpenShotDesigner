/**
 * Content-addressed IndexedDB asset store (plan §5.2, §5.2.1).
 *
 * Blobs are stored under a SHA-256 content hash so identical media is stored
 * once. Project state references assets by id only — never as base64.
 *
 * Blobs are persisted as explicit byte records ({ type, data }) rather than
 * raw Blob instances: Blob values do not survive every structured-clone
 * implementation (jsdom/fake-indexeddb drops them), while typed arrays clone
 * reliably everywhere.
 */

import { createId } from '../ids';
import { idbDelete, idbGet, idbPut, STORE_ASSETS, STORE_ASSET_META } from './idb';
import type { AssetMetadata, AssetRef, AssetStore } from './types';

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');

interface StoredAssetRecord {
  __assetBlob: true;
  type: string;
  data: Uint8Array;
}

export const blobToBytes = async (blob: Blob): Promise<Uint8Array> => {
  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer());
  }
  // FileReader fallback for environments without Blob.arrayBuffer (jsdom).
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'));
    reader.readAsArrayBuffer(blob);
  });
};

export const sha256Hex = async (blob: Blob): Promise<string | undefined> => {
  try {
    if (typeof crypto === 'undefined' || !crypto.subtle) return undefined;
    const digest = await crypto.subtle.digest('SHA-256', await blobToBytes(blob));
    return toHex(digest);
  } catch {
    return undefined;
  }
};

const coerceToBlob = (value: unknown): Blob | null => {
  if (!value) return null;
  const record = value as Partial<StoredAssetRecord>;
  if (record.__assetBlob && record.data) {
    return new Blob([record.data], { type: record.type || '' });
  }
  // Legacy/foreign shapes: raw typed arrays or ArrayBuffers.
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    return new Blob([value as Uint8Array | ArrayBuffer]);
  }
  return null;
};

export const createIdbAssetStore = (): AssetStore => ({
  async put(blob: Blob, metadata: Partial<AssetMetadata> = {}): Promise<AssetRef> {
    const contentHash = (await sha256Hex(blob)) ?? createId('hash');
    const id = `asset-sha256-${contentHash}`;
    const full: AssetMetadata = {
      mimeType: blob.type || 'application/octet-stream',
      byteSize: blob.size,
      contentHash,
      createdAt: new Date().toISOString(),
      ...metadata,
    };
    const record: StoredAssetRecord = {
      __assetBlob: true,
      type: full.mimeType,
      data: await blobToBytes(blob),
    };
    await idbPut(STORE_ASSETS, id, record);
    await idbPut(STORE_ASSET_META, id, full);
    return { id, metadata: full };
  },

  get(id: string): Promise<Blob | null> {
    return idbGet<unknown>(STORE_ASSETS, id).then(coerceToBlob);
  },

  getMetadata(id: string): Promise<AssetMetadata | null> {
    return idbGet<AssetMetadata>(STORE_ASSET_META, id).then((v) => v ?? null);
  },

  async delete(id: string): Promise<void> {
    await idbDelete(STORE_ASSETS, id);
    await idbDelete(STORE_ASSET_META, id);
  },
});
