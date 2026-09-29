/**
 * WebDAV adapter tests: the whole server is a scripted fetch double. Nextcloud
 * answers PROPFIND with XML, and a wrong Depth header or a mangled href comes
 * back as an empty folder — the one failure the user cannot tell apart from
 * "no backups yet". So the request shape and the XML parsing are the tests.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  WebdavError,
  downloadWebdavPackage,
  isWebdavUnauthorized,
  listWebdavPackages,
  uploadWebdavPackage,
  type WebdavConfig,
} from '../webdav';

interface SeenRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: BodyInit | null | undefined;
}

const scriptedFetch = (answers: Response[]) => {
  const seen: SeenRequest[] = [];
  const impl = vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    const headers: Record<string, string> = {};
    const raw = init?.headers as Record<string, string> | undefined;
    if (raw) for (const [key, value] of Object.entries(raw)) headers[key] = value;
    seen.push({ url, method: init?.method ?? 'GET', headers, body: init?.body as BodyInit | null | undefined });
    const next = answers.shift();
    if (!next) throw new Error(`unexpected request to ${url}`);
    return next;
  });
  return { impl: impl as unknown as typeof fetch, seen };
};

const CONFIG: WebdavConfig = {
  baseUrl: 'https://cloud.example.com/remote.php/dav/files/alex',
  username: 'alex',
  password: 'app-password',
};

const FOLDER = 'https://cloud.example.com/remote.php/dav/files/alex/OpenShotDesigner/';

const PROPFIND_XML = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/remote.php/dav/files/alex/OpenShotDesigner/</d:href>
    <d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/dav/files/alex/OpenShotDesigner/my-film.osd</d:href>
    <d:propstat><d:prop><d:getcontentlength>12345</d:getcontentlength></d:prop></d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/dav/files/alex/OpenShotDesigner/notes.txt</d:href>
    <d:propstat><d:prop><d:getcontentlength>12</d:getcontentlength></d:prop></d:propstat>
  </d:response>
</d:multistatus>`;

describe('uploadWebdavPackage', () => {
  it('creates the folder on 404, then PUTs with auth and zip type', async () => {
    const { impl, seen } = scriptedFetch([
      new Response('missing', { status: 404 }),
      new Response('', { status: 201 }),
      new Response('', { status: 201 }),
    ]);
    await uploadWebdavPackage(CONFIG, 'my-film.osd', new Blob(['osd-bytes']), impl);
    expect(seen.map((call) => call.method)).toEqual(['PROPFIND', 'MKCOL', 'PUT']);
    expect(seen[2].url).toBe(`${FOLDER}my-film.osd`);
    expect(seen[2].headers['Authorization']).toMatch(/^Basic /);
    expect(seen[2].headers['Content-Type']).toBe('application/zip');
    expect(await (seen[2].body as Blob).text()).toBe('osd-bytes');
    expect(seen[0].headers['Depth']).toBe('0');
  });

  it('skips MKCOL when the folder is already there', async () => {
    const { impl, seen } = scriptedFetch([
      new Response(PROPFIND_XML, { status: 207 }),
      new Response('', { status: 201 }),
    ]);
    await uploadWebdavPackage(CONFIG, 'my-film.osd', new Blob(['x']), impl);
    expect(seen.map((call) => call.method)).toEqual(['PROPFIND', 'PUT']);
  });

  it('flags 401 for re-auth and reports the rest with status', async () => {
    const { impl } = scriptedFetch([new Response('denied', { status: 401 })]);
    const failure = await uploadWebdavPackage(CONFIG, 'x.osd', new Blob(['x']), impl).then(
      () => null,
      (error: unknown) => error,
    );
    expect(isWebdavUnauthorized(failure)).toBe(true);
    expect(isWebdavUnauthorized(new WebdavError('boom', 500))).toBe(false);
  });

  it('refuses nonsense config before any request', async () => {
    const { impl } = scriptedFetch([]);
    await expect(
      uploadWebdavPackage({ baseUrl: '', username: '', password: '' }, 'x.osd', new Blob(['x']), impl),
    ).rejects.toThrow(/required/);
    await expect(
      uploadWebdavPackage({ ...CONFIG, baseUrl: 'ftp://x' }, 'x.osd', new Blob(['x']), impl),
    ).rejects.toThrow(/http/);
    expect(impl).not.toHaveBeenCalled();
  });
});

describe('listWebdavPackages', () => {
  it('parses the multistatus, skipping the folder itself and non-packages', async () => {
    const { impl, seen } = scriptedFetch([
      new Response(PROPFIND_XML, { status: 207 }),
      new Response(PROPFIND_XML, { status: 207 }),
    ]);
    const files = await listWebdavPackages(CONFIG, impl);
    expect(files).toEqual([{ name: 'my-film.osd', href: 'my-film.osd', size: 12345 }]);
    expect(seen[1].headers['Depth']).toBe('1');
  });
});

describe('downloadWebdavPackage', () => {
  it('hands back the bytes with auth', async () => {
    const { impl, seen } = scriptedFetch([new Response('osd-bytes', { status: 200 })]);
    const blob = await downloadWebdavPackage(CONFIG, 'my-film.osd', impl);
    expect(await blob.text()).toBe('osd-bytes');
    expect(seen[0].url).toBe(`${FOLDER}my-film.osd`);
    expect(seen[0].headers['Authorization']).toMatch(/^Basic /);
  });

  it('reports a missing backup with status', async () => {
    const { impl } = scriptedFetch([new Response('nope', { status: 404 })]);
    const failure = await downloadWebdavPackage(CONFIG, 'gone.osd', impl).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(WebdavError);
    expect((failure as WebdavError).status).toBe(404);
  });
});
