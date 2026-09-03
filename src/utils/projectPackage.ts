/**
 * Versioned project package import/export (plan §5.2.2).
 *
 * A package bundles the project JSON plus every referenced asset so a
 * production can travel as one portable file. Import validates before
 * committing; asset ids are re-registered into the local asset store.
 */

import type { AssetMetadata, AssetStore } from '../domain/storage/types';
import type { Project } from '../types';
import { createIdbAssetStore, sha256Hex } from '../domain/storage/idbAssetStore';
import { ASSET_SHA_PREFIX, isSha256AssetRef } from '../domain/media/imageRef';
import { collectProjectAssetIds } from '../domain/media/projectAssetReferences';

export interface ProjectPackageManifest {
  formatVersion: 1;
  generatedAt: string;
  projectId: string;
  title: string;
  assetCount: number;
  /** assetId -> sha256 hex when known. */
  checksums: Record<string, string>;
}

export interface PackageAsset {
  id: string;
  metadata?: AssetMetadata;
  dataBase64: string;
}

export interface ProjectPackage {
  manifest: ProjectPackageManifest;
  project: Project;
  assets: PackageAsset[];
}

let store: AssetStore | null = null;
const getStore = (): AssetStore => (store ??= createIdbAssetStore());

/** Backward-compatible export; the implementation is now a typed field inventory. */
export const collectAssetIds = collectProjectAssetIds;

const bytesToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

/** Blob.arrayBuffer with a FileReader fallback for environments lacking it (jsdom). */
const blobToArrayBuffer = (blob: Blob): Promise<ArrayBuffer> => {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'));
    reader.readAsArrayBuffer(blob);
  });
};

const base64ToBytes = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

/** Build a portable package blob containing the project and all referenced assets. */
export const exportProjectPackage = async (project: Project): Promise<Blob> => {
  const assetStore = getStore();
  const ids = collectAssetIds(project);
  const assets: PackageAsset[] = [];
  const checksums: Record<string, string> = {};

  for (const id of ids) {
    const blob = await assetStore.get(id);
    if (!blob) {
      throw new Error(`Project package cannot be created: referenced media ${id} is missing.`);
    }
    const metadata = await assetStore.getMetadata(id) ?? undefined;
    if (metadata?.contentHash) checksums[id] = metadata.contentHash;
    assets.push({ id, metadata, dataBase64: bytesToBase64(await blobToArrayBuffer(blob)) });
  }

  const pkg: ProjectPackage = {
    manifest: {
      formatVersion: 1,
      generatedAt: new Date().toISOString(),
      projectId: project.id,
      title: project.title,
      assetCount: ids.length,
      checksums,
    },
    project,
    assets,
  };
  return new Blob([JSON.stringify(pkg)], { type: 'application/json' });
};

/**
 * Parse and validate a package file. Throws Error with a user-readable
 * message for invalid input; never partially trusts unvalidated data.
 */
export const parseProjectPackage = async (
  file: File | Blob,
): Promise<{ project: Project; assets: PackageAsset[] }> => {
  const raw = JSON.parse(await file.text()) as Partial<ProjectPackage>;
  if (!raw || typeof raw !== 'object' || raw.manifest?.formatVersion !== 1) {
    throw new Error('Not a valid project package (missing/unsupported manifest).');
  }
  if (!raw.project || !Array.isArray(raw.project.setups)) {
    throw new Error('Package does not contain a valid project.');
  }
  if (!Array.isArray(raw.assets)) throw new Error('Package media list is missing.');
  const assets: PackageAsset[] = [];
  const seen = new Set<string>();
  for (const candidate of raw.assets) {
    if (!candidate || typeof candidate.id !== 'string' || typeof candidate.dataBase64 !== 'string') {
      throw new Error('Package contains a malformed media record.');
    }
    if (seen.has(candidate.id)) throw new Error(`Package contains duplicate media ${candidate.id}.`);
    seen.add(candidate.id);
    const bytes = base64ToBytes(candidate.dataBase64);
    const blob = new Blob([bytes], {
      type: candidate.metadata?.mimeType || 'application/octet-stream',
    });
    const hash = await sha256Hex(blob);
    if (!hash) throw new Error('This browser cannot verify package checksums.');
    if (isSha256AssetRef(candidate.id)) {
      const expectedId = `${ASSET_SHA_PREFIX}${hash}`;
      if (candidate.id !== expectedId) {
        throw new Error(`Package media ${candidate.id} failed its content checksum.`);
      }
      const manifestHash = raw.manifest.checksums?.[candidate.id];
      if (manifestHash && manifestHash !== hash) {
        throw new Error(`Package manifest checksum failed for ${candidate.id}.`);
      }
      if (candidate.metadata?.contentHash && candidate.metadata.contentHash !== hash) {
        throw new Error(`Package media metadata checksum failed for ${candidate.id}.`);
      }
    } else {
      // `asset-local-…` records were minted where hashing was unavailable, so
      // the id carries no claim to recompute. Shape was validated above; the
      // bytes are accepted here and re-registered under a content id on
      // import, with project references remapped (see below).
    }
    assets.push(candidate as PackageAsset);
  }
  if (raw.manifest.assetCount !== assets.length) {
    throw new Error(
      `Package declares ${raw.manifest.assetCount} media file(s), but contains ${assets.length}.`,
    );
  }
  const referenced = collectAssetIds(raw.project as Project);
  const missing = referenced.filter((id) => !seen.has(id));
  if (missing.length > 0) {
    throw new Error(`Package is missing ${missing.length} referenced media file(s): ${missing.join(', ')}.`);
  }
  return { project: raw.project as Project, assets };
};

/** Re-register packaged assets into the local asset store. */
export interface ProjectPackageImportResult {
  written: number;
  /**
   * Old id -> new id for assets that could not keep their packaged id:
   * `asset-local-…` records are adopted under a content id on hashing
   * browsers. Rewrite project references with `remapProjectAssetIds`.
   */
  remapped: Record<string, string>;
}

export const importProjectPackageAssets = async (
  assets: PackageAsset[],
): Promise<ProjectPackageImportResult> => {
  const assetStore = getStore();
  let written = 0;
  const remapped: Record<string, string> = {};
  for (const asset of assets) {
    const blob = new Blob([base64ToBytes(asset.dataBase64)], {
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
