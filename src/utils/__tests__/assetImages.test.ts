import { describe, expect, it, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { assetImageStore } from '../assetImages';
import { collectAssetIds } from '../projectPackage';
import type { Project } from '../../types';

/**
 * The contract that matters for headshots, storyboard frames and location maps
 * alike: bytes go to the content-addressed store, project state holds only an
 * id, and that id is the shape the packager already knows how to find.
 */
describe('asset-backed images', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('stores bytes once for identical content', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const first = await assetImageStore.put(new Blob([bytes], { type: 'image/jpeg' }));
    const second = await assetImageStore.put(new Blob([bytes], { type: 'image/jpeg' }));
    expect(second.id).toBe(first.id);
  });

  it('gives different content different ids', async () => {
    const a = await assetImageStore.put(new Blob([new Uint8Array([1])], { type: 'image/jpeg' }));
    const b = await assetImageStore.put(new Blob([new Uint8Array([2])], { type: 'image/jpeg' }));
    expect(a.id).not.toBe(b.id);
  });

  it('round-trips the bytes', async () => {
    const ref = await assetImageStore.put(new Blob([new Uint8Array([9, 8, 7])], { type: 'image/png' }));
    const blob = await assetImageStore.get(ref.id);
    expect(blob).not.toBeNull();
    expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(new Uint8Array([9, 8, 7]));
  });

  it('returns null for an id that is not in the store, rather than throwing', async () => {
    expect(await assetImageStore.get('asset-sha256-missing')).toBeNull();
  });

  it('records the dimensions and source it was given', async () => {
    const ref = await assetImageStore.put(new Blob([new Uint8Array([4, 4])], { type: 'image/jpeg' }), {
      width: 512,
      height: 384,
      source: 'headshot:ada.jpg',
    });
    const metadata = await assetImageStore.getMetadata(ref.id);
    expect(metadata).toMatchObject({ width: 512, height: 384, source: 'headshot:ada.jpg' });
  });

  it('collects ids from the typed media fields used by the project packager', async () => {
    const ref = await assetImageStore.put(new Blob([new Uint8Array([1, 1, 2])], { type: 'image/jpeg' }));
    const project = {
      id: 'p',
      title: 'T',
      people: [{ id: 'x', displayName: 'Ada', headshotAssetId: ref.id }],
      productionDays: [{ id: 'd', name: 'D', scheduleBlockIds: [], callSheet: { mapAssetId: ref.id } }],
    } as unknown as Project;
    expect(collectAssetIds(project)).toEqual([ref.id]);
  });

  it('finds storyboard ids on shots and ignores asset-looking free text', async () => {
    const ref = await assetImageStore.put(new Blob([new Uint8Array([3, 3, 3])], { type: 'image/jpeg' }));
    const project = {
      setups: [{ shots: [{ id: 's1', storyboardImage: ref.id }], elements: [] }],
      reviewComments: [{ id: 'note', body: 'Do not package asset-sha256-not-media' }],
    } as unknown as Project;
    expect(collectAssetIds(project)).toEqual([ref.id]);
  });
});
