/**
 * Deterministic formatting for documents that leave the machine.
 *
 * A PDF, a print view or a CSV is a *shared* artefact: the producer exports it,
 * the crew reads it, and both must see the same numbers. `Intl` with an
 * implicit locale breaks that promise — `new Intl.NumberFormat(undefined, …)`
 * resolves to whatever locale the exporting browser happens to run, so the same
 * budget renders as `$1,234.50` for one user and `1.234,50 $` for the next.
 * The same applies to `toLocaleString()` with no argument.
 *
 * It also made two tests non-hermetic: they passed on CI (en-US) and failed on
 * any German developer machine, which is the worst possible failure mode —
 * red only where nobody is watching CI.
 *
 * So documents pin their locale here. On-screen UI deliberately does NOT use
 * this module: a German user should keep seeing German dates in the dashboard.
 * The split is the point — screen follows the reader, documents follow the
 * document.
 */

/**
 * Fallback locale for anything with no better answer.
 *
 * `en-US` because production paperwork is an international interchange format
 * and its conventions are the ones every department recognises. Money does
 * NOT use this directly — see `documentLocaleForCurrency` below.
 */
import { isWinAnsiPrintable } from '../utils/pdf/text';

export const DOCUMENT_LOCALE = 'en-US';

/**
 * Currency decides the money format, not the machine.
 *
 * A budget in euros should read `1.234,50 €` and a budget in dollars
 * `$1,234.50`, wherever either was exported. Deriving the locale from the
 * currency keeps both true at once: the amount is written the way its currency
 * is normally written, AND two people exporting the same project still get
 * byte-identical documents, because nothing here reads the ambient locale.
 *
 * Unlisted currencies fall back to `en-US`, which is a readable, unambiguous
 * way to render an amount whose local convention we do not know.
 */
const CURRENCY_LOCALES: Readonly<Record<string, string>> = {
  EUR: 'de-DE',
  CHF: 'de-CH',
  GBP: 'en-GB',
  SEK: 'sv-SE',
  NOK: 'nb-NO',
  DKK: 'da-DK',
  PLN: 'pl-PL',
  CZK: 'cs-CZ',
  HUF: 'hu-HU',
  USD: 'en-US',
  CAD: 'en-CA',
  AUD: 'en-AU',
  NZD: 'en-NZ',
  JPY: 'ja-JP',
};

/** The locale a document formats `currency` in. */
export const documentLocaleForCurrency = (currency: string): string =>
  CURRENCY_LOCALES[currency.toUpperCase()] ?? DOCUMENT_LOCALE;

/**
 * Collapse the typographic spaces `Intl` inserts down to a plain U+0020.
 *
 * Pinning the locale is not enough on its own. Currencies with no symbol —
 * CHF, SEK, PLN — render as `"CHF 9,876.54"` even in `en-US`, and some
 * locales use U+202F. Those survive into PDFs (WinAnsi does map U+00A0, so
 * nothing throws — it simply looks like a space that copy-paste and PDF text
 * extraction then hand on as a different character) and into CSV cells, where
 * a non-breaking space silently breaks a numeric column in Excel.
 */
const withPlainSpaces = (text: string): string => text.replace(/[\u00a0\u202f\u2009]/g, ' ');

const formatIn = (locale: string, value: number, currency: string): string =>
  withPlainSpaces(
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(value),
  );

/**
 * `formatDocumentMoney(1234.5, 'EUR')` -> `"1.234,50 €"`,
 * `formatDocumentMoney(1234.5, 'USD')` -> `"$1,234.50"` — on every machine.
 *
 * The WinAnsi check is not paranoia. PDFs here render with `pdf-lib`'s
 * standard fonts, which speak Windows-1252 only, and several native currency
 * forms fall outside it: Polish `zł` (U+0142), Czech `Kč` (U+010D), the
 * fullwidth yen `￥` (U+FFE5). Those would reach the page as `z?` — technically
 * sanitised, but a mangled amount on a budget is worse than a correct one in
 * a foreign convention. So a currency whose local form cannot be printed
 * degrades to the `en-US` rendering (`PLN 1,234.50`), which is unambiguous.
 *
 * The check runs on the formatted string rather than a hard-coded deny list,
 * so a future ICU update that changes a symbol cannot silently reintroduce
 * the problem.
 */
export const formatDocumentMoney = (value: number, currency: string): string => {
  try {
    const native = formatIn(documentLocaleForCurrency(currency), value, currency);
    if ([...native].every(isWinAnsiPrintable)) return native;
    return formatIn(DOCUMENT_LOCALE, value, currency);
  } catch {
    // An unknown currency code throws rather than degrading; the plain form
    // still carries the number and the code, which is what a reader needs.
    return `${currency} ${value.toFixed(2)}`;
  }
};

/** Grouped integer for document tables: `formatDocumentNumber(12500)` -> `"12,500"`. */
export const formatDocumentNumber = (value: number): string =>
  new Intl.NumberFormat(DOCUMENT_LOCALE).format(value);

/**
 * ISO calendar date (`2026-09-08`) for document headers and footers.
 *
 * Sortable, unambiguous across US/EU reading conventions, and already the
 * format the report views standardised on via `Intl.DateTimeFormat('en-CA')`.
 */
export const formatDocumentDate = (value: Date | string = new Date()): string => {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-CA').format(date);
};

/** Date and 24-hour clock for issue stamps: `"2026-09-08, 14:30"`. */
export const formatDocumentDateTime = (value: Date | string = new Date()): string => {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  const day = new Intl.DateTimeFormat('en-CA').format(date);
  const time = new Intl.DateTimeFormat(DOCUMENT_LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  return `${day}, ${time}`;
};
