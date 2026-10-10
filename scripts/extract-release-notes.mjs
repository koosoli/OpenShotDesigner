// Prints the CHANGELOG.md section for a given version to stdout.
// Usage: node scripts/extract-release-notes.mjs 1.0.0  (leading "v" optional)
// Used by .github/workflows/release.yml so the GitHub Release body always
// matches the changelog. Exits non-zero when the version has no section.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const raw = process.argv[2] ?? '';
const version = raw.replace(/^v/, '');
if (!version) {
  console.error('Usage: node scripts/extract-release-notes.mjs <version>');
  process.exit(1);
}

const changelog = readFileSync(resolve(rootDir, 'CHANGELOG.md'), 'utf8');
const lines = changelog.split('\n');
const header = `## [${version}]`;
const start = lines.findIndex((line) => line.startsWith(header));
if (start === -1) {
  console.error(`No ${header} section in CHANGELOG.md`);
  process.exit(1);
}
let end = lines.findIndex(
  (line, index) => index > start && line.startsWith('## '),
);
if (end === -1) end = lines.length;
process.stdout.write(`${lines.slice(start, end).join('\n').trim()}\n`);
