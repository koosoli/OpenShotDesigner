/**
 * Manual Google Drive export (one-way backup, not sync).
 *
 * A project leaves the browser as the same `.osd` package the file download
 * produces, uploaded into an `OpenShotDesigner` folder on the user's own
 * Drive. Same name twice updates the file in place rather than stacking
 * duplicates. This is a backup button, not synchronisation: no merging, no
 * auto-upload, no conflict resolution beyond "the newest manual export wins".
 *
 * Deliberately dependency-free: Google Identity Services is loaded as a
 * runtime `<script>` (nothing enters the bundle, and offline the loader
 * simply rejects so the UI can say so). Only the least-privilege
 * `drive.file` scope is requested — the app sees files it created itself,
 * never the whole Drive.
 *
 * The OAuth Client ID is the viewer's own (dashboard setting, local
 * preference): authorised JavaScript origins are bound to it in their Cloud
 * Console, so a shipped ID could never work for anyone else's origin.
 * Access tokens live in memory only and are never persisted.
 */

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_FOLDER_NAME = 'OpenShotDesigner';
const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';

interface GisTokenResponse {
  access_token?: string;
  error?: string;
}

interface GisTokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
}

interface GisOauth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (response: GisTokenResponse) => void;
  }): GisTokenClient;
  revoke(token: string): void;
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GisOauth2 } };
  }
}

export class DriveError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'DriveError';
    this.status = status;
  }
}

export const isDriveUnauthorized = (error: unknown): boolean =>
  error instanceof DriveError && error.status === 401;

/** Injectable seam: the default appends the real GIS `<script>`. */
export type ScriptLoader = (src: string) => Promise<void>;

const defaultScriptLoader: ScriptLoader = (src) =>
  new Promise<void>((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new DriveError('Google sign-in needs a browser window.'));
      return;
    }
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const tag = document.createElement('script');
    tag.src = src;
    tag.async = true;
    tag.onload = () => resolve();
    tag.onerror = () =>
      reject(new DriveError('Google sign-in could not load — check the internet connection.'));
    document.head.appendChild(tag);
  });

const oauth2 = (): GisOauth2 => {
  const api = typeof window !== 'undefined' ? window.google?.accounts?.oauth2 : undefined;
  if (!api) throw new DriveError('Google sign-in is not available (offline?).');
  return api;
};

/**
 * Interactive Google consent, resolving with a short-lived access token.
 * `silent` skips the account chooser when a session already exists — used
 * for the single automatic retry after a 401, never for the first sign-in.
 */
export const requestDriveAccessToken = async (
  clientId: string,
  opts: { silent?: boolean; loadScript?: ScriptLoader } = {},
): Promise<string> => {
  const id = clientId.trim();
  if (!id) throw new DriveError('Enter your Google OAuth Client ID first (see the setup steps).');
  await (opts.loadScript ?? defaultScriptLoader)(GIS_SCRIPT_SRC);
  return new Promise<string>((resolve, reject) => {
    try {
      const client = oauth2().initTokenClient({
        client_id: id,
        scope: DRIVE_FILE_SCOPE,
        callback: (response) => {
          if (response.access_token) resolve(response.access_token);
          else reject(new DriveError(`Google sign-in was not completed (${response.error ?? 'dismissed'}).`));
        },
      });
      client.requestAccessToken(opts.silent === true ? { prompt: '' } : undefined);
    } catch (error) {
      reject(error instanceof DriveError ? error : new DriveError('Google sign-in failed to start.'));
    }
  });
};

/** Forget the session on Google's side too; never throws. */
export const revokeDriveAccessToken = async (token: string): Promise<void> => {
  try {
    oauth2().revoke(token);
  } catch {
    // Local sign-out must succeed even when Google is unreachable.
  }
};

type FetchImpl = typeof fetch;

interface DriveFileRef {
  id: string;
  name: string;
  webViewLink?: string;
}

const authHeaders = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
});

const readJsonObject = async (response: Response): Promise<Record<string, unknown>> => {
  try {
    const data: unknown = await response.json();
    return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

const stringField = (record: Record<string, unknown>, key: string): string | undefined => {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
};

const throwForStatus = async (response: Response, action: string): Promise<never> => {
  const body = await readJsonObject(response);
  const detail = stringField(body, 'message') ?? response.statusText;
  throw new DriveError(`Google Drive: ${action} failed (${response.status} ${detail}).`, response.status);
};

/** The app's folder, created on first export. */
const ensureFolder = async (token: string, fetchImpl: FetchImpl): Promise<string> => {
  const query = `mimeType='${DRIVE_FOLDER_MIME}' and name='${DRIVE_FOLDER_NAME}' and trashed=false`;
  const found = await fetchImpl(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)&spaces=drive`,
    { headers: authHeaders(token) },
  );
  if (!found.ok) await throwForStatus(found, 'finding the app folder');
  const files = (await readJsonObject(found))['files'];
  const firstId =
    Array.isArray(files) && files.length > 0 ? stringField(files[0] as Record<string, unknown>, 'id') : undefined;
  if (firstId) return firstId;

  const created = await fetchImpl('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ name: DRIVE_FOLDER_NAME, mimeType: DRIVE_FOLDER_MIME }),
  });
  if (!created.ok) await throwForStatus(created, 'creating the app folder');
  const id = stringField(await readJsonObject(created), 'id');
  if (!id) throw new DriveError('Google Drive: the app folder came back without an id.');
  return id;
};

const findNamedFile = async (
  token: string,
  folderId: string,
  fileName: string,
  fetchImpl: FetchImpl,
): Promise<string | undefined> => {
  const query = `'${folderId}' in parents and name='${fileName.replace(/'/g, "\\'")}' and trashed=false`;
  const response = await fetchImpl(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)&spaces=drive`,
    { headers: authHeaders(token) },
  );
  if (!response.ok) await throwForStatus(response, 'looking for a previous export');
  const files = (await readJsonObject(response))['files'];
  if (!Array.isArray(files) || files.length === 0) return undefined;
  return stringField(files[0] as Record<string, unknown>, 'id');
};

const multipartBody = (metadata: Record<string, unknown>, media: Blob): FormData => {
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json; charset=utf-8' }));
  form.append('media', media);
  return form;
};

const readFileRef = async (response: Response, action: string): Promise<DriveFileRef> => {
  if (!response.ok) await throwForStatus(response, action);
  const body = await readJsonObject(response);
  const id = stringField(body, 'id');
  const name = stringField(body, 'name') ?? '';
  if (!id) throw new DriveError(`Google Drive: ${action} came back without a file id.`);
  const link = stringField(body, 'webViewLink');
  return link ? { id, name, webViewLink: link } : { id, name };
};

export interface DriveUploadInput {
  accessToken: string;
  fileName: string;
  /** The `.osd` package bytes, exactly as the file download produces them. */
  packageBlob: Blob;
  fetchImpl?: FetchImpl;
}

/**
 * Save (or refresh) one `.osd` package on the user's Drive.
 * A previous export with the same name is updated in place.
 */
export const uploadProjectToDrive = async (input: DriveUploadInput): Promise<DriveFileRef> => {
  const fetchImpl = input.fetchImpl ?? fetch;
  const folderId = await ensureFolder(input.accessToken, fetchImpl);
  const existingId = await findNamedFile(input.accessToken, folderId, input.fileName, fetchImpl);
  const fields = 'fields=id,name,webViewLink';
  if (existingId) {
    const updated = await fetchImpl(
      `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existingId)}?uploadType=multipart&${fields}`,
      {
        method: 'PATCH',
        headers: authHeaders(input.accessToken),
        body: multipartBody({ name: input.fileName }, input.packageBlob),
      },
    );
    return readFileRef(updated, 'updating the previous export');
  }
  const created = await fetchImpl(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&${fields}`, {
    method: 'POST',
    headers: authHeaders(input.accessToken),
    body: multipartBody({ name: input.fileName, parents: [folderId] }, input.packageBlob),
  });
  return readFileRef(created, 'uploading the export');
};
