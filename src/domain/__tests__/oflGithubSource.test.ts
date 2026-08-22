import { afterEach, describe, it, expect, vi } from 'vitest';
import { fetchOflFixtures, fetchOflManufacturers, fetchOflTree, toOflDump } from '../fixtures';
import type { OflTreeEntry } from '../fixtures';

const treeResponse = (extra: Record<string, unknown> = {}) =>
  new Response(
    JSON.stringify({
      truncated: false,
      tree: [
        { path: 'fixtures/manufacturers.json', type: 'blob', sha: 'man1' },
        { path: 'fixtures/arri/skypanel-s60c.json', type: 'blob', sha: 'aaa' },
        { path: 'fixtures/aputure/ls-600d-pro.json', type: 'blob', sha: 'bbb' },
        { path: 'fixtures/arri', type: 'tree', sha: 'ttt' },
        { path: 'schemas/fixture.json', type: 'blob', sha: 'sss' },
        { path: 'fixtures/arri/nested/deep.json', type: 'blob', sha: 'ddd' },
        ...(extra.tree as unknown[] ?? []),
      ],
      ...extra,
    }),
    { status: 200 },
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchOflTree', () => {
  it('keeps only fixture blobs and records their SHAs', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => treeResponse()));
    const tree = await fetchOflTree();
    expect(tree.entries.map((e) => e.path)).toEqual([
      'fixtures/arri/skypanel-s60c.json',
      'fixtures/aputure/ls-600d-pro.json',
    ]);
    expect(tree.entries[0]).toMatchObject({ manufacturerKey: 'arri', fixtureKey: 'skypanel-s60c', sha: 'aaa' });
    expect(tree.manufacturersSha).toBe('man1');
  });

  it('refuses a truncated listing and reports HTTP failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => treeResponse({ truncated: true })));
    await expect(fetchOflTree()).rejects.toThrow(/truncated/i);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    await expect(fetchOflTree()).rejects.toThrow(/503/);
  });
});

describe('fetchOflManufacturers', () => {
  it('maps keys to display names and skips $schema', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      $schema: 'x',
      arri: { name: 'ARRI' },
      aputure: { name: 'Aputure' },
      broken: { noName: true },
    }), { status: 200 })));
    await expect(fetchOflManufacturers()).resolves.toEqual({ arri: 'ARRI', aputure: 'Aputure' });
  });
});

describe('fetchOflFixtures', () => {
  const entries: OflTreeEntry[] = [
    { path: 'fixtures/arri/a.json', sha: '1', manufacturerKey: 'arri', fixtureKey: 'a' },
    { path: 'fixtures/arri/b.json', sha: '2', manufacturerKey: 'arri', fixtureKey: 'b' },
    { path: 'fixtures/arri/c.json', sha: '3', manufacturerKey: 'arri', fixtureKey: 'c' },
  ];

  it('downloads every file, reports progress and survives individual failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.endsWith('b.json') ? new Response('', { status: 404 }) : new Response(JSON.stringify({ name: url.slice(-6) }), { status: 200 }),
    ));
    const progress: number[] = [];
    const { fixtures, failed } = await fetchOflFixtures(entries, { onProgress: (done, total) => progress.push(done / total) });
    expect(fixtures).toHaveLength(2);
    expect(failed).toBe(1);
    expect(progress[progress.length - 1]).toBe(1);
  });

  it('handles an empty work list without hanging', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(fetchOflFixtures([])).resolves.toEqual({ fixtures: [], failed: 0 });
  });
});

describe('toOflDump', () => {
  it('nests by manufacturer key and injects the display name', () => {
    const dump = toOflDump(
      [
        { entry: { path: 'p', sha: '1', manufacturerKey: 'arri', fixtureKey: 'skypanel' }, json: { name: 'SkyPanel' } },
        { entry: { path: 'q', sha: '2', manufacturerKey: 'nolabel', fixtureKey: 'thing' }, json: { name: 'Thing' } },
      ],
      { arri: 'ARRI' },
    );
    expect(dump).toEqual({
      arri: { skypanel: { name: 'SkyPanel', manufacturer: 'ARRI' } },
      nolabel: { thing: { name: 'Thing', manufacturer: 'nolabel' } },
    });
  });
});
