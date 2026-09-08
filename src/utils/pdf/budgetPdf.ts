/**
 * Budget PDF.
 *
 * Printable data model (mirrors `BudgetPrintView` and `domain/budget`,
 * read-only): totals with the above/below split first, then every category
 * with its lines, then VAT by rate. The input `summary` is the derived
 * `BudgetSummary` itself, so paper and panel price the same lines.
 *
 * Unknown-value handling (mirrors the panel, never invents zeros):
 * people and gear without a rate never enter `summary.entries` — they print
 * in the "Not yet priced" section by label only, with no amount. Warnings
 * the domain attaches to a line (zero scheduled days, orphaned gear) print
 * under the item. Currency renders as plain text through the shared WinAnsi
 * policy; no custom fonts or tricks.
 */

import {
  addPdfPage,
  createPdfDocument,
  drawDocumentHeader,
  embedProductionLogoPng,
  finalizePdfDocument,
} from './document';
import type { PdfDocumentContext, PdfOrientation, PdfPageSize } from './document';
import { buildPdfFilename } from './filenames';
import { drawPdfTable, wrapPdfCellText } from './tables';
import type { PdfTableColumn } from './tables';
import { sanitizePdfText } from './text';
import type { BudgetSummary } from '../../domain/budget';
import { formatDocumentMoney } from '../../domain/documentFormat';
import type { PDFPage } from 'pdf-lib';

export interface BudgetPdfInput {
  productionTitle: string;
  company?: string;
  summary: BudgetSummary;
  pageSize?: PdfPageSize;
  orientation?: PdfOrientation;
  generatedAt?: Date;
  draft?: boolean | string;
  confidentialityLine?: string;
  /** Raw PNG bytes for the production logo; corrupt bytes print logo-less. */
  logoPngBytes?: Uint8Array;
}

export interface BudgetPdfFilenameInput {
  productionTitle: string;
  date?: string;
}

/** `my-film_budget.pdf`, with an optional shoot-date segment. */
export const buildBudgetPdfFilename = (input: BudgetPdfFilenameInput): string =>
  buildPdfFilename({
    production: input.productionTitle,
    document: 'budget',
    ...(input.date === undefined ? {} : { date: input.date }),
  });

/** Local mirror of `RATE_BASIS_LABELS`: the PDF layer takes type-only domain imports. */
const RATE_BASIS_LABELS: Record<string, string> = { day: 'per day', week: 'per week', flat: 'flat fee' };

/**
 * Currency for the PDF. Pinned to `DOCUMENT_LOCALE`, not the exporting
 * browser: two people exporting the same budget must get the same bytes.
 */
const formatMoneyPlain = (value: number, currency: string): string =>
  formatDocumentMoney(value, currency);

const DASH = '—';
const DOT = ' · ';

const LINE_COLUMNS: PdfTableColumn[] = [
  { header: 'Item', widthFrac: 36 },
  { header: 'Rate', widthFrac: 16, align: 'right' },
  { header: 'Days x qty', widthFrac: 12, align: 'right' },
  { header: 'Net', widthFrac: 12, align: 'right' },
  { header: 'VAT', widthFrac: 12, align: 'right' },
  { header: 'Gross', widthFrac: 12, align: 'right' },
];

const VAT_COLUMNS: PdfTableColumn[] = [
  { header: 'Rate', widthFrac: 30 },
  { header: 'Net base', widthFrac: 35, align: 'right' },
  { header: 'VAT', widthFrac: 35, align: 'right' },
];

const SECTION_TITLE_SIZE = 11;
const BODY_SIZE = 9;
const BODY_LINE_HEIGHT = BODY_SIZE * 1.35;
const SECTION_GAP = 10;
const BLOCK_GAP = 6;

interface PageCursor {
  page: PDFPage;
  cursorY: number;
}

/** New page when fewer than `needed` points remain above the footer zone. */
const ensureSpace = (ctx: PdfDocumentContext, cursor: PageCursor, needed: number): PageCursor => {
  if (cursor.cursorY - needed < ctx.margins.bottom) {
    const page = addPdfPage(ctx);
    return { page, cursorY: ctx.contentTop };
  }
  return cursor;
};

const drawSectionTitle = (ctx: PdfDocumentContext, cursor: PageCursor, title: string): PageCursor => {
  const placed = ensureSpace(ctx, cursor, 34);
  placed.page.drawText(sanitizePdfText(title), {
    x: ctx.margins.left,
    y: placed.cursorY - SECTION_TITLE_SIZE,
    size: SECTION_TITLE_SIZE,
    font: ctx.bold,
  });
  return { page: placed.page, cursorY: placed.cursorY - SECTION_TITLE_SIZE - BLOCK_GAP };
};

/** Single "Label: value" line; kept in one drawText call so values stay searchable. */
const drawKeyValue = (ctx: PdfDocumentContext, cursor: PageCursor, label: string, value: string): PageCursor => {
  const placed = ensureSpace(ctx, cursor, BODY_LINE_HEIGHT + 2);
  placed.page.drawText(sanitizePdfText(`${label}: ${value}`), {
    x: ctx.margins.left,
    y: placed.cursorY - BODY_SIZE,
    size: BODY_SIZE,
    font: ctx.regular,
  });
  return { page: placed.page, cursorY: placed.cursorY - BODY_LINE_HEIGHT };
};

const drawBodyLines = (ctx: PdfDocumentContext, cursor: PageCursor, text: string): PageCursor => {
  const lines = wrapPdfCellText(ctx.regular, text, ctx.contentWidth, BODY_SIZE);
  const needed = lines.length * BODY_LINE_HEIGHT + BLOCK_GAP;
  const placed = ensureSpace(ctx, cursor, needed);
  lines.forEach((line, index) => {
    placed.page.drawText(line, {
      x: ctx.margins.left,
      y: placed.cursorY - BODY_LINE_HEIGHT * (index + 1) + 3,
      size: BODY_SIZE,
      font: ctx.regular,
    });
  });
  return { page: placed.page, cursorY: placed.cursorY - lines.length * BODY_LINE_HEIGHT - 2 };
};

/** Days/quantity cell exactly as the print view writes it; flat fees show a dash. */
const daysQuantityCell = (basis: string, units: number, quantity: number): string =>
  `${basis === 'flat' ? DASH : `${units} d`}${quantity > 1 ? ` x ${quantity}` : ''}`;

const entryItemCell = (label: string, detail: string | undefined, warning: string | undefined): string =>
  [label, detail, warning].filter((part) => part !== undefined && part.trim() !== '').join('\n');

/** Render the budget and return the finished PDF bytes. */
export const createBudgetPdf = async (input: BudgetPdfInput): Promise<Uint8Array> => {
  const { summary } = input;
  const currency = summary.settings.currency;
  const money = (value: number): string => formatMoneyPlain(value, currency);
  const scopeBits = [
    `${summary.shootDays} shooting day${summary.shootDays === 1 ? '' : 's'}`,
    `amounts in ${currency}, net unless stated`,
    `default VAT ${summary.settings.defaultVatPercent}%`,
    `paid week ${summary.settings.weekDays} days`,
  ];
  if (input.company && input.company.trim() !== '') scopeBits.unshift(input.company.trim());

  const totalLabel =
    summary.contingency > 0 && summary.settings.contingencyPercent !== undefined
      ? `Total incl. ${summary.settings.contingencyPercent}% contingency`
      : 'Total';

  const ctx = await createPdfDocument({
    title: `Budget - ${input.productionTitle}`,
    subject: 'Budget',
    pageSize: input.pageSize ?? 'A4',
    orientation: input.orientation ?? 'landscape',
    productionTitle: input.productionTitle,
    generatedAt: input.generatedAt,
    draft: input.draft,
    confidentialityLine: input.confidentialityLine,
  });
  const logo = await embedProductionLogoPng(ctx.doc, input.logoPngBytes);
  const page = addPdfPage(ctx);
  const headerY = drawDocumentHeader(ctx, page, ctx.contentTop, {
    productionTitle: input.productionTitle,
    documentTitle: 'Budget',
    subtitle: scopeBits.join(`${DOT}`),
    logo,
  });
  let cursor: PageCursor = { page, cursorY: headerY };

  // Totals first: the figures the reader came for, each one drawText call.
  cursor = drawSectionTitle(ctx, cursor, 'Totals');
  cursor = drawKeyValue(ctx, cursor, 'Net', money(summary.net));
  cursor = drawKeyValue(ctx, cursor, 'VAT', money(summary.vat));
  cursor = drawKeyValue(ctx, cursor, 'Gross', money(summary.gross));
  cursor = drawKeyValue(ctx, cursor, totalLabel, money(summary.total));
  cursor = drawKeyValue(ctx, cursor, 'Above the line (gross)', money(summary.aboveTheLine.gross));
  cursor = drawKeyValue(ctx, cursor, 'Below the line (gross)', money(summary.belowTheLine.gross));
  cursor = drawKeyValue(ctx, cursor, 'Priced lines', String(summary.entries.length));
  cursor = drawKeyValue(ctx, cursor, 'Unpriced', String(summary.unpriced.length));
  cursor = { page: cursor.page, cursorY: cursor.cursorY - SECTION_GAP + BLOCK_GAP };

  if (summary.categories.length === 0) {
    cursor = drawBodyLines(ctx, cursor, 'No priced lines yet. Add rates to crew, cast and equipment, or add hand lines.');
    cursor = { page: cursor.page, cursorY: cursor.cursorY - SECTION_GAP + BLOCK_GAP };
  }
  for (const category of summary.categories) {
    cursor = drawSectionTitle(ctx, cursor, `${category.label} - ${money(category.gross)}`);
    const rows = category.entries.map((entry) => [
      entryItemCell(entry.label, entry.detail, entry.warning),
      `${money(entry.rate)} ${RATE_BASIS_LABELS[entry.basis] ?? entry.basis}`,
      daysQuantityCell(entry.basis, entry.units, entry.quantity),
      money(entry.net),
      `${entry.vatPercent}%${DOT}${money(entry.vat)}`,
      money(entry.gross),
    ]);
    rows.push([`Subtotal ${category.label}`, '', '', money(category.net), money(category.vat), money(category.gross)]);
    const result = drawPdfTable(ctx, cursor.page, cursor.cursorY, LINE_COLUMNS, rows);
    cursor = { page: result.page, cursorY: result.cursorY - SECTION_GAP + BLOCK_GAP };
  }

  cursor = drawSectionTitle(ctx, cursor, `VAT by rate - ${money(summary.vat)}`);
  const vatRows = summary.vatByRate.map((bucket) => [`${bucket.percent}%`, money(bucket.net), money(bucket.vat)]);
  if (summary.contingency > 0) {
    vatRows.push([`Contingency ${summary.settings.contingencyPercent ?? 0}% on net`, money(summary.net), money(summary.contingency)]);
  }
  if (vatRows.length === 0) {
    cursor = drawBodyLines(ctx, cursor, 'No VAT lines yet.');
  } else {
    const result = drawPdfTable(ctx, cursor.page, cursor.cursorY, VAT_COLUMNS, vatRows);
    cursor = { page: result.page, cursorY: result.cursorY };
  }
  cursor = { page: cursor.page, cursorY: cursor.cursorY - SECTION_GAP + BLOCK_GAP };

  if (summary.unpriced.length > 0) {
    cursor = drawSectionTitle(ctx, cursor, `Not yet priced (${summary.unpriced.length})`);
    cursor = drawBodyLines(ctx, cursor, summary.unpriced.map((item) => item.label).join(`${DOT}`));
  }

  return finalizePdfDocument(ctx);
};
