import { describe, expect, it } from 'vitest';
import { strToU8, unzipSync, zipSync } from 'fflate';
import {
  exportProjectPackage,
  importProjectPackageAssets,
  parseProjectPackage,
} from '../projectPackage';
import {
  exportProjectPackageV2,
  importProjectPackageV2Assets,
  parseProjectPackageV2,
} from '../projectPackageV2';
import { remapProjectAssetIds } from '../../domain/media/projectAssetReferences';
import { blobToBytes, createIdbAssetStore } from '../../domain/storage/idbAssetStore';
import { scanAssetGarbage } from '../assetStorageInspection';
import type { Project } from '../../types';

const makeProjectWithAsset = (assetId: string): Project =>
  ({
    id: 'pkg-v2-proj-1',
    title: 'Packaged Production v2',
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
        cards: [{ id: 'card-1', assetId, tags: [], sectionId: 'sec-1', order: 0 }],
      },
    ],
  }) as unknown as Project;

const unzipExport = async (blob: Blob): Promise<Record<string, Uint8Array>> =>
  unzipSync(new Uint8Array(await blobToBytes(blob)));

describe('project package v2 (ZIP)', () => {
  it('round-trips export -> parse -> import with byte-faithful assets', async () => {
    const store = createIdbAssetStore();
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255]);
    const { id } = await store.put(new Blob([bytes]), { mimeType: 'image/png' });

    const exported = await exportProjectPackageV2(makeProjectWithAsset(id));
    const files = await unzipExport(exported);
    expect(Object.keys(files).filter((name) => name.startsWith('assets/') && !name.endsWith('.meta.json'))).toEqual([
      `assets/${id}`,
    ]);

    const parsed = await parseProjectPackageV2(exported);
    expect(parsed.project.id).toBe('pkg-v2-proj-1');
    expect(parsed.assets).toHaveLength(1);
    expect(Array.from(parsed.assets[0].data)).toEqual(Array.from(bytes));

    const { written, remapped } = await importProjectPackageV2Assets(parsed.assets);
    expect(written).toBe(1);
    expect(remapped).toEqual({});
    const roundTripped = new Uint8Array(await (await store.get(id))!.arrayBuffer());
    expect(Array.from(roundTripped)).toEqual(Array.from(bytes));
  }, 15000);

  it('rejects assets whose bytes no longer match their content id', async () => {
    const store = createIdbAssetStore();
    const { id } = await store.put(new Blob([new Uint8Array([1, 2, 3])]), {
      mimeType: 'image/png',
    });
    const files = await unzipExport(await exportProjectPackageV2(makeProjectWithAsset(id)));
    const tampered = new Uint8Array(files[`assets/${id}`]);
    tampered[0] ^= 0xff;
    files[`assets/${id}`] = tampered;

    await expect(
      parseProjectPackageV2(new Blob([zipSync(files, { level: 6 })], { type: 'application/zip' })),
    ).rejects.toThrow(/checksum/i);
  });

  it('rejects packages that omit project-referenced media', async () => {
    const store = createIdbAssetStore();
    const { id } = await store.put(new Blob([new Uint8Array([7, 8, 9])]), {
      mimeType: 'image/png',
    });
    const files = await unzipExport(await exportProjectPackageV2(makeProjectWithAsset(id)));
    delete files[`assets/${id}`];
    delete files[`assets/${id}.meta.json`];
    // Keep the count consistent so the missing-reference check (not the count
    // check) is the one under test — same shape as the v1 test.
    const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
    manifest.assetCount = 0;
    files['manifest.json'] = strToU8(JSON.stringify(manifest));

    await expect(
      parseProjectPackageV2(new Blob([zipSync(files, { level: 6 })], { type: 'application/zip' })),
    ).rejects.toThrow(/missing.*referenced/i);
  });

  it('rejects corrupt archives with a readable error', async () => {
    await expect(
      parseProjectPackageV2(new Blob(['definitely not a zip archive'], { type: 'application/zip' })),
    ).rejects.toThrow(/readable ZIP|valid project package/i);
  });

  it('adopts an asset-local-… record under a content id on import and remaps references', async () => {
    const bytes = new Uint8Array([5, 6, 7, 8]);
    const localId = 'asset-local-v2-test-record';
    const archive = {
      'manifest.json': strToU8(
        JSON.stringify({
          formatVersion: 2,
          generatedAt: new Date().toISOString(),
          projectId: 'pkg-v2-proj-1',
          title: 'Packaged Production v2',
          assetCount: 1,
          checksums: {},
        }),
      ),
      'project.json': strToU8(JSON.stringify(makeProjectWithAsset(localId))),
      [`assets/${localId}`]: bytes,
    };
    const parsed = await parseProjectPackageV2(
      new Blob([zipSync(archive, { level: 6 })], { type: 'application/zip' }),
    );
    const { written, remapped } = await importProjectPackageV2Assets(parsed.assets);
    expect(written).toBe(1);
    const newId = remapped[localId];
    expect(newId).toMatch(/^asset-sha256-[0-9a-f]{64}$/);

    const { project: rewritten, applied } = remapProjectAssetIds(parsed.project, remapped);
    expect(applied).toBe(1);
    const stored = new Uint8Array(await (await createIdbAssetStore().get(newId))!.arrayBuffer());
    expect(Array.from(stored)).toEqual(Array.from(bytes));
    expect(rewritten.moodBoards?.[0].cards[0].assetId).toBe(newId);
  });

  it('still parses a v1 package (regression)', async () => {
    const store = createIdbAssetStore();
    const bytes = new Uint8Array([9, 8, 7, 6]);
    const { id } = await store.put(new Blob([bytes]), { mimeType: 'image/png' });

    const parsed = await parseProjectPackage(await exportProjectPackage(makeProjectWithAsset(id)));
    expect(parsed.project.id).toBe('pkg-v2-proj-1');
    const { written } = await importProjectPackageAssets(parsed.assets);
    expect(written).toBe(1);
  }, 15000);
});

describe('asset garbage scan', () => {
  it('counts referenced ids and sizes unreachable bytes on a fixture', () => {
    const projects = [makeProjectWithAsset('asset-sha256-aaaa'), makeProjectWithAsset('asset-sha256-bbbb')];
    const scan = scanAssetGarbage(
      projects,
      new Map([
        ['asset-sha256-aaaa', { byteSize: 100 }],
        ['asset-sha256-bbbb', { byteSize: 25 }],
        ['asset-sha256-orphan-1', { byteSize: 40 }],
        ['asset-sha256-orphan-2', { byteSize: 11 }],
      ]),
    );
    expect(scan.referenced).toBe(2);
    expect(scan.unreachable).toEqual(['asset-sha256-orphan-1', 'asset-sha256-orphan-2']);
    expect(scan.reclaimableBytes).toBe(51);
  });

  it('accepts a plain record of metadata', () => {
    const scan = scanAssetGarbage([makeProjectWithAsset('asset-sha256-aaaa')], {
      'asset-sha256-aaaa': { byteSize: 100 },
      'asset-sha256-orphan-1': { byteSize: 7 },
    });
    expect(scan).toEqual({ referenced: 1, unreachable: ['asset-sha256-orphan-1'], reclaimableBytes: 7 });
  });
});
