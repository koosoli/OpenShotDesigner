/**
 * Unicode policy for client-side PDFs.
 *
 * The layer renders with pdf-lib `StandardFonts` (Helvetica / HelveticaBold),
 * which are offline-safe because they are never embedded: every PDF reader
 * ships them. The trade-off is encoding: standard fonts only speak WinAnsi
 * (Windows-1252), so any code point outside that repertoire cannot be printed
 * and must be replaced deterministically before it reaches pdf-lib.
 *
 * Mapping (also covered by unit tests in `__tests__/pdf.test.ts`):
 * - Kept byte-identical: U+0020-U+007E printable ASCII, U+00A0-U+00FF
 *   printable Latin-1 (German umlauts, French/Spanish accents, ß, §, °, ×),
 *   U+20AC EURO SIGN, and the remaining Windows-1252 punctuation
 *   (en/em dashes, curly quotes, ellipsis, bullet, trademarks, OE ligature,
 *   S/Z caron family). A euro sign or "Müller" therefore survives intact.
 * - Normalised to an ASCII equivalent: NBSP and other Unicode spaces to a
 *   plain space, TAB to a space, CR/CRLF to LF, line/paragraph separators to
 *   LF, soft hyphen and zero-width characters are dropped.
 * - Everything else (CJK, Cyrillic, Greek, Arabic, emoji, …) becomes "?".
 *   One input character always maps to a fixed output, so the replacement is
 *   stable across runs and the layout never shifts between exports.
 *
 * Source stays pure ASCII on purpose (code points as escapes) so the
 * encoding check (`scripts/check-encoding.mjs`) can never flag this file.
 */

/** Replacement for code points WinAnsi cannot encode. */
export const PDF_UNENCODABLE_REPLACEMENT = '?';

/** Extra Windows-1252 code points outside Latin-1, as numbers. */
const EXTRA_WINANSI_CODES: ReadonlySet<number> = new Set([
  0x20ac, // EURO SIGN
  0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, // low-9 quotes, ellipsis, daggers, …
  0x0160, 0x2039, 0x0152, 0x017d, // S-caron, single guillemet, OE, Z-caron (upper)
  0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, // smart quotes, bullet, dashes, trade
  0x0161, 0x203a, 0x0153, 0x017e, 0x0178, // …and their lower-case / Y-diaeresis twins
]);

/** Windows-1252 leaves these byte slots unassigned; nothing may pass through. */
const UNASSIGNED_WINANSI_BYTES: ReadonlySet<number> = new Set([0x81, 0x8d, 0x8f, 0x90, 0x9d]);

/** Unicode space separators normalised to a plain ASCII space. */
const UNICODE_SPACES: ReadonlySet<number> = new Set([
  0x00a0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008,
  0x2009, 0x200a, 0x202f, 0x205f, 0x3000,
]);

/** Invisible formatting characters that are dropped, not replaced. */
const DROPPED_CODES: ReadonlySet<number> = new Set([
  0x00ad, // soft hyphen
  0x200b, 0x200c, 0x200d, // zero-width space / non-joiner / joiner
  0xfeff, // byte-order mark pasted from another document
]);

/** True when the single character prints byte-identical under WinAnsi. */
export const isWinAnsiPrintable = (character: string): boolean => {
  const code = character.codePointAt(0);
  if (code === undefined) return false;
  if (code >= 0x20 && code <= 0x7e) return true;
  if (code >= 0xa0 && code <= 0xff && !UNASSIGNED_WINANSI_BYTES.has(code)) return true;
  return EXTRA_WINANSI_CODES.has(code);
};

/**
 * Rewrite arbitrary UI text into something a WinAnsi standard font can draw.
 * LF survives (the table renderer wraps on it); every other C0/C1 control is
 * dropped. The function is total: it never throws, including on lone
 * surrogates, which map to the replacement like any other unencodable unit.
 */
export const sanitizePdfText = (raw: string): string => {
  const normalised = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  let out = '';
  for (const character of normalised) {
    const code = character.codePointAt(0);
    if (code === undefined) {
      out += PDF_UNENCODABLE_REPLACEMENT;
      continue;
    }
    if (code === 0x0a) {
      out += '\n';
      continue;
    }
    if (code === 0x09) {
      out += ' ';
      continue;
    }
    if (code === 0x2028 || code === 0x2029) {
      out += '\n';
      continue;
    }
    if (UNICODE_SPACES.has(code)) {
      out += ' ';
      continue;
    }
    if (DROPPED_CODES.has(code)) continue;
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) continue;
    out += isWinAnsiPrintable(character) ? character : PDF_UNENCODABLE_REPLACEMENT;
  }
  return out;
};
