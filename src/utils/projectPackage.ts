/**
 * Versioned project package import/export (plan §5.2.2).
 *
 * A package bundles the project JSON plus every referenced asset so a
 * production can travel as one portable file. Import validates before
 * committing; asset ids are re-registered into the local asset store.
 */

import type { AssetMetadata, AssetStore } from '../domain/storage/types';
import type { Project } from '../types';
import { createIdbAssetStore } from '../domain/storage/idbAssetStore';

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

/** Find every referenced asset id in the project graph (future-proof string scan). */
export const collectAssetIds = (project: Project): string[] =>
  [...new Set(JSON.stringify(project).match(/asset-sha256-[A-Za-z0-9-]+/g) || [])];

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
    if (!blob) continue; // Missing assets are reported via manifest.assetCount mismatch.
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
      assetCount: assets.length,
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
  const assets = Array.isArray(raw.assets)
    ? raw.assets.filter(
        (a): a is PackageAsset =>
          !!a && typeof a.id === 'string' && typeof a.dataBase64 === 'string',
      )
    : [];
  return { project: raw.project as Project, assets };
};

/** Re-register packaged assets into the local asset store. Returns count written. */
export const importProjectPackageAssets = async (assets: PackageAsset[]): Promise<number> => {
  const assetStore = getStore();
  let written = 0;
  for (const asset of assets) {
    try {
      const blob = new Blob([base64ToBytes(asset.dataBase64)], {
        type: asset.metadata?.mimeType || 'application/octet-stream',
      });
      await assetStore.put(blob, { ...(asset.metadata || {}), mimeType: blob.type });
      written++;
    } catch {
      // A single corrupt asset must not fail the whole import.
    }
  }
  return written;
};
