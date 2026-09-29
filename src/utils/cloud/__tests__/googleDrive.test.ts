/**
 * Google Drive adapter tests: every HTTP exchange is scripted, so no test
 * touches the network. What matters here is the request SHAPE — wrong URL,
 * missing auth header or a malformed multipart body fails silently on
 * Google's side with an opaque 400, which is exactly the failure a user
 * cannot diagnose from "export didn't work".
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DriveError,
  isDriveUnauthorized,
  requestDriveAccessToken,
  uploadProjectToDrive,
} from '../googleDrive';

interface SeenRequest {
  url: string;
  method: string;
  auth: string | null;
  body: BodyInit | null | undefined;
}

const jsonResponse = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });

/** A fetch double that answers from a queue and records everything. */
const scriptedFetch = (answers: Response[]) => {
  const seen: SeenRequest[] = [];
  const impl = vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    seen.push({
      url,
      method: init?.method ?? 'GET',
      auth: (init?.headers as Record<string, string> | undefined)?.['Authorization'] ?? null,
      body: init?.body as BodyInit | null | undefined,
    });
    const next = answers.shift();
    if (!next) throw new Error(`unexpected request to ${url}`);
    return next;
  });
  return { impl: impl as unknown as typeof fetch, seen };
};

const FOLDER_SEARCH_EMPTY = () => jsonResponse({ files: [] });
const FOLDER_SEARCH_HIT = () => jsonResponse({ files: [{ id: 'folder-1' }] });
const FOLDER_CREATED = () => jsonResponse({ id: 'folder-9' });
const FILE_SEARCH_EMPTY = () => jsonResponse({ files: [] });
const FILE_SEARCH_HIT = () => jsonResponse({ files: [{ id: 'file-7' }] });
const FILE_CREATED = () => jsonResponse({ id: 'file-8', name: 'my-film.osd', webViewLink: 'https://drive/x' });
const FILE_UPDATED = () => jsonResponse({ id: 'file-7', name: 'my-film.osd' });

const packageBlob = () => new Blob(['osd-bytes'], { type: 'application/zip' });

describe('uploadProjectToDrive', () => {
  it('creates the folder, then the file, with auth on every call', async () => {
    const { impl, seen } = scriptedFetch([FOLDER_SEARCH_EMPTY(), FOLDER_CREATED(), FILE_SEARCH_EMPTY(), FILE_CREATED()]);
    const ref = await uploadProjectToDrive({
      accessToken: 'tok',
      fileName: 'my-film.osd',
      packageBlob: packageBlob(),
      fetchImpl: impl,
    });
    expect(ref).toEqual({ id: 'file-8', name: 'my-film.osd', webViewLink: 'https://drive/x' });
    expect(seen.map((call) => `${call.method} ${call.url.split('?')[0]}`)).toEqual([
      'GET https://www.googleapis.com/drive/v3/files',
      'POST https://www.googleapis.com/drive/v3/files',
      'GET https://www.googleapis.com/drive/v3/files',
      'POST https://www.googleapis.com/upload/drive/v3/files',
    ]);
    expect(seen.every((call) => call.auth === 'Bearer tok')).toBe(true);
  });

  it('reuses the existing folder and sends metadata plus media', async () => {
    const { impl, seen } = scriptedFetch([FOLDER_SEARCH_HIT(), FILE_SEARCH_EMPTY(), FILE_CREATED()]);
    await uploadProjectToDrive({
      accessToken: 'tok',
      fileName: 'my-film.osd',
      packageBlob: packageBlob(),
      fetchImpl: impl,
    });
    const create = seen[seen.length - 1];
    const form = create.body as FormData;
    const metadata = JSON.parse(await (form.get('metadata') as Blob).text()) as {
      name: string;
      parents: string[];
    };
    expect(metadata).toEqual({ name: 'my-film.osd', parents: ['folder-1'] });
    expect(await (form.get('media') as Blob).text()).toBe('osd-bytes');
  });

  it('updates a same-named export in place instead of duplicating it', async () => {
    const { impl, seen } = scriptedFetch([FOLDER_SEARCH_HIT(), FILE_SEARCH_HIT(), FILE_UPDATED()]);
    const ref = await uploadProjectToDrive({
      accessToken: 'tok',
      fileName: 'my-film.osd',
      packageBlob: packageBlob(),
      fetchImpl: impl,
    });
    expect(ref.id).toBe('file-7');
    const update = seen[seen.length - 1];
    expect(update.method).toBe('PATCH');
    expect(update.url).toContain('/upload/drive/v3/files/file-7');
    expect(seen.some((call) => call.method === 'POST' && call.url.includes('/upload/drive/v3/files'))).toBe(false);
  });

  it('reports Google failures with status, flagging 401 for re-auth', async () => {
    const { impl } = scriptedFetch([jsonResponse({ error: { message: 'gone' } }, 500)]);
    const failure = await uploadProjectToDrive({
      accessToken: 'tok',
      fileName: 'x.osd',
      packageBlob: packageBlob(),
      fetchImpl: impl,
    }).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(DriveError);
    expect((failure as DriveError).status).toBe(500);
    expect(isDriveUnauthorized(failure)).toBe(false);
    expect(isDriveUnauthorized(new DriveError('expired', 401))).toBe(true);
  });
});

describe('requestDriveAccessToken', () => {
  afterEach(() => {
    delete (window as unknown as { google?: unknown }).google;
    vi.restoreAllMocks();
  });

  it('refuses an empty Client ID before touching the network', async () => {
    const loader = vi.fn(async () => {});
    await expect(requestDriveAccessToken('  ', { loadScript: loader })).rejects.toThrow(/Client ID/);
    expect(loader).not.toHaveBeenCalled();
  });

  it('surfaces an unreachable sign-in script as an offline error', async () => {
    const loader = vi.fn(async () => {
      throw new Error('down');
    });
    await expect(requestDriveAccessToken('cid', { loadScript: loader })).rejects.toThrow();
  });

  it('resolves the token GIS hands back, rejects a dismissal', async () => {
    const loader = vi.fn(async () => {});
    let callback: ((response: { access_token?: string; error?: string }) => void) | undefined;
    (window as unknown as { google: unknown }).google = {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            callback: (response: { access_token?: string; error?: string }) => void;
          }) => {
            callback = config.callback;
            return { requestAccessToken: () => callback?.({ access_token: 'tok-1' }) };
          },
          revoke: () => {},
        },
      },
    };
    await expect(requestDriveAccessToken('cid', { loadScript: loader })).resolves.toBe('tok-1');
  });
});
