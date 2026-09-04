import type { Project } from '../types';
import { exportProjectPackage, importProjectPackageAssets, parseProjectPackage } from './projectPackage';
import {
  exportProjectPackageV2,
  importProjectPackageV2Assets,
  parseProjectPackageV2,
} from './projectPackageV2';
import { remapProjectAssetIds } from '../domain/media/projectAssetReferences';
import { downloadBlob, safeFileName } from './download';

interface WritableFileHandle {
  name?: string;
  createWritable(): Promise<{
    write(data: Blob): Promise<void>;
    close(): Promise<void>;
  }>;
}

interface ReadableFileHandle {
  name?: string;
  getFile(): Promise<File>;
}

type PickerWindow = Window & {
  showSaveFilePicker?: (options: unknown) => Promise<WritableFileHandle>;
  showOpenFilePicker?: (options: unknown) => Promise<ReadableFileHandle[]>;
};

export type OsdFormat = 'v1' | 'v2';

// A file handle belongs to one project, never to whichever project happened
// to be open after the picker closed. This prevents Ctrl+S in Project B from
// overwriting Project A.osd after switching productions.
const handlesByProjectId = new Map<string, WritableFileHandle>();
const fileNamesByProjectId = new Map<string, string>();
const lastNativeSaveAtByProjectId = new Map<string, string>();

export interface RecentProjectFile {
  projectId: string;
  fileName: string;
  savedAt: string;
}

const RECENT_KEY = 'openshotdesigner_recent_files';
const MAX_RECENT_FILES = 8;

const readRecentFiles = (): RecentProjectFile[] => {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as RecentProjectFile[]) : [];
    return Array.isArray(parsed) ? parsed.filter((entry) => entry && typeof entry.fileName === 'string') : [];
  } catch {
    return [];
  }
};

const recordRecentFile = (projectId: string, fileName: string): void => {
  try {
    const savedAt = new Date().toISOString();
    const next = [
      { projectId, fileName, savedAt },
      ...readRecentFiles().filter((entry) => entry.fileName !== fileName),
    ].slice(0, MAX_RECENT_FILES);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    lastNativeSaveAtByProjectId.set(projectId, savedAt);
    fileNamesByProjectId.set(projectId, fileName);
  } catch {
    // Recent files are a convenience; never break a save over them.
  }
};

export const listRecentProjectFiles = (): RecentProjectFile[] => readRecentFiles();

export const supportsNativeProjectFiles = (): boolean =>
  typeof window !== 'undefined' && typeof (window as PickerWindow).showSaveFilePicker === 'function';

export const supportsNativeProjectOpen = (): boolean =>
  typeof window !== 'undefined' && typeof (window as PickerWindow).showOpenFilePicker === 'function';

/** File name bound to the project by a native save or open, if any. */
export const getBoundProjectFileName = (projectId: string): string | undefined =>
  fileNamesByProjectId.get(projectId);

/** ISO timestamp of the last successful native save of the project, if any. */
export const getLastNativeSaveAt = (projectId: string): string | undefined =>
  lastNativeSaveAtByProjectId.get(projectId);

/** Save to the current .osd handle, asking for one on first save. New files are v2 (ZIP). */
export const saveNativeProjectFile = async (
  project: Project,
  options: { saveAs?: boolean; downloadFallback?: boolean; bindHandle?: boolean; format?: OsdFormat } = {},
): Promise<'native' | 'download'> => {
  const format = options.format ?? 'v2';
  const blob = format === 'v2' ? await exportProjectPackageV2(project) : await exportProjectPackage(project);
  const fileName = `${safeFileName(project.title, 'project').toLowerCase()}.osd`;
  const picker = (window as PickerWindow).showSaveFilePicker;
  if (picker) {
    let handle = options.saveAs ? undefined : handlesByProjectId.get(project.id);
    if (!handle) {
      handle = await picker({
        suggestedName: fileName,
        types: [
          {
            description: 'OpenShotDesigner project',
            accept: format === 'v2' ? { 'application/zip': ['.osd'] } : { 'application/json': ['.osd'] },
          },
        ],
      });
      if (options.bindHandle !== false) handlesByProjectId.set(project.id, handle);
    }
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    if (options.bindHandle !== false) recordRecentFile(project.id, handle.name ?? fileName);
    else {
      lastNativeSaveAtByProjectId.set(project.id, new Date().toISOString());
      fileNamesByProjectId.set(project.id, handle.name ?? fileName);
    }
    return 'native';
  }
  if (options.downloadFallback !== false) {
    downloadBlob(blob, fileName);
  }
  return 'download';
};

export interface ParsedProjectFile {
  format: 'osd-v2' | 'osd-v1' | 'json';
  project: Project;
  /** Re-registers packaged assets; returns old->new id rewrites (local-id upgrades). */
  importAssets: () => Promise<Record<string, string>>;
}

const ZIP_MAGIC_0 = 0x50;
const ZIP_MAGIC_1 = 0x4b;

/**
 * Parse raw file bytes without trusting the extension: ZIP magic routes to
 * v2, otherwise the bytes are read as text and tried as a v1 package first,
 * then as a plain project backup.
 */
export const parseProjectFileBytes = async (buffer: ArrayBuffer): Promise<ParsedProjectFile> => {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 2 && bytes[0] === ZIP_MAGIC_0 && bytes[1] === ZIP_MAGIC_1) {
    const { project, assets } = await parseProjectPackageV2(new Blob([buffer]));
    return {
      format: 'osd-v2',
      project,
      importAssets: async () => {
        const { remapped } = await importProjectPackageV2Assets(assets);
        return remapped;
      },
    };
  }
  const text = new TextDecoder().decode(bytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file could not be read as a project.');
  }
  const manifest = (parsed as { manifest?: { formatVersion?: number } }).manifest;
  if (manifest && typeof manifest.formatVersion === 'number') {
    const { project, assets } = await parseProjectPackage(new Blob([text]));
    return {
      format: 'osd-v1',
      project,
      importAssets: async () => {
        const { remapped } = await importProjectPackageAssets(assets);
        return remapped;
      },
    };
  }
  const project = parsed as Project;
  if (!project || !Array.isArray(project.setups)) {
    throw new Error('That file is not an OpenShotDesigner project.');
  }
  return { format: 'json', project, importAssets: async () => ({}) };
};

/** Apply an asset id rewrite (local-id upgrades) to an imported project. */
export const applyAssetRemap = (project: Project, remapped: Record<string, string>): Project =>
  Object.keys(remapped).length > 0 ? remapProjectAssetIds(project, remapped).project : project;

/**
 * Native Open…: pick an .osd / JSON file and parse it (both .osd generations
 * plus plain JSON backups). Media is registered and local-id upgrades are
 * reported, but nothing is committed: the caller applies the remap and loads
 * the project, then binds the picked file with `bindNativeProjectHandle`
 * using the FINAL project id (imports may be re-id'ed on collision).
 * Returns null when the File System Access API is unavailable (use a classic
 * file input + parseProjectFileBytes instead).
 */
export const openNativeProjectFile = async (): Promise<{
  fileName: string;
  project: Project;
  format: ParsedProjectFile['format'];
  remapped: Record<string, string>;
  handle: unknown;
} | null> => {
  const picker = (window as PickerWindow).showOpenFilePicker;
  if (!picker) return null;
  const [handle] = await picker({
    multiple: false,
    types: [
      {
        description: 'OpenShotDesigner project',
        accept: { 'application/zip': ['.osd'], 'application/json': ['.osd', '.json'] },
      },
    ],
  });
  if (!handle) return null;
  const file = await handle.getFile();
  const parsed = await parseProjectFileBytes(await file.arrayBuffer());
  const remapped = await parsed.importAssets();
  const fileName = handle.name ?? file.name;
  return { fileName, project: parsed.project, format: parsed.format, remapped, handle };
};

/**
 * Bind a picked file to a project id so later saves write back to it.
 * Call with the final id AFTER import (collisions re-id the project).
 */
export const bindNativeProjectHandle = (projectId: string, fileName: string, handle: unknown): void => {
  const candidate = handle as Partial<WritableFileHandle> | null | undefined;
  if (!candidate || typeof candidate.createWritable !== 'function') return;
  handlesByProjectId.set(projectId, candidate as WritableFileHandle);
  recordRecentFile(projectId, fileName);
};

export const forgetNativeProjectHandle = (projectId?: string): void => {
  if (projectId) {
    handlesByProjectId.delete(projectId);
    fileNamesByProjectId.delete(projectId);
    lastNativeSaveAtByProjectId.delete(projectId);
  } else {
    handlesByProjectId.clear();
    fileNamesByProjectId.clear();
    lastNativeSaveAtByProjectId.clear();
  }
};
