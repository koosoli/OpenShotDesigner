/**
 * Which cloud file a project in this browser came from or was last saved to,
 * and which version of it that was — the basis for "save back" without
 * silently overwriting someone else's save.
 *
 * Per browser, not in the project: two people sharing one Nextcloud folder
 * each have their own record of what they last saw, which is exactly what
 * the conflict check needs. Losing it (cleared site data) only means the next
 * save asks before replacing the file instead of knowing it may.
 */

export type CloudProvider = 'webdav' | 'drive';

export interface CloudLink {
  fileName: string;
  /** WebDAV ETag or Drive modifiedTime of the copy we last opened or saved. */
  version?: string;
  /** Drive file id. */
  fileId?: string;
  /** ISO time of the last open or save, for the "synced" hint. */
  syncedAt: string;
}

type LinkStore = Record<string, Partial<Record<CloudProvider, CloudLink>>>;

const KEY = 'openshotdesigner_ui_cloud.links';

const readStore = (): LinkStore => {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as LinkStore) : {};
  } catch {
    return {};
  }
};

const writeStore = (store: LinkStore): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Without storage the next save simply asks before replacing.
  }
};

export const readCloudLink = (projectId: string, provider: CloudProvider): CloudLink | undefined =>
  readStore()[projectId]?.[provider];

export const writeCloudLink = (projectId: string, provider: CloudProvider, link: Omit<CloudLink, 'syncedAt'> & { syncedAt?: string }): void => {
  const store = readStore();
  store[projectId] = { ...(store[projectId] ?? {}), [provider]: { ...link, syncedAt: link.syncedAt ?? new Date().toISOString() } };
  writeStore(store);
};

export const clearCloudLinks = (projectId: string): void => {
  const store = readStore();
  if (!(projectId in store)) return;
  delete store[projectId];
  writeStore(store);
};

/**
 * How a save should treat the server copy.
 *
 *  - `update`: we know which version we opened; save only if it is unchanged.
 *  - `create`: no file of that name on the server; make it (and fail if one
 *    appears in the meantime).
 *  - `ask`: a file of that name exists but this browser never opened or saved
 *    it — maybe an old backup of ours, maybe a colleague's. The user decides.
 */
export type SavePlan =
  | { kind: 'update'; fileName: string; version: string }
  | { kind: 'create'; fileName: string }
  | { kind: 'ask'; fileName: string; remoteModified?: string };

export const planCloudSave = (
  link: CloudLink | undefined,
  defaultFileName: string,
  remote: ReadonlyArray<{ name: string; modified?: string }>,
): SavePlan => {
  if (link?.version) return { kind: 'update', fileName: link.fileName, version: link.version };
  const fileName = link?.fileName ?? defaultFileName;
  const existing = remote.find((file) => file.name === fileName);
  if (!existing) return { kind: 'create', fileName };
  return { kind: 'ask', fileName, ...(existing.modified ? { remoteModified: existing.modified } : {}) };
};

/** `my-film.osd` -> `my-film (copy 2026-10-11 14.30).osd`. */
export const cloudCopyFileName = (fileName: string, now: Date = new Date()): string => {
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}.${String(now.getMinutes()).padStart(2, '0')}`;
  const dot = fileName.toLowerCase().endsWith('.osd') ? fileName.length - 4 : fileName.length;
  return `${fileName.slice(0, dot)} (copy ${stamp})${fileName.slice(dot)}`;
};
