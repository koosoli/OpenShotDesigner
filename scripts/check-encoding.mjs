/**
 * Fail CI when a source file contains double-encoded UTF-8 ("mojibake") or a
 * byte-order mark. Both are the signature of a file round-tripped through a
 * Windows-1252 decode; on screen a degree sign or em dash turns into two or
 * three Latin-1 letters (A-circumflex / a-circumflex followed by symbols).
 *
 * Usage: node scripts/check-encoding.mjs [--fix-bom]
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOTS = ['src', 'docs', 'public', 'scripts', 'index.html', 'README.md', 'AGENTS.md'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.css', '.html', '.md', '.json']);
// Built from escapes so this file never trips its own check:
//  U+00C3 followed by a Latin-1 / cp1252 symbol  (e.g. "×", "é" double-encoded)
//  U+00C2 followed by a Latin-1 symbol            (e.g. "°", "·", "§")
//  U+00E2 followed by cp1252 0x80-0xBF glyphs      (e.g. "—", "…", curly quotes)
//  U+00F0 U+0178                                   (4-byte emoji lead)
const MOJIBAKE = new RegExp(
  '\\u00C3[\\u0080-\\u00BF\\u20AC\\u201A\\u0192\\u201E\\u2026\\u2020\\u2021\\u02C6\\u2030\\u0160\\u2039\\u0152\\u017D\\u2018\\u2019\\u201C\\u201D\\u2022\\u2013\\u2014\\u02DC\\u2122\\u0161\\u203A\\u0153\\u017E\\u0178]' +
    '|\\u00C2[\\u00A0-\\u00BF]' +
    '|\\u00E2[\\u20AC\\u201A\\u0192\\u201E\\u2026\\u2020\\u2021\\u02C6\\u2030\\u0160\\u2039\\u0152\\u017D\\u2018\\u2019\\u201C\\u201D\\u2022\\u2013\\u2014\\u02DC\\u2122\\u0161\\u203A\\u0153\\u017E\\u0178\\u0080-\\u00BF]' +
    '|\\u00F0\\u0178',
);
const fixBom = process.argv.includes('--fix-bom');

const walk = (entry, out = []) => {
  const full = path.resolve(entry);
  let stats;
  try {
    stats = statSync(full);
  } catch {
    return out;
  }
  if (stats.isDirectory()) {
    for (const child of readdirSync(full)) {
      if (child === 'node_modules' || child === 'generated') continue;
      walk(path.join(full, child), out);
    }
  } else if (EXTENSIONS.has(path.extname(full))) {
    out.push(full);
  }
  return out;
};

let failures = 0;
for (const file of ROOTS.flatMap((root) => walk(root))) {
  let text = readFileSync(file, 'utf8');
  if (text.charCodeAt(0) === 0xfeff) {
    if (fixBom) {
      text = text.slice(1);
      writeFileSync(file, text, 'utf8');
      console.log(`stripped BOM: ${path.relative(process.cwd(), file)}`);
    } else {
      failures += 1;
      console.error(`BOM present: ${path.relative(process.cwd(), file)} (run with --fix-bom)`);
    }
  }
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    if (MOJIBAKE.test(line)) {
      failures += 1;
      console.error(`mojibake: ${path.relative(process.cwd(), file)}:${index + 1}: ${line.trim().slice(0, 80)}`);
    }
  });
}

if (failures > 0) {
  console.error(`\n${failures} encoding problem(s) found.`);
  process.exit(1);
}
console.log('Encoding check passed.');
