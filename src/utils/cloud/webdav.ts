/**
 * Manual Nextcloud/WebDAV backup and restore (no sync, no realtime).
 *
 * Same deal as the Drive backup — a project leaves the browser as its `.osd`
 * package — but against any WebDAV endpoint (Nextcloud, ownCloud, a plain
 * Apache/nginx share) instead of Google. Because WebDAV reads as well as
 * writes, this provider also restores: listed `.osd` files import back
 * through the same path as a file-picker import.
 *
 * Plain `fetch` with Basic auth, no dependencies: PROPFIND to list (and to
 * probe the folder), MKCOL to create it, PUT to save (overwrite is native),
 * GET to fetch. Credentials live wherever the caller keeps them — the
 * dashboard remembers server and user always, the password only on request,
 * and only ever in this browser's localStorage.
 */

export const WEBDAV_FOLDER_NAME = 'OpenShotDesigner';

export interface WebdavConfig {
  /** Server root, e.g. https://cloud.example.com/remote.php/dav/files/alex */
  baseUrl: string;
  username: string;
  password: string;
}

export class WebdavError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'WebdavError';
    this.status = status;
  }
}

/** The server refused a save because the file changed since we last saw it (412). */
export const isWebdavConflict = (error: unknown): boolean =>
  error instanceof WebdavError && error.status === 412;

export const isWebdavUnauthorized = (error: unknown): boolean =>
  error instanceof WebdavError && error.status === 401;

export interface WebdavFile {
  name: string;
  /** Path relative to the app folder, for download. */
  href: string;
  size?: number;
  /** The server's version tag; a save sent with it fails if someone saved since. */
  etag?: string;
  /** Last saved on the server, as the server reports it (HTTP date). */
  modified?: string;
}

/**
 * What a save may assume about the server copy: that it is still the version
 * we opened (`ifMatch`), or that there is none yet (`ifNoneMatch`). Absent
 * means "overwrite whatever is there" — the old backup behaviour.
 */
export type WebdavSavePrecondition = { ifMatch: string } | { ifNoneMatch: true };

type FetchImpl = typeof fetch;

const trimmed = (value: string): string => value.trim();

const utf8Base64 = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const authHeader = (config: WebdavConfig): Record<string, string> => ({
  Authorization: `Basic ${utf8Base64(`${config.username}:${config.password}`)}`,
});

const folderUrl = (config: WebdavConfig): string =>
  `${trimmed(config.baseUrl).replace(/\/+$/, '')}/${WEBDAV_FOLDER_NAME}/`;

const fileUrl = (config: WebdavConfig, fileName: string): string =>
  `${folderUrl(config)}${encodeURIComponent(fileName)}`;

const requireConfig = (config: WebdavConfig): void => {
  if (!trimmed(config.baseUrl) || !trimmed(config.username) || !config.password) {
    throw new WebdavError('Server address, user name and password (or app password) are all required.');
  }
  if (!/^https?:\/\//i.test(trimmed(config.baseUrl))) {
    throw new WebdavError('The server address must start with http:// or https://.');
  }
};

const throwForStatus = async (response: Response, action: string): Promise<never> => {
  let detail = response.statusText;
  try {
    const text = await response.text();
    if (text.trim()) detail = text.trim().slice(0, 160);
  } catch {
    // Status code alone is enough to act on.
  }
  throw new WebdavError(`Nextcloud: ${action} failed (${response.status} ${detail}).`, response.status);
};

/**
 * The app folder, created on first use. A 405 on MKCOL means somebody (or a
 * previous run) got there first — that is success, not failure.
 */
export const ensureWebdavFolder = async (
  config: WebdavConfig,
  fetchImpl: FetchImpl = fetch,
): Promise<void> => {
  requireConfig(config);
  const probe = await fetchImpl(folderUrl(config), {
    method: 'PROPFIND',
    headers: { ...authHeader(config), Depth: '0' },
  });
  if (probe.ok) return;
  if (probe.status !== 404) await throwForStatus(probe, 'reaching the server');
  const created = await fetchImpl(folderUrl(config), { method: 'MKCOL', headers: authHeader(config) });
  if (!created.ok && created.status !== 405) await throwForStatus(created, 'creating the app folder');
};

const parsePropfind = (xml: string, folderPath: string): WebdavFile[] => {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new WebdavError('Nextcloud: the file list came back unreadable.');
  const out: WebdavFile[] = [];
  const responses = doc.getElementsByTagNameNS('DAV:', 'response');
  for (let i = 0; i < responses.length; i += 1) {
    const hrefNode = responses[i].getElementsByTagNameNS('DAV:', 'href')[0];
    const rawHref = hrefNode?.textContent ?? '';
    let path: string;
    try {
      path = decodeURIComponent(rawHref);
    } catch {
      continue;
    }
    const relative = path.startsWith(folderPath) ? path.slice(folderPath.length) : path;
    // The folder itself, and anything nested deeper, is not a backup file.
    if (!relative || relative === '/' || relative.includes('/')) continue;
    const name = relative.replace(/\/$/, '');
    if (!name) continue;
    const sizeNode = responses[i].getElementsByTagNameNS('DAV:', 'getcontentlength')[0];
    const size = sizeNode?.textContent ? Number(sizeNode.textContent) : NaN;
    const etag = responses[i].getElementsByTagNameNS('DAV:', 'getetag')[0]?.textContent?.trim();
    const modified = responses[i].getElementsByTagNameNS('DAV:', 'getlastmodified')[0]?.textContent?.trim();
    out.push({
      name,
      href: relative,
      ...(Number.isFinite(size) ? { size } : {}),
      ...(etag ? { etag } : {}),
      ...(modified ? { modified } : {}),
    });
  }
  return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
};

/** `.osd` packages in the app folder, newest-first is the server's business; here: by name. */
export const listWebdavPackages = async (
  config: WebdavConfig,
  fetchImpl: FetchImpl = fetch,
): Promise<WebdavFile[]> => {
  requireConfig(config);
  await ensureWebdavFolder(config, fetchImpl);
  const response = await fetchImpl(folderUrl(config), {
    method: 'PROPFIND',
    headers: { ...authHeader(config), Depth: '1' },
  });
  if (!response.ok) await throwForStatus(response, 'listing backups');
  const folderPath = new URL(folderUrl(config)).pathname;
  return parsePropfind(await response.text(), folderPath).filter((file) =>
    file.name.toLowerCase().endsWith('.osd'),
  );
};

/**
 * Save one `.osd` package. Without a precondition PUT simply overwrites; with
 * one, the server refuses (412, `isWebdavConflict`) a save over a copy that
 * changed since it was opened, or over a file that already exists.
 * Resolves to the new version tag when the server reports one.
 */
export const uploadWebdavPackage = async (
  config: WebdavConfig,
  fileName: string,
  packageBlob: Blob,
  fetchImpl: FetchImpl = fetch,
  precondition?: WebdavSavePrecondition,
): Promise<{ etag?: string }> => {
  requireConfig(config);
  await ensureWebdavFolder(config, fetchImpl);
  const conditional: Record<string, string> = !precondition
    ? {}
    : 'ifMatch' in precondition
      ? { 'If-Match': precondition.ifMatch }
      : { 'If-None-Match': '*' };
  const response = await fetchImpl(fileUrl(config, fileName), {
    method: 'PUT',
    headers: { ...authHeader(config), 'Content-Type': 'application/zip', ...conditional },
    body: packageBlob,
  });
  if (!response.ok) await throwForStatus(response, response.status === 412 ? 'saving (the server copy changed)' : 'uploading the export');
  const etag = response.headers.get('ETag') ?? response.headers.get('OC-ETag') ?? undefined;
  return etag ? { etag } : {};
};

/** Fetch one package for import. */
export const downloadWebdavPackage = async (
  config: WebdavConfig,
  fileName: string,
  fetchImpl: FetchImpl = fetch,
): Promise<Blob> => {
  requireConfig(config);
  const response = await fetchImpl(fileUrl(config, fileName), { headers: authHeader(config) });
  if (!response.ok) await throwForStatus(response, 'downloading the backup');
  return response.blob();
};
