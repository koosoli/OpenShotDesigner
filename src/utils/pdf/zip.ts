/**
 * Bundling finished PDFs for future Production Packs.
 *
 * `zipPdfs` takes already-rendered documents (name -> bytes) and returns a
 * ZIP archive via fflate, offline and without workers. Names are sorted so
 * the archive layout is deterministic for the same input set.
 */

import { zipSync } from 'fflate';

const hasUnsafeSegment = (name: string): boolean =>
  name === '' || name.startsWith('/') || name.includes('..') || name.includes('\\');

/**
 * Zip rendered PDFs. Throws on an empty set (a pack with no documents is a
 * caller bug, not an empty archive) and on names that could escape the
 * archive directory. Never mutates the input.
 */
export const zipPdfs = (files: Record<string, Uint8Array>): Uint8Array => {
  const names = Object.keys(files).sort();
  if (names.length === 0) throw new Error('zipPdfs requires at least one file.');
  for (const name of names) {
    if (hasUnsafeSegment(name)) throw new Error(`zipPdfs refuses unsafe archive name: ${name}`);
  }
  const ordered: Record<string, Uint8Array> = {};
  for (const name of names) ordered[name] = files[name];
  return zipSync(ordered, { level: 6 });
};
