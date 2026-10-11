import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const assetDir = join(process.cwd(), 'dist', 'assets');
// The entry is what every visit downloads before the app can paint. 362 KiB
// after the dashboard, quick search, on-set mode and DMX view went lazy
// (2026-10-11); the budget leaves headroom but catches a module sliding back in.
const MAX_ENTRY_BYTES = 420_000;
const files = await readdir(assetDir);
const entries = await Promise.all(
  files
    .filter((name) => /^index-.*\.js$/.test(name))
    .map(async (name) => ({ name, bytes: (await stat(join(assetDir, name))).size })),
);

if (!entries.length) throw new Error('No built entry bundle found in dist/assets. Run the build first.');
const largest = entries.sort((a, b) => b.bytes - a.bytes)[0];
console.log(`Largest entry bundle: ${largest.name} (${(largest.bytes / 1024).toFixed(1)} KiB)`);
if (largest.bytes > MAX_ENTRY_BYTES) {
  throw new Error(
    `Entry bundle exceeds ${(MAX_ENTRY_BYTES / 1024).toFixed(0)} KiB budget by ${((largest.bytes - MAX_ENTRY_BYTES) / 1024).toFixed(1)} KiB.`,
  );
}
