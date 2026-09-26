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
import { ASSET_SHA_PREFIX } from '../media/imageRef';
import { idbDelete, idbGet, idbPut, STORE_ASSETS, STORE_ASSET_META } from './idb';
import type { AssetMetadata, AssetRef, AssetStore } from './types';

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');

interface StoredAssetRecord {
  __assetBlob: true;
  type: string;
  data: Uint8Array<ArrayBuffer>;
}

export const blobToBytes = async (blob: Blob): Promise<Uint8Array<ArrayBuffer>> => {
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
  // Legacy/foreign shapes: raw typed arrays or ArrayBuffers. Views are copied
  // into fresh bytes: since @types/node 26.6 a bare view types as
  // `Uint8Array<ArrayBufferLike>`, which the DOM BlobPart type rejects, and a
  // Blob over a shared backing store would leak neighbouring data.
  if (value instanceof ArrayBuffer) {
    return new Blob([value]);
  }
  if (ArrayBuffer.isView(value)) {
    return new Blob([new Uint8Array(value.buffer as ArrayBuffer, value.byteOffset, value.byteLength)]);
  }
  return null;
};

/**
 * Read-modify-write of one asset's metadata, serialised per asset id.
 *
 * `put` and `release` both read the metadata record, work out the new owner
 * list, and write it back. `idb.ts` only offers whole-transaction get and put
 * helpers, so those two steps land in separate transactions and two parallel
 * puts of the same file — the ordinary shape of a multi-file import — each
 * read the same "before" state and the second write drops the first owner's
 * claim. Releasing that lost owner then deletes bytes somebody still displays.
 *
 * Giving `idb.ts` a transactional read-modify-write would be the tidier fix,
 * but that file is shared with the project store and out of scope here, so
 * the ordering is enforced in this module instead: every mutation of a given
 * id queues behind the previous one. The chain is module-level rather than
 * per-store so it still holds when the mood board and the headshot importer
 * each construct their own store object over the one database. It does not
 * protect against a second browser tab, which IndexedDB transactions would.
 */
const metadataWrites = new Map<string, Promise<void>>();

const withMetadataLock = <T>(id: string, work: () => Promise<T>): Promise<T> => {
  const previous = metadataWrites.get(id) ?? Promise.resolve();
  // Run after the previous mutation whether it resolved or threw: a failed
  // put must not wedge every later write to that asset.
  const result = previous.then(work, work);
  const settled = result.then(
    () => undefined,
    () => undefined,
  );
  metadataWrites.set(id, settled);
  void settled.then(() => {
    // Drop the entry once nothing is queued behind it, so importing a
    // thousand images does not leave a thousand entries alive forever.
    if (metadataWrites.get(id) === settled) metadataWrites.delete(id);
  });
  return result;
};

export const createIdbAssetStore = (): AssetStore => ({
  async put(blob: Blob, metadata: Partial<AssetMetadata> = {}, owner?: string): Promise<AssetRef> {
    const contentHash = await sha256Hex(blob);
    // Honest ids: a real hash claims `asset-sha256-…` (deduplication,
    // checksum verification); without `crypto.subtle` there is nothing to
    // claim, so the id says `asset-local-…` (random, no dedup — the same
    // bytes stored twice are two records until a hashing browser merges
    // them on re-import).
    const id = contentHash ? `${ASSET_SHA_PREFIX}${contentHash}` : createId('asset-local');
    const data = await blobToBytes(blob);
    return withMetadataLock(id, async () => {
      // A hashed id addresses one record, so putting the same image twice
      // shares it. (`asset-local-…` ids are random per put — no dedup — but
      // those only exist where hashing was unavailable, and re-import on a
      // hashing browser folds them back into content ids.) Either way the
      // second put may know less about it than the first did —
      // dimensions measured on import, a `source` recorded by the mood board —
      // so the earlier metadata is the base and only fields the caller actually
      // supplied override it. Replacing it wholesale silently dropped whatever
      // the first put had learned.
      const existing = await idbGet<AssetMetadata>(STORE_ASSET_META, id);
      const supplied = Object.fromEntries(
        Object.entries(metadata).filter(([, value]) => value !== undefined),
      ) as Partial<AssetMetadata>;
      const owners = existing?.owners ? [...existing.owners] : [];
      if (owner && !owners.includes(owner)) owners.push(owner);
      // A put that names no owner leaves a user nobody can account for, and
      // so does any record that reached us with no owners recorded at all —
      // it was written before ownership was tracked. Either way the fact has
      // to outlive this put, because later owner-bearing puts would otherwise
      // make the record look fully accounted for and `release` would delete
      // bytes the untracked user still shows. The marker only ever goes on,
      // never off, and its absence means "every user is known".
      const untrackedUser =
        !owner ||
        existing?.untrackedUser === true ||
        (existing !== undefined && (existing.owners?.length ?? 0) === 0);
      const full: AssetMetadata = {
        // Only a base: `...existing` below carries the original timestamp
        // forward when there is one, so the asset keeps the date it entered
        // the project rather than the date it was last touched.
        createdAt: new Date().toISOString(),
        ...existing,
        // These three describe the bytes in hand, so they must be written
        // from those bytes and not inherited. A re-import that corrects a
        // mis-declared mime type has to land, or `get` keeps handing back a
        // Blob typed as the wrong format and the browser refuses to draw it.
        // An empty `blob.type` is an absence rather than a fact about the
        // bytes, so it defers to what an earlier, better-informed put knew.
        mimeType: blob.type || existing?.mimeType || 'application/octet-stream',
        byteSize: blob.size,
        // A hash claim only when there is a hash: `asset-local-…` records
        // must not carry a `contentHash` that is really a random id.
        // (`...supplied` below can still restore one the caller verified.)
        ...(contentHash ? { contentHash } : { contentHash: undefined }),
        ...supplied,
        ...(owners.length > 0 ? { owners } : null),
        ...(untrackedUser ? { untrackedUser: true as const } : null),
      };
      const record: StoredAssetRecord = {
        __assetBlob: true,
        type: full.mimeType,
        data,
      };
      await idbPut(STORE_ASSETS, id, record);
      await idbPut(STORE_ASSET_META, id, full);
      return { id, metadata: full };
    });
  },

  get(id: string): Promise<Blob | null> {
    return idbGet<unknown>(STORE_ASSETS, id).then(coerceToBlob);
  },

  getMetadata(id: string): Promise<AssetMetadata | null> {
    return idbGet<AssetMetadata>(STORE_ASSET_META, id).then((v) => v ?? null);
  },

  release(id: string, owner: string): Promise<boolean> {
    // Queued behind any put of the same asset: a release that read the owner
    // list while a parallel put was adding a claim would delete the bytes out
    // from under the owner that had just taken them.
    return withMetadataLock(id, async () => {
      const existing = await idbGet<AssetMetadata>(STORE_ASSET_META, id);
      if (!existing) {
        // Bytes with no metadata beside them: `put` writes the pair together,
        // so this is the residue of a delete that was interrupted between the
        // two stores. Claims live only in the metadata, so no owner can be
        // shown to still want these bytes and nothing will ever look at them
        // again — leaving them behind grows the database on every failed
        // delete. Finish the job the earlier delete started.
        await idbDelete(STORE_ASSETS, id);
        return true;
      }
      const owners = existing.owners ?? [];
      // No claims recorded at all means the record predates ownership tracking,
      // and there is no way to know who else is using it. Keeping the bytes
      // wastes space; deleting them loses somebody's image. Wasting space is the
      // recoverable mistake, so that is the one this makes.
      if (owners.length === 0) return false;
      const remaining = owners.filter((entry) => entry !== owner);
      if (remaining.length === owners.length) return false;
      if (remaining.length > 0) {
        await idbPut(STORE_ASSET_META, id, { ...existing, owners: remaining });
        return false;
      }
      if (existing.untrackedUser) {
        // The last tracked claim is gone, but this record was stored at least
        // once without an owner, so somebody the list never knew about may
        // still be pointing at it. Drop the claim and keep the bytes; only an
        // explicit `delete` may take them now.
        await idbPut(STORE_ASSET_META, id, { ...existing, owners: remaining });
        return false;
      }
      await idbDelete(STORE_ASSETS, id);
      await idbDelete(STORE_ASSET_META, id);
      return true;
    });
  },

  async delete(id: string): Promise<void> {
    await idbDelete(STORE_ASSETS, id);
    await idbDelete(STORE_ASSET_META, id);
  },
});
