/**
 * Live Open Fixture Library source (plan §17.3, rule 29: explicit provider
 * adapter; rule 30: degrade gracefully offline).
 *
 * OFL's own `download.ofl` endpoint sends no CORS headers, so a browser cannot
 * read it. The library's fixtures are authored in the public OFL repository,
 * which IS readable cross-origin (GitHub API for the file tree, jsDelivr's CDN
 * for the file bodies). We therefore sync from the repository — the same data,
 * at its newest, straight from the source of truth.
 *
 * The sync is incremental: every file's git blob SHA is stored alongside the
 * snapshot, so a later refresh only downloads fixtures that actually changed.
 */


const TREE_URL = 'https://api.github.com/repos/OpenLightingProject/open-fixture-library/git/trees/master?recursive=1';
const RAW_BASE = 'https://cdn.jsdelivr.net/gh/OpenLightingProject/open-fixture-library@master/';
const FIXTURE_PATH_RE = /^fixtures\/([^/]+)\/([^/]+)\.json$/;
const MANUFACTURERS_PATH = 'fixtures/manufacturers.json';
const CONCURRENCY = 16;
const TREE_TIMEOUT_MS = 15000;
const FILE_TIMEOUT_MS = 20000;

export const OFL_ATTRIBUTION = 'Fixture data from the Open Fixture Library project (open-fixture-library.org) — see the repository LICENSE for terms.';

export interface OflTreeEntry {
  path: string;
  sha: string;
  manufacturerKey: string;
  fixtureKey: string;
}

export interface OflTree {
  entries: OflTreeEntry[];
  manufacturersSha?: string;
}

const timeout = (ms: number): AbortSignal | undefined =>
  typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(ms) : undefined;

/** List every fixture file in the repository with its blob SHA. */
export const fetchOflTree = async (): Promise<OflTree> => {
  const response = await fetch(TREE_URL, { signal: timeout(TREE_TIMEOUT_MS), headers: { accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new Error(`GitHub answered HTTP ${response.status}`);
  const json = (await response.json()) as { tree?: Array<{ path: string; type: string; sha: string }>; truncated?: boolean };
  if (json.truncated) throw new Error('The repository listing was truncated by GitHub');
  const entries: OflTreeEntry[] = [];
  let manufacturersSha: string | undefined;
  for (const node of json.tree ?? []) {
    if (node.type !== 'blob') continue;
    if (node.path === MANUFACTURERS_PATH) {
      manufacturersSha = node.sha;
      continue;
    }
    const match = FIXTURE_PATH_RE.exec(node.path);
    if (!match) continue;
    entries.push({ path: node.path, sha: node.sha, manufacturerKey: match[1], fixtureKey: match[2] });
  }
  if (entries.length === 0) throw new Error('No fixture files found in the repository listing');
  return { entries, manufacturersSha };
};

const fetchJson = async (path: string): Promise<unknown> => {
  const response = await fetch(RAW_BASE + path, { signal: timeout(FILE_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${path}`);
  return response.json();
};

/** Manufacturer key → display name (falls back to the key when absent). */
export const fetchOflManufacturers = async (): Promise<Record<string, string>> => {
  const json = (await fetchJson(MANUFACTURERS_PATH)) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(json)) {
    if (key.startsWith('$')) continue;
    if (value && typeof value === 'object' && typeof (value as { name?: unknown }).name === 'string') {
      out[key] = (value as { name: string }).name;
    }
  }
  return out;
};

/**
 * Download the given fixture files with bounded concurrency.
 * Individual failures are reported, never thrown — a partial refresh still
 * improves the catalog.
 */
export const fetchOflFixtures = async (
  entries: readonly OflTreeEntry[],
  options: { onProgress?: (done: number, total: number) => void } = {},
): Promise<{ fixtures: Array<{ entry: OflTreeEntry; json: Record<string, unknown> }>; failed: number }> => {
  const results: Array<{ entry: OflTreeEntry; json: Record<string, unknown> }> = [];
  let failed = 0;
  let done = 0;
  let cursor = 0;

  const worker = async () => {
    while (cursor < entries.length) {
      const entry = entries[cursor++];
      try {
        const json = (await fetchJson(entry.path)) as Record<string, unknown>;
        if (json && typeof json === 'object') results.push({ entry, json });
        else failed += 1;
      } catch {
        failed += 1;
      }
      done += 1;
      options.onProgress?.(done, entries.length);
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, entries.length) }, worker));
  return { fixtures: results, failed };
};

/** Adapter input shape: `{ manufacturerKey: { fixtureKey: json } }` with display names injected. */
export const toOflDump = (
  fixtures: ReadonlyArray<{ entry: OflTreeEntry; json: Record<string, unknown> }>,
  manufacturerNames: Record<string, string>,
): Record<string, unknown> => {
  const dump: Record<string, Record<string, unknown>> = {};
  for (const { entry, json } of fixtures) {
    const group = dump[entry.manufacturerKey] ?? (dump[entry.manufacturerKey] = {});
    group[entry.fixtureKey] = { ...json, manufacturer: manufacturerNames[entry.manufacturerKey] ?? entry.manufacturerKey };
  }
  return dump;
};
