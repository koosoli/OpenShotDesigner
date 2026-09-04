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
import { collectProjectAssetIds } from '../domain/media/projectAssetReferences';

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

export interface AssetGarbageScan {
  /** Distinct asset ids referenced by the given projects. */
  referenced: number;
  /** Stored ids no project references, sorted for stable output. */
  unreachable: string[];
  /** Bytes that deleting every unreachable asset would reclaim. */
  reclaimableBytes: number;
}

type AssetSizeRecord = Pick<AssetMetadata, 'byteSize'>;

/**
 * Pure scan-only garbage pass over asset metadata: which stored ids are
 * unreachable from the project graph and how many bytes they hold. Takes the
 * metadata as a plain map or record so it never touches storage itself, and
 * performs no deletion — callers decide what (if anything) to delete.
 */
export const scanAssetGarbage = (
  projects: readonly Project[],
  metadataById: ReadonlyMap<string, AssetSizeRecord> | Record<string, AssetSizeRecord | undefined>,
): AssetGarbageScan => {
  const referencedIds = new Set(projects.flatMap(collectProjectAssetIds));
  const entries: Array<readonly [string, AssetSizeRecord]> =
    metadataById instanceof Map
      ? [...metadataById.entries()]
      : Object.entries(metadataById).flatMap(([id, metadata]) =>
          metadata ? [[id, metadata] as const] : [],
        );
  const sizes = new Map<string, AssetSizeRecord>(entries.map(([id, metadata]) => [id, metadata]));
  const unreachable = entries
    .map(([id]) => id)
    .filter((id) => !referencedIds.has(id))
    .sort();
  return {
    referenced: referencedIds.size,
    unreachable,
    reclaimableBytes: unreachable.reduce((sum, id) => sum + (sizes.get(id)?.byteSize ?? 0), 0),
  };
};
