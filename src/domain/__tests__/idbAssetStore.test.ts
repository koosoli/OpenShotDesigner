import { afterEach, describe, expect, it, vi } from 'vitest';
import { blobToBytes, createIdbAssetStore, sha256Hex } from '../storage/idbAssetStore';
import { ASSET_LOCAL_PREFIX, assetContentHash, isAssetRef, isSha256AssetRef } from '../media/imageRef';
import { idbGet, idbGetAllValues, STORE_ASSETS, STORE_ASSET_META } from '../storage/idb';

/**
 * The content-addressed asset store: every headshot, storyboard frame, mood
 * board image and location map in the app is a row in here, keyed by the
 * SHA-256 of its own bytes.
 *
 * `assetImages.test.ts` covers the store as its callers see it. These tests
 * cover the store itself, and in particular the claims the content addressing
 * is built on — that identical bytes really do collapse to a single stored
 * record rather than merely reporting the same id, that the key is the actual
 * SHA-256 and not something that happens to look like one, and that the bytes
 * come back unaltered through the typed-array record the blob is stored as.
 */

const bytes = (...values: number[]) => new Uint8Array(values);

/** How many records the underlying stores actually hold. */
const recordCounts = async () => ({
  blobs: (await idbGetAllValues(STORE_ASSETS)).length,
  meta: (await idbGetAllValues(STORE_ASSET_META)).length,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('content addressing', () => {
  it('keys an asset on the real SHA-256 of its bytes', async () => {
    // Pinned against the published digests: if the hash input ever changed
    // (the blob wrapper instead of its bytes, say) every existing asset id in
    // every saved project would become unreachable, and this is the only test
    // that would notice.
    expect(await sha256Hex(new Blob([]))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(await sha256Hex(new Blob([new TextEncoder().encode('abc')]))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );

    const store = createIdbAssetStore();
    const ref = await store.put(new Blob([new TextEncoder().encode('abc')]));
    expect(ref.id).toBe(
      'asset-sha256-ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('stores the same bytes once, not once per caller', async () => {
    // Two mood board cards dragged from the same file must cost one copy of
    // the image, which means checking the store's row count and not just the
    // id the caller was handed back.
    const store = createIdbAssetStore();
    const before = await recordCounts();

    const first = await store.put(new Blob([bytes(10, 20, 30)], { type: 'image/png' }));
    const second = await store.put(new Blob([bytes(10, 20, 30)], { type: 'image/png' }));

    expect(second.id).toBe(first.id);
    const after = await recordCounts();
    expect(after.blobs - before.blobs).toBe(1);
    expect(after.meta - before.meta).toBe(1);
  });

  it('separates content that differs by a single byte', async () => {
    const store = createIdbAssetStore();
    const a = await store.put(new Blob([bytes(1, 2, 3)]));
    const b = await store.put(new Blob([bytes(1, 2, 4)]));
    expect(a.id).not.toBe(b.id);
    expect(new Uint8Array(await (await store.get(a.id))!.arrayBuffer())).toEqual(bytes(1, 2, 3));
    expect(new Uint8Array(await (await store.get(b.id))!.arrayBuffer())).toEqual(bytes(1, 2, 4));
  });

  it('ignores the declared mime type when deciding identity', async () => {
    // The same bytes labelled differently are the same file. Deduplicating on
    // content alone is what keeps a re-imported package from doubling in size.
    const store = createIdbAssetStore();
    const asPng = await store.put(new Blob([bytes(7, 7, 7)], { type: 'image/png' }));
    const asJpeg = await store.put(new Blob([bytes(7, 7, 7)], { type: 'image/jpeg' }));
    expect(asJpeg.id).toBe(asPng.id);

    // Sharing a record must not mean the first label wins forever. The second
    // put describes the same bytes better, and both the metadata and the Blob
    // handed back by `get` have to say so — a frame served as image/png when
    // it is a JPEG is a frame the browser declines to draw.
    expect(asJpeg.metadata.mimeType).toBe('image/jpeg');
    expect((await store.getMetadata(asJpeg.id))?.mimeType).toBe('image/jpeg');
    expect((await store.get(asJpeg.id))?.type).toBe('image/jpeg');
  });

  it('keeps a known mime type when a later put of the same bytes declares none', async () => {
    // The inverse of the above: an untyped blob (a fetch that lost the header,
    // a File dropped without an extension) knows nothing about the format, so
    // it must not overwrite what the import that did know recorded.
    const store = createIdbAssetStore();
    const typed = await store.put(new Blob([bytes(8, 8, 8)], { type: 'image/webp' }));
    const untyped = await store.put(new Blob([bytes(8, 8, 8)]));

    expect(untyped.metadata.mimeType).toBe('image/webp');
    expect((await store.get(typed.id))?.type).toBe('image/webp');
  });

  it('shares content across store instances, because the key is the content', async () => {
    // Mood boards, headshots and the packager each construct their own store
    // object. They are views onto one database, not three separate caches.
    const written = await createIdbAssetStore().put(new Blob([bytes(42, 43)], { type: 'image/gif' }));
    const readBack = await createIdbAssetStore().get(written.id);
    expect(new Uint8Array(await readBack!.arrayBuffer())).toEqual(bytes(42, 43));
  });
});

describe('round trip', () => {
  it('returns the exact bytes, including zero and high bytes', async () => {
    // Blobs are persisted as a typed array because Blob instances do not
    // survive every structured-clone implementation. The conversion out and
    // back must be lossless, or every stored image is quietly corrupted.
    const store = createIdbAssetStore();
    const payload = bytes(0, 1, 127, 128, 200, 254, 255, 0);
    const ref = await store.put(new Blob([payload], { type: 'image/png' }));

    const blob = await store.get(ref.id);
    expect(blob).not.toBeNull();
    expect(blob!.type).toBe('image/png');
    expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(payload);
  });

  it('records size and mime type, and defaults the type when the blob has none', async () => {
    const store = createIdbAssetStore();
    const ref = await store.put(new Blob([bytes(1, 2, 3, 4)]));
    expect(ref.metadata.byteSize).toBe(4);
    expect(ref.metadata.mimeType).toBe('application/octet-stream');
    expect(assetContentHash(ref.id)).toBe(ref.metadata.contentHash);
    expect(await store.getMetadata(ref.id)).toEqual(ref.metadata);
  });

  it('mints an honest asset-local-… id — and no hash claim — without crypto.subtle', async () => {
    // Non-secure contexts (plain-http LAN on set, old browsers) have no
    // SubtleCrypto. The id must then say `asset-local-…`, never
    // `asset-sha256-…`, and the metadata must not carry a `contentHash`
    // that is really a random string.
    vi.stubGlobal('crypto', undefined);
    const store = createIdbAssetStore();
    const payload = bytes(9, 9, 9);
    const ref = await store.put(new Blob([payload], { type: 'image/png' }));

    expect(ref.id.startsWith(ASSET_LOCAL_PREFIX)).toBe(true);
    expect(isAssetRef(ref.id)).toBe(true);
    expect(isSha256AssetRef(ref.id)).toBe(false);
    expect(assetContentHash(ref.id)).toBeUndefined();
    expect(ref.metadata.contentHash).toBeUndefined();
    expect(new Uint8Array(await (await store.get(ref.id))!.arrayBuffer())).toEqual(payload);

    // No hashing means no deduplication: the same bytes stored twice are
    // two records. Documented, not fixed — merging happens on re-import
    // where hashing exists.
    const second = await store.put(new Blob([payload], { type: 'image/png' }));
    expect(second.id).not.toBe(ref.id);
  });

  it('reports a missing asset as null rather than throwing', async () => {
    // A project can reference an asset whose bytes were never imported (a
    // package restored without its media). That has to render as a placeholder,
    // not as a crash on the page that shows it.
    const store = createIdbAssetStore();
    expect(await store.get('asset-sha256-0000')).toBeNull();
    expect(await store.getMetadata('asset-sha256-0000')).toBeNull();
  });

  it('reads a legacy record stored as a bare typed array', async () => {
    // Assets written before the { type, data } wrapper existed are still in
    // users' browsers; they must keep loading.
    const { idbPut } = await import('../storage/idb');
    await idbPut(STORE_ASSETS, 'asset-legacy-raw', bytes(5, 6, 7));
    const blob = await createIdbAssetStore().get('asset-legacy-raw');
    expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(bytes(5, 6, 7));
  });

  it('reads bytes out of a blob without Blob.arrayBuffer', async () => {
    // Older jsdom and a few real browsers lack Blob.arrayBuffer; the store
    // falls back to FileReader, and that path has to produce the same bytes.
    const original: Blob['arrayBuffer'] = Blob.prototype.arrayBuffer;
    Reflect.deleteProperty(Blob.prototype, 'arrayBuffer');
    try {
      expect(await blobToBytes(new Blob([bytes(9, 8, 7)]))).toEqual(bytes(9, 8, 7));
    } finally {
      Blob.prototype.arrayBuffer = original;
    }
  });
});

describe('delete', () => {
  it('removes both the bytes and the metadata', async () => {
    // Leaving metadata behind would make a deleted asset look present to any
    // caller that checks metadata first, and would leak rows forever.
    const store = createIdbAssetStore();
    const ref = await store.put(new Blob([bytes(31, 41, 59)], { type: 'image/png' }));
    expect(await store.get(ref.id)).not.toBeNull();

    await store.delete(ref.id);

    expect(await store.get(ref.id)).toBeNull();
    expect(await store.getMetadata(ref.id)).toBeNull();
    expect(await idbGet(STORE_ASSETS, ref.id)).toBeUndefined();
    expect(await idbGet(STORE_ASSET_META, ref.id)).toBeUndefined();
  });

  it('is safe to call twice', async () => {
    const store = createIdbAssetStore();
    const ref = await store.put(new Blob([bytes(2, 2)]));
    await store.delete(ref.id);
    await expect(store.delete(ref.id)).resolves.toBeUndefined();
  });

  /**
   * There is no reference counting: the store has no idea how many places in
   * the project point at a given hash. Deduplication therefore has a sharp
   * edge — the second reference to an image keeps no copy of its own, so
   * deleting the first takes the bytes out from under it.
   *
   * This test pins the behaviour as it is rather than as it should be, so that
   * whoever adds reference counting has to come here and change it
   * deliberately.
   */
  it('has no reference counting, so deleting one user of an image deletes it for all', async () => {
    const store = createIdbAssetStore();
    const headshot = await store.put(new Blob([bytes(60, 61, 62)], { type: 'image/jpeg' }));
    const moodBoardCard = await store.put(new Blob([bytes(60, 61, 62)], { type: 'image/jpeg' }));
    expect(moodBoardCard.id).toBe(headshot.id);

    await store.delete(headshot.id);

    expect(await store.get(moodBoardCard.id)).toBeNull();
  });
});

describe('metadata', () => {
  it('keeps the extra fields the caller supplied alongside the derived ones', async () => {
    const store = createIdbAssetStore();
    const ref = await store.put(new Blob([bytes(11, 12)], { type: 'image/jpeg' }), {
      width: 1920,
      height: 1080,
      source: 'location-map:studio-lot',
    });
    expect(ref.metadata).toMatchObject({
      mimeType: 'image/jpeg',
      byteSize: 2,
      width: 1920,
      height: 1080,
      source: 'location-map:studio-lot',
    });
    expect(Date.parse(ref.metadata.createdAt)).not.toBeNaN();
  });

  /**
   * The id is derived from the bytes alone, so a second put of the same image
   * addresses the first one's record. The second caller may know less about
   * the image than the first did — the headshot import measured it, the mood
   * board only knows where it came from — so the earlier metadata has to
   * survive. Replacing it wholesale lost the dimensions.
   */
  it('merges a later put of identical bytes into the earlier metadata', async () => {
    const store = createIdbAssetStore();
    const first = await store.put(new Blob([bytes(77, 78)], { type: 'image/jpeg' }), {
      source: 'headshot:ada.jpg',
      width: 400,
    });
    await store.put(new Blob([bytes(77, 78)], { type: 'image/png' }), {
      source: 'moodboard:reference-3',
    });

    const stored = await store.getMetadata(first.id);
    expect(stored?.source).toBe('moodboard:reference-3');
    expect(stored?.width).toBe(400);
    // Merging protects what the later caller could not know. It must not
    // freeze what it does know: these bytes are being declared image/png now,
    // and the record follows the correction.
    expect(stored?.mimeType).toBe('image/png');
    // The asset keeps the moment it entered the project, not the moment it
    // was last touched.
    expect(stored?.createdAt).toBe(first.metadata.createdAt);
  });
});

describe('ownership', () => {
  /**
   * The data-loss path this exists to close: one image, two users. Releasing
   * it for the mood board must not take the headshot's bytes with it — the
   * project would still hold the reference, and it would resolve to nothing.
   */
  it('keeps the bytes while another owner still claims them', async () => {
    const store = createIdbAssetStore();
    const blob = () => new Blob([bytes(11, 12, 13)], { type: 'image/png' });
    const ref = await store.put(blob(), {}, 'headshot:ada');
    await store.put(blob(), {}, 'moodboard:card-3');

    expect(await store.release(ref.id, 'moodboard:card-3')).toBe(false);
    expect(await store.get(ref.id)).not.toBeNull();
    expect((await store.getMetadata(ref.id))?.owners).toEqual(['headshot:ada']);

    expect(await store.release(ref.id, 'headshot:ada')).toBe(true);
    expect(await store.get(ref.id)).toBeNull();
    expect(await store.getMetadata(ref.id)).toBeNull();
  });

  it('records an owner once however many times it puts the same bytes', async () => {
    const store = createIdbAssetStore();
    const blob = () => new Blob([bytes(21, 22)], { type: 'image/png' });
    const ref = await store.put(blob(), {}, 'headshot:ada');
    await store.put(blob(), {}, 'headshot:ada');

    expect((await store.getMetadata(ref.id))?.owners).toEqual(['headshot:ada']);
    expect(await store.release(ref.id, 'headshot:ada')).toBe(true);
    expect(await store.get(ref.id)).toBeNull();
  });

  it('releasing an owner that never claimed it changes nothing', async () => {
    const store = createIdbAssetStore();
    const ref = await store.put(new Blob([bytes(31)], { type: 'image/png' }), {}, 'headshot:ada');

    expect(await store.release(ref.id, 'moodboard:card-9')).toBe(false);
    expect(await store.get(ref.id)).not.toBeNull();
  });

  /**
   * Records written before ownership was tracked carry no claims, so there is
   * no way to know who else is using them. Keeping the bytes wastes space;
   * deleting them loses somebody's image. It keeps them.
   */
  it('will not delete a record that predates ownership tracking', async () => {
    const store = createIdbAssetStore();
    const ref = await store.put(new Blob([bytes(41, 42)], { type: 'image/png' }));

    expect((await store.getMetadata(ref.id))?.owners).toBeUndefined();
    expect(await store.release(ref.id, 'anyone')).toBe(false);
    expect(await store.get(ref.id)).not.toBeNull();
  });

  /**
   * The way that protection gets defeated: the untracked user is still there,
   * but one owner-bearing put makes the record look fully accounted for.
   * Releasing that single owner would then take the image away from whoever
   * imported it before ownership existed — exactly the loss the rule above is
   * there to prevent, reached by a longer route.
   */
  it('still protects a pre-ownership record after a later put claims it', async () => {
    const store = createIdbAssetStore();
    const blob = () => new Blob([bytes(43, 44)], { type: 'image/png' });
    const legacy = await store.put(blob());
    await store.put(blob(), {}, 'moodboard:card-1');

    expect((await store.getMetadata(legacy.id))?.owners).toEqual(['moodboard:card-1']);
    expect(await store.release(legacy.id, 'moodboard:card-1')).toBe(false);
    expect(await store.get(legacy.id)).not.toBeNull();
    // The claim is gone even though the bytes stay: the mood board no longer
    // counts as a reason to keep them.
    expect((await store.getMetadata(legacy.id))?.owners).toEqual([]);
  });

  /**
   * A put that names no owner has the same consequence whichever order it
   * arrives in — somebody is holding the asset and the list does not know
   * who — so a later ownerless put has to disarm auto-deletion too.
   */
  it('stops auto-deleting once any put declines to name an owner', async () => {
    const store = createIdbAssetStore();
    const blob = () => new Blob([bytes(45, 46)], { type: 'image/png' });
    const ref = await store.put(blob(), {}, 'headshot:ada');
    await store.put(blob());

    expect(await store.release(ref.id, 'headshot:ada')).toBe(false);
    expect(await store.get(ref.id)).not.toBeNull();
  });

  /**
   * Importing a folder fires the puts in parallel, and two cards cut from the
   * same photograph land on one record. Reading the owner list and writing it
   * back in separate transactions let the second write erase the first
   * caller's claim; releasing that lost owner then deleted a live image.
   */
  it('keeps every owner when the same bytes are put in parallel', async () => {
    const store = createIdbAssetStore();
    const blob = () => new Blob([bytes(47, 48)], { type: 'image/png' });
    const [first] = await Promise.all([
      store.put(blob(), {}, 'moodboard:card-a'),
      store.put(blob(), {}, 'moodboard:card-b'),
      store.put(blob(), {}, 'moodboard:card-c'),
    ]);

    expect((await store.getMetadata(first.id))?.owners?.slice().sort()).toEqual([
      'moodboard:card-a',
      'moodboard:card-b',
      'moodboard:card-c',
    ]);

    expect(await store.release(first.id, 'moodboard:card-a')).toBe(false);
    expect(await store.release(first.id, 'moodboard:card-b')).toBe(false);
    expect(await store.get(first.id)).not.toBeNull();
    expect(await store.release(first.id, 'moodboard:card-c')).toBe(true);
    expect(await store.get(first.id)).toBeNull();
  });

  /**
   * Bytes whose metadata row is missing are the residue of a delete that died
   * between the two stores. Nothing can claim them and nothing will read them,
   * so a release finishes the deletion rather than leaving the database to
   * grow by one orphan per interrupted delete.
   */
  it('clears orphaned bytes whose metadata record is gone', async () => {
    const { idbDelete } = await import('../storage/idb');
    const store = createIdbAssetStore();
    const ref = await store.put(new Blob([bytes(49, 50)], { type: 'image/png' }), {}, 'headshot:ada');
    // Half of a delete: the bytes survive their metadata.
    await idbDelete(STORE_ASSET_META, ref.id);

    expect(await store.release(ref.id, 'headshot:ada')).toBe(true);
    expect(await store.get(ref.id)).toBeNull();
    expect(await idbGet(STORE_ASSETS, ref.id)).toBeUndefined();
  });

  it('delete still removes the bytes whoever holds a claim', async () => {
    const store = createIdbAssetStore();
    const ref = await store.put(new Blob([bytes(51)], { type: 'image/png' }), {}, 'headshot:ada');

    await store.delete(ref.id);
    expect(await store.get(ref.id)).toBeNull();
    expect(await store.getMetadata(ref.id)).toBeNull();
  });
});
