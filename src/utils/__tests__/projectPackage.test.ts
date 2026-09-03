import { describe, it, expect } from 'vitest';
import {
  collectAssetIds,
  exportProjectPackage,
  importProjectPackageAssets,
  parseProjectPackage,
} from '../projectPackage';
import { remapProjectAssetIds } from '../../domain/media/projectAssetReferences';
import { createIdbAssetStore } from '../../domain/storage/idbAssetStore';
import type { Project } from '../../types';

const makeProjectWithAsset = (assetId: string): Project =>
  ({
    id: 'pkg-proj-1',
    title: 'Packaged Production',
    schemaVersion: 6,
    activeSetupId: 'setup-1',
    setups: [
      {
        id: 'setup-1',
        name: 'S1',
        sceneNumber: '1',
        location: 'INT. X - DAY',
        timeOfDay: 'Day INT',
        elements: [],
        shots: [],
        currentBeat: 1,
        totalBeats: 1,
        gridSettings: { size: 30, snap: true, showGrid: false, unit: 'm', pixelsPerUnit: 30 },
        canvasScale: 1,
        canvasOffset: { x: 0, y: 0 },
      },
    ],
    moodBoards: [
      {
        id: 'board-1',
        title: 'References',
        sections: [{ id: 'sec-1', title: 'Main', order: 0 }],
        cards: [
          {
            id: 'card-1',
            assetId,
            tags: [],
            sectionId: 'sec-1',
            order: 0,
          },
        ],
      },
    ],
  }) as unknown as Project;

describe('project package', () => {
  it('collects referenced asset ids from anywhere in the project graph', () => {
    const ids = collectAssetIds(makeProjectWithAsset('asset-sha256-abc123'));
    expect(ids).toEqual(['asset-sha256-abc123']);
  });

  it('roundtrips export → parse with byte-faithful assets', async () => {
    const store = createIdbAssetStore();
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255]);
    const { id } = await store.put(new Blob([bytes]), { mimeType: 'image/png' });

    const blob = await exportProjectPackage(makeProjectWithAsset(id));
    const parsed = await parseProjectPackage(blob);

    expect(parsed.project.id).toBe('pkg-proj-1');
    expect(parsed.assets).toHaveLength(1);
    const restored = new Uint8Array(await (await store.get(id))!.arrayBuffer());
    void restored;
    // Re-import into a fresh read to verify base64 fidelity:
    const { written, remapped } = await importProjectPackageAssets(parsed.assets);
    expect(written).toBe(1);
    expect(remapped).toEqual({});
    const roundTripped = await store.get(parsed.assets[0].id);
    expect(roundTripped).not.toBeNull();
    const roundTrippedBytes = new Uint8Array(await roundTripped!.arrayBuffer());
    expect(Array.from(roundTrippedBytes)).toEqual(Array.from(bytes));
  }, 15000);

  it('rejects invalid packages with readable errors', async () => {
    const bad = new Blob([JSON.stringify({ hello: true })], { type: 'application/json' });
    await expect(parseProjectPackage(bad)).rejects.toThrow(/manifest/i);
    const noProject = new Blob(
      [JSON.stringify({ manifest: { formatVersion: 1 } })],
      { type: 'application/json' },
    );
    await expect(parseProjectPackage(noProject)).rejects.toThrow(/project/i);
  });

  it('rejects a package whose media bytes no longer match their content id', async () => {
    const store = createIdbAssetStore();
    const { id } = await store.put(new Blob([new Uint8Array([1, 2, 3])]), {
      mimeType: 'image/png',
    });
    const exported = JSON.parse(await (await exportProjectPackage(makeProjectWithAsset(id))).text());
    exported.assets[0].dataBase64 = btoa('tampered');

    await expect(parseProjectPackage(new Blob([JSON.stringify(exported)]))).rejects.toThrow(/checksum/i);
  });

  it('rejects packages that omit project-referenced media', async () => {
    const store = createIdbAssetStore();
    const { id } = await store.put(new Blob([new Uint8Array([7, 8, 9])]), {
      mimeType: 'image/png',
    });
    const exported = JSON.parse(await (await exportProjectPackage(makeProjectWithAsset(id))).text());
    exported.assets = [];
    exported.manifest.assetCount = 0;

    await expect(parseProjectPackage(new Blob([JSON.stringify(exported)]))).rejects.toThrow(/missing.*referenced/i);
  });

  it('refuses to export a package when referenced media is absent locally', async () => {
    await expect(
      exportProjectPackage(makeProjectWithAsset('asset-sha256-does-not-exist')),
    ).rejects.toThrow(/missing/i);
  });

  it('adopts an asset-local-… record under a content id on import and remaps references', async () => {
    // A package written where crypto.subtle was unavailable carries honest
    // `asset-local-…` ids with no checksum to verify. Importing where hashing
    // exists must accept the bytes, register them under their content id, and
    // hand back the rewrite — not throw a checksum error.
    const bytes = new Uint8Array([5, 6, 7, 8]);
    const localId = 'asset-local-test-record';
    const pkg = {
      manifest: {
        formatVersion: 1,
        generatedAt: new Date().toISOString(),
        projectId: 'pkg-proj-1',
        title: 'Packaged Production',
        assetCount: 1,
        checksums: {},
      },
      project: makeProjectWithAsset(localId),
      assets: [
        {
          id: localId,
          metadata: { mimeType: 'image/png', byteSize: 4, createdAt: new Date().toISOString() },
          dataBase64: btoa(String.fromCharCode(...bytes)),
        },
      ],
    };
    expect(collectAssetIds(makeProjectWithAsset(localId))).toEqual([localId]);

    const parsed = await parseProjectPackage(new Blob([JSON.stringify(pkg)]));
    const { written, remapped } = await importProjectPackageAssets(parsed.assets);
    expect(written).toBe(1);
    const newId = remapped[localId];
    expect(newId).toMatch(/^asset-sha256-[0-9a-f]{64}$/);

    const { project: rewritten, applied } = remapProjectAssetIds(parsed.project, remapped);
    expect(applied).toBe(1);
    expect(collectAssetIds(rewritten)).toEqual([newId]);
    const stored = new Uint8Array(await (await createIdbAssetStore().get(newId))!.arrayBuffer());
    expect(Array.from(stored)).toEqual(Array.from(bytes));
  });
});
