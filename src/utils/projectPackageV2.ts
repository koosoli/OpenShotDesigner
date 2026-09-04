/**
 * Versioned project package v2: the `.osd` file as a ZIP archive.
 *
 * Layout inside `<title>.osd`:
 * - `manifest.json` — { formatVersion: 2, generatedAt, projectId, title,
 *   assetCount, checksums } where checksums maps assetId -> sha256 hex.
 * - `project.json` — the project document.
 * - `assets/<assetId>` — raw media bytes, no Base64 overhead.
 * - `assets/<assetId>.meta.json` — sidecar with the asset metadata (mime type
 *   and friends) when known; absent when the store had no metadata. Sidecars
 *   are bookkeeping and never count towards `assetCount`.
 *
 * v1 (`projectPackage.ts`) stays untouched and keeps working; this module
 * mirrors its error style and its `asset-local-…` handling (parse-tolerant,
 * import remaps via content id).
 */

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { AssetMetadata, AssetStore } from '../domain/storage/types';
import type { Project } from '../types';
import { blobToBytes, createIdbAssetStore, sha256Hex } from '../domain/storage/idbAssetStore';
import { ASSET_SHA_PREFIX, isSha256AssetRef } from '../domain/media/imageRef';
import { collectProjectAssetIds } from '../domain/media/projectAssetReferences';

export interface ProjectPackageV2Manifest {
  formatVersion: 2;
  generatedAt: string;
  projectId: string;
  title: string;
  assetCount: number;
  /** assetId -> sha256 hex when known. */
  checksums: Record<string, string>;
}

export interface PackageV2Asset {
  id: string;
  metadata?: AssetMetadata;
  data: Uint8Array;
}

const ASSETS_PREFIX = 'assets/';
const META_SUFFIX = '.meta.json';
const MANIFEST_PATH = 'manifest.json';
const PROJECT_PATH = 'project.json';

let store: AssetStore | null = null;
const getStore = (): AssetStore => (store ??= createIdbAssetStore());

/** Throw a readable error unless the value is a v2 manifest. */
export function validateProjectPackageV2Manifest(
  manifest: unknown,
): asserts manifest is ProjectPackageV2Manifest {
  const candidate = manifest as Partial<ProjectPackageV2Manifest> | null;
  if (!candidate || typeof candidate !== 'object' || candidate.formatVersion !== 2) {
    throw new Error('Not a valid project package (missing/unsupported manifest).');
  }
  if (
    typeof candidate.projectId !== 'string' ||
    typeof candidate.title !== 'string' ||
    typeof candidate.generatedAt !== 'string' ||
    typeof candidate.assetCount !== 'number' ||
    !Number.isInteger(candidate.assetCount) ||
    candidate.assetCount < 0 ||
    !candidate.checksums ||
    typeof candidate.checksums !== 'object'
  ) {
    throw new Error('Not a valid project package (malformed manifest).');
  }
}

/** Build a portable ZIP package containing the project and all referenced assets. */
export const exportProjectPackageV2 = async (project: Project): Promise<Blob> => {
  const assetStore = getStore();
  const ids = [...new Set(collectProjectAssetIds(project))];
  const archive: Record<string, Uint8Array> = {};
  const checksums: Record<string, string> = {};

  for (const id of ids) {
    const blob = await assetStore.get(id);
    if (!blob) {
      throw new Error(`Project package cannot be created: referenced media ${id} is missing.`);
    }
    const metadata = (await assetStore.getMetadata(id)) ?? undefined;
    if (metadata?.contentHash) checksums[id] = metadata.contentHash;
    archive[`${ASSETS_PREFIX}${id}`] = new Uint8Array(await blobToBytes(blob));
    if (metadata) {
      archive[`${ASSETS_PREFIX}${id}${META_SUFFIX}`] = strToU8(JSON.stringify(metadata));
    }
  }

  const manifest: ProjectPackageV2Manifest = {
    formatVersion: 2,
    generatedAt: new Date().toISOString(),
    projectId: project.id,
    title: project.title,
    assetCount: ids.length,
    checksums,
  };
  archive[MANIFEST_PATH] = strToU8(JSON.stringify(manifest));
  archive[PROJECT_PATH] = strToU8(JSON.stringify(project));
  return new Blob([zipSync(archive, { level: 6 })], { type: 'application/zip' });
};

/**
 * Parse and validate a v2 package file. Throws Error with a user-readable
 * message for invalid input; never partially trusts unvalidated data.
 */
export const parseProjectPackageV2 = async (
  file: File | Blob,
): Promise<{ project: Project; assets: PackageV2Asset[] }> => {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(await blobToBytes(file)));
  } catch {
    throw new Error('Not a valid project package (file is not a readable ZIP archive).');
  }
  const manifestRaw = files[MANIFEST_PATH];
  if (!manifestRaw) {
    throw new Error('Not a valid project package (missing/unsupported manifest).');
  }
  let manifestJson: unknown;
  try {
    manifestJson = JSON.parse(strFromU8(manifestRaw));
  } catch {
    throw new Error('Not a valid project package (missing/unsupported manifest).');
  }
  validateProjectPackageV2Manifest(manifestJson);
  const manifest = manifestJson;

  const projectRaw = files[PROJECT_PATH];
  if (!projectRaw) throw new Error('Package does not contain a valid project.');
  let project: Project;
  try {
    project = JSON.parse(strFromU8(projectRaw)) as Project;
  } catch {
    throw new Error('Package does not contain a valid project.');
  }
  if (!project || !Array.isArray(project.setups)) {
    throw new Error('Package does not contain a valid project.');
  }

  const entryIds = Object.keys(files).filter(
    (name) =>
      name.startsWith(ASSETS_PREFIX) &&
      !name.endsWith(META_SUFFIX) &&
      name.length > ASSETS_PREFIX.length,
  );
  const seen = new Set<string>();
  for (const name of entryIds) {
    const id = name.slice(ASSETS_PREFIX.length);
    if (seen.has(id)) throw new Error(`Package contains duplicate media ${id}.`);
    seen.add(id);
  }
  if (manifest.assetCount !== seen.size) {
    throw new Error(
      `Package declares ${manifest.assetCount} media file(s), but contains ${seen.size}.`,
    );
  }
  const referenced = [...new Set(collectProjectAssetIds(project))];
  const missing = referenced.filter((id) => !seen.has(id));
  if (missing.length > 0) {
    throw new Error(`Package is missing ${missing.length} referenced media file(s): ${missing.join(', ')}.`);
  }

  const assets: PackageV2Asset[] = [];
  for (const id of seen) {
    const bytes = files[`${ASSETS_PREFIX}${id}`];
    if (!bytes) throw new Error(`Package contains a malformed media record for ${id}.`);
    const metaRaw = files[`${ASSETS_PREFIX}${id}${META_SUFFIX}`];
    let metadata: AssetMetadata | undefined;
    if (metaRaw) {
      try {
        metadata = JSON.parse(strFromU8(metaRaw)) as AssetMetadata;
      } catch {
        throw new Error(`Package contains a malformed media record for ${id}.`);
      }
    }
    if (isSha256AssetRef(id)) {
      const hash = await sha256Hex(new Blob([bytes]));
      if (!hash) throw new Error('This browser cannot verify package checksums.');
      if (id !== `${ASSET_SHA_PREFIX}${hash}`) {
        throw new Error(`Package media ${id} failed its content checksum.`);
      }
      const manifestHash = manifest.checksums[id];
      if (manifestHash && manifestHash !== hash) {
        throw new Error(`Package manifest checksum failed for ${id}.`);
      }
      if (metadata?.contentHash && metadata.contentHash !== hash) {
        throw new Error(`Package media metadata checksum failed for ${id}.`);
      }
    } else {
      // `asset-local-…` records were minted where hashing was unavailable, so
      // the id carries no claim to recompute. The bytes are accepted here and
      // re-registered under a content id on import, with project references
      // remapped (see below). A manifest hash, when one was recorded, still
      // applies and is verified.
      const manifestHash = manifest.checksums[id];
      if (manifestHash) {
        const hash = await sha256Hex(new Blob([bytes]));
        if (hash && hash !== manifestHash) {
          throw new Error(`Package manifest checksum failed for ${id}.`);
        }
      }
    }
    assets.push({ id, metadata, data: bytes });
  }
  assets.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { project, assets };
};

/** Re-register packaged v2 assets into the local asset store. */
export interface ProjectPackageV2ImportResult {
  written: number;
  /**
   * Old id -> new id for assets that could not keep their packaged id:
   * `asset-local-…` records are adopted under a content id on hashing
   * browsers. Rewrite project references with `remapProjectAssetIds`.
   */
  remapped: Record<string, string>;
}

export const importProjectPackageV2Assets = async (
  assets: readonly PackageV2Asset[],
): Promise<ProjectPackageV2ImportResult> => {
  const assetStore = getStore();
  let written = 0;
  const remapped: Record<string, string> = {};
  for (const asset of assets) {
    const blob = new Blob([asset.data], {
      type: asset.metadata?.mimeType || 'application/octet-stream',
    });
    const ref = await assetStore.put(blob, { ...(asset.metadata || {}), mimeType: blob.type });
    if (ref.id !== asset.id) {
      if (isSha256AssetRef(asset.id)) {
        throw new Error(`Imported media ${asset.id} did not match its verified content id.`);
      }
      remapped[asset.id] = ref.id;
    }
    written++;
  }
  return { written, remapped };
};
