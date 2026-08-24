/**
 * The download path, which nothing exercised before this file.
 *
 * Everything that leaves this app as a file goes through here: the shot list,
 * the equipment manifest, the budget, the contacts CSV, the screenplay, the
 * project JSON, the project package, and the two continuity exports that
 * another program has to parse byte-for-byte.
 *
 * All of it was untested, and all of its failure modes are silent — a
 * download that does not fire, a filename the filesystem mangles, a byte-order
 * mark in the one file that must not have one. None of those raise an error
 * anywhere; they surface as "the button does nothing" or "Resolve imported and
 * populated nothing", days later, on someone else's machine.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob, downloadCsv, downloadText, safeFileName } from '../download';

/** Everything the browser was handed, in order. */
interface Captured {
  filename: string;
  blob: Blob;
  /** Whether the anchor was in the document at the moment it was clicked. */
  attachedWhenClicked: boolean;
}

let captured: Captured[] = [];
let revoked: string[] = [];
let created: string[] = [];

beforeEach(() => {
  captured = [];
  revoked = [];
  created = [];

  // jsdom implements neither of these.
  let counter = 0;
  URL.createObjectURL = vi.fn((blob: Blob) => {
    const url = `blob:test/${(counter += 1)}`;
    created.push(url);
    // Held so the click handler below can read the bytes back.
    blobsByUrl.set(url, blob);
    return url;
  });
  URL.revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url);
  });

  // jsdom's `HTMLAnchorElement.click()` does nothing useful, so the capture
  // happens here. `isConnected` is read at CLICK time, which is the whole
  // point: a detached anchor does not download in Firefox.
  HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
    captured.push({
      filename: this.download,
      blob: blobsByUrl.get(this.href) as Blob,
      attachedWhenClicked: this.isConnected,
    });
  };
});

const blobsByUrl = new Map<string, Blob>();

afterEach(() => {
  vi.restoreAllMocks();
  blobsByUrl.clear();
});

/**
 * Read a captured file back as BOTH decoded text and raw bytes.
 *
 * `Blob.text()` runs the WHATWG UTF-8 decode, which STRIPS a leading
 * byte-order mark — so a test that checks for a BOM through `.text()` can
 * never see one, and would pass just as happily against code that writes none.
 * The BOM assertions therefore go through `bytes`.
 */
const readFile = async (file: Captured) => ({
  ...file,
  text: await file.blob.text(),
  bytes: new Uint8Array(await file.blob.arrayBuffer()),
});

const onlyFile = async () => {
  expect(captured).toHaveLength(1);
  return readFile(captured[0]);
};

/** The three bytes a UTF-8 BOM is written as. */
const startsWithBom = (bytes: Uint8Array): boolean =>
  bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;

describe('safeFileName', () => {
  it('replaces every character a filesystem refuses', () => {
    // The bug this exists for: the project JSON and Fountain exports sanitised
    // whitespace and nothing else, so this title produced a download name
    // containing a slash, a colon and quotes.
    expect(safeFileName('Ocean’s 11: Director/Draft "2"', 'project')).toBe(
      'Ocean’s_11_Director_Draft_2',
    );
  });

  it('collapses a run of illegal characters to one underscore', () => {
    expect(safeFileName('A???B', 'x')).toBe('A_B');
    expect(safeFileName('A   B', 'x')).toBe('A_B');
  });

  it('trims leading and trailing dots and underscores', () => {
    // A leading dot hides the file on Unix; a trailing one is invalid on Windows.
    expect(safeFileName('...hidden...', 'x')).toBe('hidden');
    expect(safeFileName('/leading', 'x')).toBe('leading');
  });

  it('falls back when the name sanitises away to nothing', () => {
    expect(safeFileName('', 'Untitled')).toBe('Untitled');
    expect(safeFileName('   ', 'Untitled')).toBe('Untitled');
    expect(safeFileName('///', 'Untitled')).toBe('Untitled');
    expect(safeFileName(undefined, 'Untitled')).toBe('Untitled');
  });

  it('keeps letters outside ASCII', () => {
    // Transliterating these to underscores would make the file unfindable by
    // the person who named it.
    expect(safeFileName('Les Misérables', 'x')).toBe('Les_Misérables');
    expect(safeFileName('東京物語', 'x')).toBe('東京物語');
  });

  it('keeps digits and hyphens, which a broken character range would eat', () => {
    // `[ -<]` spans U+0020 to U+003C and swallows every digit; this is the
    // regression for that.
    expect(safeFileName('Day 2 - 2026-08-24', 'x')).toBe('Day_2_-_2026-08-24');
  });
});

describe('downloadBlob', () => {
  it('attaches the anchor to the document before clicking it', async () => {
    // The Firefox bug. Three export paths created a detached anchor, so their
    // downloads silently did nothing there — no error, no file.
    downloadBlob(new Blob(['hello']), 'greeting.txt');
    expect((await onlyFile()).attachedWhenClicked).toBe(true);
  });

  it('removes the anchor again', () => {
    downloadBlob(new Blob(['hello']), 'greeting.txt');
    expect(document.querySelectorAll('a[download]')).toHaveLength(0);
  });

  it('revokes the object URL it created', () => {
    downloadBlob(new Blob(['hello']), 'greeting.txt');
    expect(revoked).toEqual(created);
  });

  it('revokes the object URL even when the click throws', () => {
    // Otherwise a failure leaks the blob for the life of the tab.
    HTMLAnchorElement.prototype.click = function click() {
      throw new Error('popup blocked');
    };
    expect(() => downloadBlob(new Blob(['hello']), 'greeting.txt')).toThrow('popup blocked');
    expect(revoked).toEqual(created);
    expect(document.querySelectorAll('a[download]')).toHaveLength(0);
  });

  it('hands over the filename it was given, unchanged', async () => {
    downloadBlob(new Blob(['x']), 'Already_Safe.csv');
    expect((await onlyFile()).filename).toBe('Already_Safe.csv');
  });
});

describe('downloadText', () => {
  it('writes the text as given', async () => {
    downloadText('line one\r\nline two', 'notes.txt');
    expect((await onlyFile()).text).toBe('line one\r\nline two');
  });

  it('writes no byte-order mark by default', async () => {
    const file = await onlyFileAfter(() => downloadText('File Name,Scene', 'meta.csv'));
    expect(startsWithBom(file.bytes)).toBe(false);
    expect(file.text.startsWith('File Name')).toBe(true);
  });

  it('writes one when asked', async () => {
    const file = await onlyFileAfter(() =>
      downloadText('Name,Rate', 'budget.csv', { bom: true }),
    );
    expect(startsWithBom(file.bytes)).toBe(true);
  });

  it('defaults to a plain-text MIME type', async () => {
    expect((await onlyFileAfter(() => downloadText('x', 'a.txt'))).blob.type).toBe(
      'text/plain;charset=utf-8',
    );
  });
});

/** Run `fn`, then read back the single file it produced. */
const onlyFileAfter = async (fn: () => void) => {
  captured = [];
  fn();
  expect(captured).toHaveLength(1);
  return readFile(captured[0]);
};

describe('downloadCsv', () => {
  it('marks the file as CSV', async () => {
    const file = await onlyFileAfter(() =>
      downloadCsv('a,b', 'x.csv', { excelBom: false }),
    );
    expect(file.blob.type).toBe('text/csv;charset=utf-8;');
  });

  it('omits the BOM for a machine-parsed export', async () => {
    /**
     * The DaVinci Resolve contract, and the reason `excelBom` is a required
     * argument rather than a default. With a BOM the first header arrives as
     * an invisible U+FEFF glued to "File Name", it matches no column, and
     * Resolve imports nothing while reporting success.
     */
    const file = await onlyFileAfter(() =>
      downloadCsv('File Name,Scene\nA001C001.mov,4', 'resolve.csv', { excelBom: false }),
    );
    expect(file.text.startsWith('File Name,')).toBe(true);
  });

  it('includes the BOM for a spreadsheet export', async () => {
    // Without one Excel guesses the encoding, and a euro sign or an accented
    // crew name comes out as mojibake.
    const file = await onlyFileAfter(() =>
      downloadCsv('Role,Rate\nGaffer,€450', 'budget.csv', { excelBom: true }),
    );
    expect(startsWithBom(file.bytes)).toBe(true);
    // The euro sign still survives the round trip intact behind the mark.
    expect(file.text).toContain('€450');
  });

  it('preserves CRLF, which several exports depend on', async () => {
    const file = await onlyFileAfter(() =>
      downloadCsv('a,b\r\n1,2\r\n', 'x.csv', { excelBom: false }),
    );
    expect(file.text).toBe('a,b\r\n1,2\r\n');
  });
});
