import type { Project } from '../types';
import type { AssetMetadata } from '../domain/storage/types';
import { createIdbAssetStore } from '../domain/storage/idbAssetStore';
import {
  idbGet,
  idbGetAllKeys,
  STORE_ASSETS,
  STORE_ASSET_META,
} from '../domain/storage/idb';
import { collectAssetIds } from './projectPackage';

export interface StoredAssetInspection {
  id: string;
  byteSize: number;
  mimeType: string;
  source?: string;
  referenced: boolean;
  metadataMissing: boolean;
}

export interface AssetStorageInspection {
  assets: StoredAssetInspection[];
  storedBytes: number;
  referencedBytes: number;
  orphanedBytes: number;
  orphanedIds: string[];
  missingIds: string[];
}

/**
 * Inspect media against the complete local project graph. Orphans are bytes
 * referenced by no saved project, not merely by no currently open project.
 */
export const inspectAssetStorage = async (
  projects: readonly Project[],
): Promise<AssetStorageInspection> => {
  const referenced = new Set(projects.flatMap(collectAssetIds));
  const assetKeys = await idbGetAllKeys(STORE_ASSETS);
  const metadataKeys = await idbGetAllKeys(STORE_ASSET_META);
  const storedIds = new Set([...assetKeys, ...metadataKeys]);
  const assets = await Promise.all(
    [...storedIds].sort().map(async (id): Promise<StoredAssetInspection> => {
      const metadata = await idbGet<AssetMetadata>(STORE_ASSET_META, id);
      return {
        id,
        byteSize: metadata?.byteSize ?? 0,
        mimeType: metadata?.mimeType ?? 'unknown',
        source: metadata?.source,
        referenced: referenced.has(id),
        metadataMissing: metadata === undefined,
      };
    }),
  );
  const orphaned = assets.filter((asset) => !asset.referenced);
  return {
    assets,
    storedBytes: assets.reduce((sum, asset) => sum + asset.byteSize, 0),
    referencedBytes: assets
      .filter((asset) => asset.referenced)
      .reduce((sum, asset) => sum + asset.byteSize, 0),
    orphanedBytes: orphaned.reduce((sum, asset) => sum + asset.byteSize, 0),
    orphanedIds: orphaned.map((asset) => asset.id),
    missingIds: [...referenced].filter((id) => !assetKeys.includes(id)).sort(),
  };
};

/** Explicit mark-and-sweep cleanup; callers must confirm with the user first. */
export const deleteOrphanedAssets = async (ids: readonly string[]): Promise<void> => {
  const store = createIdbAssetStore();
  await Promise.all(ids.map((id) => store.delete(id)));
};
