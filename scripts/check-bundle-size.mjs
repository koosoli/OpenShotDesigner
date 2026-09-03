import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const assetDir = join(process.cwd(), 'dist', 'assets');
const MAX_ENTRY_BYTES = 1_050_000;
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
