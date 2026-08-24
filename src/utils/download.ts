/**
 * Handing a generated file to the browser.
 *
 * Nine places did this, each with its own copy, and comparing them is how the
 * two defects below were found. The mechanics look trivial — make a Blob, make
 * an anchor, click it — which is exactly why nine slightly different versions
 * accumulated and why nothing tested any of them.
 *
 * ## The anchor must be in the document before it is clicked
 *
 * Three of the nine created a detached `<a>` and called `.click()` on it.
 * Chrome tolerates that; **Firefox does not fire the download at all**. So the
 * contacts CSV, the Fountain screenplay and the AV-script CSV exported nothing
 * in Firefox, silently — no error, no file, nothing to report as a bug beyond
 * "the button does nothing".
 *
 * ## Filenames have to survive the filesystem
 *
 * Two of the nine sanitised only whitespace, so a project called
 * `Ocean's 11: Director/Draft "2"` produced a download name containing `/`,
 * `:` and `"`. Those are illegal on Windows and `/` reads as a path separator;
 * the browser mangles the name or refuses the download. `safeFileName` is the
 * one rule now, and it is tested against those characters.
 *
 * ## The BOM is a per-format decision, never a default
 *
 * A UTF-8 byte-order mark is REQUIRED for Excel to read a CSV as UTF-8 — money
 * columns with euro signs and crew names with accents come out as mojibake
 * without one — and is FATAL for the DaVinci Resolve metadata import, where it
 * glues an invisible U+FEFF to the first header so `File Name` no longer
 * matches and Resolve imports nothing while reporting success.
 *
 * Both failures are silent. So `bom` is an explicit argument with no sensible
 * default, and every caller states which world its file is going into.
 */

/** U+FEFF, written as an escape: a literal one in source is invisible. */
const BYTE_ORDER_MARK = '\uFEFF';

/**
 * Characters no filesystem in common use will accept, plus control codes.
 *
 * Written with explicit escapes rather than a range like `[ -<]`, which spans
 * U+0020 to U+003C and would quietly swallow every digit and most punctuation.
 *
 * `no-control-regex` is disabled deliberately. The rule exists because a
 * control character in a pattern is nearly always a typo; stripping them from
 * a filename is the one case where matching them is the entire point. A title
 * pasted from another document can carry them, and a control character in a
 * `download` attribute is exactly what a filesystem will not take.
 */
// eslint-disable-next-line no-control-regex
const ILLEGAL_FILENAME = /[\u0000-\u001f<>:"/\\|?*]+/g;

/**
 * A filename fragment that is safe on Windows, macOS and Linux.
 *
 * Runs of illegal or separator characters collapse to a single underscore
 * rather than one each, so `Draft "2"` becomes `Draft_2` and not `Draft__2_`.
 * Leading and trailing underscores and dots are trimmed — a name beginning
 * with a dot is hidden on Unix, and a name ending in one is invalid on
 * Windows. An input that sanitises away to nothing returns `fallback`, so a
 * project nobody has titled yet still exports as something openable.
 *
 * Letters outside ASCII are KEPT. Every filesystem in use has handled UTF-8
 * names for twenty years, and transliterating a Japanese or Greek title into
 * underscores would make the file unfindable by the person who named it.
 */
export const safeFileName = (raw: string | undefined, fallback: string): string => {
  const cleaned = (raw ?? '')
    .replace(ILLEGAL_FILENAME, '_')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^[._]+|[._]+$/g, '')
    .trim();
  return cleaned === '' ? fallback : cleaned;
};

export interface DownloadOptions {
  /**
   * Prepend a UTF-8 byte-order mark.
   *
   * `true` for anything a user will open in Excel. `false` for anything
   * another program parses by exact header match — above all the Resolve
   * metadata CSV, which imports nothing at all when a BOM is present.
   */
  bom?: boolean;
  /** MIME type. Defaults to `text/plain;charset=utf-8`. */
  type?: string;
}

/**
 * The anchor click, in one place.
 *
 * Attached to the document before the click and removed after, because a
 * detached anchor does not download in Firefox. The object URL is revoked in a
 * `finally`, so a throw between creating it and clicking cannot leak it —
 * revoking after `click()` is safe: the browser has already taken its own
 * reference to the blob by then.
 */
export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  try {
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
};

/** Write `text` as a file and hand it to the browser. */
export const downloadText = (
  text: string,
  filename: string,
  { bom = false, type = 'text/plain;charset=utf-8' }: DownloadOptions = {},
): void => {
  downloadBlob(new Blob([bom ? `${BYTE_ORDER_MARK}${text}` : text], { type }), filename);
};

/**
 * A CSV, with the BOM decision made explicitly at the call site.
 *
 * Separate from `downloadText` so the choice cannot be forgotten: both ways of
 * getting it wrong are invisible until someone opens the file somewhere else.
 */
export const downloadCsv = (
  text: string,
  filename: string,
  { excelBom }: { excelBom: boolean },
): void => downloadText(text, filename, { bom: excelBom, type: 'text/csv;charset=utf-8;' });
