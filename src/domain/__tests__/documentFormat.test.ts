/**
 * Documents must format the same on every machine.
 *
 * The bug this locks down: `Intl.NumberFormat(undefined, …)` resolves to the
 * exporting browser's locale, so the same budget PDF printed `$850.00` on CI
 * and `850,00 $` on a German workstation. Two tests were red only on non-en
 * machines, and — worse — two readers of the same document saw different
 * numbers.
 *
 * These tests do not assert "en-US formatting" for its own sake. They assert
 * *invariance*: whatever the ambient locale is, the document output does not
 * move. That is the property the exports depend on.
 */
import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_LOCALE,
  documentLocaleForCurrency,
  formatDocumentDate,
  formatDocumentDateTime,
  formatDocumentMoney,
  formatDocumentNumber,
  formatQuantity,
} from '../documentFormat';

/**
 * Force `Intl` to behave as if the machine ran `locale`.
 *
 * Node resolves an omitted locale through `Intl.NumberFormat.prototype
 * .resolvedOptions`, which reads the runtime default — there is no env var to
 * flip mid-process. Patching the constructors is the only way to prove the
 * formatters ignore the ambient locale rather than merely agreeing with it.
 */
const withAmbientLocale = <T>(locale: string, body: () => T): T => {
  const RealNumberFormat = Intl.NumberFormat;
  const RealDateTimeFormat = Intl.DateTimeFormat;
  const patch = <A extends { new (...args: never[]): unknown }>(real: A): A =>
    new Proxy(real, {
      construct: (target, args: unknown[]) =>
        Reflect.construct(target, [args[0] ?? locale, ...args.slice(1)]),
      apply: (target, _this, args: unknown[]) =>
        Reflect.construct(target as never, [args[0] ?? locale, ...args.slice(1)]),
    }) as A;
  (Intl as { NumberFormat: unknown }).NumberFormat = patch(RealNumberFormat as never);
  (Intl as { DateTimeFormat: unknown }).DateTimeFormat = patch(RealDateTimeFormat as never);
  try {
    return body();
  } finally {
    (Intl as { NumberFormat: unknown }).NumberFormat = RealNumberFormat;
    (Intl as { DateTimeFormat: unknown }).DateTimeFormat = RealDateTimeFormat;
  }
};

const AMBIENT_LOCALES = ['en-US', 'de-DE', 'de-LU', 'fr-FR', 'ja-JP', 'ar-EG'];

describe('document formatting is locale-invariant', () => {
  it('formats currency identically whatever locale the exporting machine runs', () => {
    for (const currency of ['USD', 'EUR', 'GBP']) {
      const rendered = AMBIENT_LOCALES.map((locale) =>
        withAmbientLocale(locale, () => formatDocumentMoney(1234.5, currency)),
      );
      expect(new Set(rendered).size).toBe(1);
    }
  });

  it('groups numbers identically whatever locale the exporting machine runs', () => {
    const rendered = AMBIENT_LOCALES.map((locale) =>
      withAmbientLocale(locale, () => formatDocumentNumber(1234567)),
    );
    expect(new Set(rendered).size).toBe(1);
    expect(rendered[0]).toBe('1,234,567');
  });

  it('renders dates and issue stamps identically whatever locale is ambient', () => {
    const iso = '2026-09-08T14:30:00.000Z';
    const dates = AMBIENT_LOCALES.map((locale) =>
      withAmbientLocale(locale, () => formatDocumentDate(iso)),
    );
    const stamps = AMBIENT_LOCALES.map((locale) =>
      withAmbientLocale(locale, () => formatDocumentDateTime(iso)),
    );
    expect(new Set(dates).size).toBe(1);
    expect(new Set(stamps).size).toBe(1);
  });
});

describe('the currency decides the convention', () => {
  it('writes euros the European way and dollars the American way', () => {
    // The rule in one line: an amount is written the way its own currency is
    // normally written, not the way the exporting machine would write it.
    expect(formatDocumentMoney(1234.5, 'EUR')).toBe('1.234,50 €');
    expect(formatDocumentMoney(1234.5, 'USD')).toBe('$1,234.50');
    expect(formatDocumentMoney(1234.5, 'GBP')).toBe('£1,234.50');
  });

  it('maps a currency to its locale, and anything unknown to the fallback', () => {
    expect(documentLocaleForCurrency('EUR')).toBe('de-DE');
    expect(documentLocaleForCurrency('eur')).toBe('de-DE');
    expect(documentLocaleForCurrency('USD')).toBe('en-US');
    expect(documentLocaleForCurrency('XYZ')).toBe(DOCUMENT_LOCALE);
  });

  it('degrades a currency WinAnsi cannot print instead of mangling it', () => {
    // Polish zloty is `1234,50 zł` natively, and U+0142 is outside
    // Windows-1252, so pdf-lib's standard fonts would render `z?`. A correct
    // amount in a foreign convention beats a mangled one in the right convention.
    expect(formatDocumentMoney(1234.5, 'PLN')).toBe('PLN 1,234.50');
    expect(formatDocumentMoney(1234.5, 'CZK')).toBe('CZK 1,234.50');
  });

  it('keeps every glyph inside WinAnsi so pdf-lib standard fonts can draw it', () => {
    // The invariant that makes currency-driven locales safe at all: whatever
    // convention is chosen, every code point that reaches the PDF layer must
    // be printable by a standard font.
    for (const currency of ['USD', 'EUR', 'GBP', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'JPY']) {
      const text = formatDocumentMoney(9876.54, currency);
      // Only the exotic spaces matter: a plain U+0020 (as in "CHF 9,876.54")
      // is WinAnsi, U+00A0 / U+202F / U+2009 are not.
      expect(text).not.toMatch(/[\u00a0\u202f\u2009]/);
    }
  });

  it('degrades to code plus amount for a currency Intl rejects', () => {
    expect(formatDocumentMoney(12, 'NOT_A_CURRENCY')).toBe('NOT_A_CURRENCY 12.00');
  });

  it('writes sortable ISO calendar dates', () => {
    expect(formatDocumentDate('2026-09-08T14:30:00.000Z')).toBe('2026-09-08');
  });

  it('writes issue stamps as ISO date plus a 24-hour clock', () => {
    expect(formatDocumentDateTime('2026-09-08T14:30:00.000Z')).toMatch(
      /^2026-09-08, \d{2}:\d{2}$/,
    );
  });

  it('renders an unparseable date as an em dash rather than "Invalid Date"', () => {
    expect(formatDocumentDate('not a date')).toBe('—');
    expect(formatDocumentDateTime('not a date')).toBe('—');
  });

  it('pins the fallback locale to en-US', () => {
    // Guards an accidental change: unlisted currencies and every non-money
    // document value assume this.
    expect(DOCUMENT_LOCALE).toBe('en-US');
  });
});

describe('formatQuantity', () => {
  /**
   * Currency carries its own convention; a raw quantity does not, and the two
   * conventions collide head-on. `12,500 W` is twelve and a half watts to a
   * German gaffer. On a power sheet that is a factor of a thousand.
   */
  it('groups with a space, which no locale reads as a decimal point', () => {
    expect(formatQuantity(12500)).toBe('12 500');
    expect(formatQuantity(1234567)).toBe('1 234 567');
  });

  it('leaves small numbers ungrouped', () => {
    expect(formatQuantity(0)).toBe('0');
    expect(formatQuantity(20)).toBe('20');
    expect(formatQuantity(999)).toBe('999');
  });

  it('never emits a comma or a full stop', () => {
    for (const value of [1000, 12500, 999999, 1234567]) {
      expect(formatQuantity(value)).not.toMatch(/[.,]/);
    }
  });

  it('uses a plain space so it survives WinAnsi and CSV columns', () => {
    // A non-breaking space here would break a numeric column in Excel and
    // travel oddly through PDF text extraction.
    expect(formatQuantity(12500)).not.toMatch(/[\u00a0\u202f\u2009]/);
    expect(formatQuantity(12500)).toContain(' ');
  });

  it('is identical whatever locale the machine runs', () => {
    const rendered = AMBIENT_LOCALES.map((locale) =>
      withAmbientLocale(locale, () => formatQuantity(12500)),
    );
    expect(new Set(rendered).size).toBe(1);
  });
});
