/**
 * Budget actuals PDF (cost report).
 *
 * Printable data model (mirrors the Actuals section of the budget panel,
 * read-only): the category sheet (Estimate | Actual | Difference), the
 * per-line variances, and the receipts as logged. The estimate side stays
 * derived — `budgetActualsEstimatesFromEntries` maps `BudgetEntry` rows the
 * way the panel does — while actuals are stored facts rendered as logged.
 *
 * Unknown-value handling (mirrors the panel, never invents zeros):
 * - An estimate with no usable rate prints "Not priced", never zero.
 * - A variance is only spoken once at least one actual exists; an empty
 *   ledger prints "No actuals logged yet", not "on budget".
 * - Actuals attached to an estimate id the budget no longer contains stay
 *   visible with an unknown estimate, so nothing silently vanishes.
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
import type { BudgetActual, BudgetCategory, BudgetEntry } from '../../domain/budget';
import { formatDocumentMoney } from '../../domain/documentFormat';
import type { PDFPage } from 'pdf-lib';

/** One estimate line the ledger is compared against; plannedNet stays absent while unpriced. */
export interface BudgetActualsEstimateLine {
  id: string;
  category: BudgetCategory;
  label: string;
  detail?: string;
  /** Unknown until the Budget tab has a usable rate; never silently zero. */
  plannedNet?: number;
}

export interface BudgetActualsCategoryTotal {
  category: BudgetCategory;
  label: string;
  net: number;
}

export interface BudgetActualsPdfInput {
  productionTitle: string;
  company?: string;
  currency: string;
  /** The derived net total, when the budget has enough to produce one. */
  estimatedNet?: number;
  estimates: BudgetActualsEstimateLine[];
  actuals: BudgetActual[];
  /** The estimate rolled up per category — the cost report's left column. */
  categoryTotals?: BudgetActualsCategoryTotal[];
  pageSize?: PdfPageSize;
  orientation?: PdfOrientation;
  generatedAt?: Date;
  draft?: boolean | string;
  confidentialityLine?: string;
  /** Raw PNG bytes for the production logo; corrupt bytes print logo-less. */
  logoPngBytes?: Uint8Array;
}

export interface BudgetActualsPdfFilenameInput {
  productionTitle: string;
  date?: string;
}

/** `my-film_budget-actuals.pdf`, with an optional shoot-date segment. */
export const buildBudgetActualsPdfFilename = (input: BudgetActualsPdfFilenameInput): string =>
  buildPdfFilename({
    production: input.productionTitle,
    document: 'budget-actuals',
    ...(input.date === undefined ? {} : { date: input.date }),
  });

/**
 * Map derived budget entries to estimate lines the way the Actuals section
 * does: every priced entry carries its net; unpriced rows never reach this
 * mapper (the caller adds them with `plannedNet` absent instead).
 */
export const budgetActualsEstimatesFromEntries = (entries: readonly BudgetEntry[]): BudgetActualsEstimateLine[] =>
  entries.map((entry) => ({
    id: entry.id,
    category: entry.category,
    label: entry.label,
    ...(entry.detail !== undefined ? { detail: entry.detail } : {}),
    plannedNet: entry.net,
  }));

/**
 * Currency for the PDF. Pinned to `DOCUMENT_LOCALE`, not the exporting
 * browser: two people exporting the same budget must get the same bytes.
 */
const formatMoneyPlain = (value: number, currency: string): string =>
  formatDocumentMoney(value, currency);

const DASH = '—';

const SHEET_COLUMNS: PdfTableColumn[] = [
  { header: 'Category', widthFrac: 40 },
  { header: 'Estimate', widthFrac: 20, align: 'right' },
  { header: 'Actual', widthFrac: 20, align: 'right' },
  { header: 'Diff', widthFrac: 20, align: 'right' },
];

const LINE_COLUMNS: PdfTableColumn[] = [
  { header: 'Line', widthFrac: 40 },
  { header: 'Planned', widthFrac: 20, align: 'right' },
  { header: 'Spent', widthFrac: 20, align: 'right' },
  { header: 'Difference', widthFrac: 20, align: 'right' },
];

const RECEIPT_COLUMNS: PdfTableColumn[] = [
  { header: 'Receipt', widthFrac: 32 },
  { header: 'Category', widthFrac: 20 },
  { header: 'Amount', widthFrac: 14, align: 'right' },
  { header: 'Date', widthFrac: 12, align: 'center' },
  { header: 'Attached to', widthFrac: 22 },
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

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Signed difference in words; ASCII signs only so the token survives WinAnsi. */
const signedMoney = (over: number, currency: string): string => {
  if (over > 0) return `+${formatMoneyPlain(over, currency)}`;
  if (over < 0) return `-${formatMoneyPlain(Math.abs(over), currency)}`;
  return formatMoneyPlain(0, currency);
};

/** Render the actuals/variance report and return the finished PDF bytes. */
export const createBudgetActualsPdf = async (input: BudgetActualsPdfInput): Promise<Uint8Array> => {
  const { currency, estimates, actuals } = input;
  const money = (value: number): string => formatMoneyPlain(value, currency);
  const hasLedger = actuals.length > 0;
  const estimatedNet = input.estimatedNet !== undefined && Number.isFinite(input.estimatedNet) ? input.estimatedNet : undefined;
  const totalSpent = round2(actuals.reduce((sum, entry) => sum + entry.amount, 0));
  const variance = hasLedger && estimatedNet !== undefined ? round2(totalSpent - estimatedNet) : undefined;

  const estimateById = new Map(estimates.map((estimate) => [estimate.id, estimate] as const));
  const spentByEntry = new Map<string, number>();
  for (const actual of actuals) {
    if (!actual.entryId) continue;
    spentByEntry.set(actual.entryId, round2((spentByEntry.get(actual.entryId) ?? 0) + actual.amount));
  }
  const attachLabel = (entryId: string | undefined): string => {
    if (!entryId) return 'Not attached';
    return estimateById.get(entryId)?.label ?? entryId;
  };

  const ctx = await createPdfDocument({
    title: `Budget Actuals - ${input.productionTitle}`,
    subject: 'Budget actuals',
    pageSize: input.pageSize ?? 'A4',
    orientation: input.orientation ?? 'portrait',
    productionTitle: input.productionTitle,
    generatedAt: input.generatedAt,
    draft: input.draft,
    confidentialityLine: input.confidentialityLine,
  });
  const logo = await embedProductionLogoPng(ctx.doc, input.logoPngBytes);
  const page = addPdfPage(ctx);
  const scopeBits = [`amounts in ${currency}, net`, `${estimates.length} estimate line${estimates.length === 1 ? '' : 's'}`];
  if (input.company && input.company.trim() !== '') scopeBits.unshift(input.company.trim());
  const headerY = drawDocumentHeader(ctx, page, ctx.contentTop, {
    productionTitle: input.productionTitle,
    documentTitle: 'Budget Actuals',
    subtitle: scopeBits.join(' · '),
    logo,
  });
  let cursor: PageCursor = { page, cursorY: headerY };

  // Summary first: spent against the estimate, spoken only once a ledger exists.
  cursor = drawSectionTitle(ctx, cursor, 'Summary');
  cursor = drawKeyValue(ctx, cursor, 'Spent', money(totalSpent));
  cursor = drawKeyValue(ctx, cursor, 'Estimate (net)', estimatedNet === undefined ? 'Unknown' : money(estimatedNet));
  if (variance === undefined) {
    cursor = drawBodyLines(ctx, cursor, 'No actuals logged yet. Nothing logged says nothing, not "on budget".');
  } else {
    cursor = drawKeyValue(
      ctx,
      cursor,
      'Variance',
      variance === 0 ? money(0) : `${signedMoney(variance, currency)} ${variance > 0 ? 'over' : 'under'} estimate`,
    );
  }
  cursor = { page: cursor.page, cursorY: cursor.cursorY - SECTION_GAP + BLOCK_GAP };

  // Category sheet, in estimate order then any spent-only categories.
  cursor = drawSectionTitle(ctx, cursor, 'Cost report - estimate vs actual, per category');
  if (!hasLedger) {
    cursor = drawBodyLines(ctx, cursor, 'No actuals logged yet, so there is no comparison to print.');
    cursor = { page: cursor.page, cursorY: cursor.cursorY - SECTION_GAP + BLOCK_GAP };
  } else {
    const spentByCategory = new Map<BudgetCategory, number>();
    for (const actual of actuals) {
      spentByCategory.set(actual.category, round2((spentByCategory.get(actual.category) ?? 0) + actual.amount));
    }
    const order: BudgetCategory[] = [];
    for (const row of input.categoryTotals ?? []) {
      if (!order.includes(row.category)) order.push(row.category);
    }
    for (const category of spentByCategory.keys()) {
      if (!order.includes(category)) order.push(category);
    }
    const labelByCategory = new Map((input.categoryTotals ?? []).map((row) => [row.category, row.label] as const));
    const estimateByCategory = new Map((input.categoryTotals ?? []).map((row) => [row.category, row.net] as const));
    const sheetRows = order.map((category) => {
      const estimate = estimateByCategory.get(category) ?? null;
      const spent = spentByCategory.get(category) ?? 0;
      return [
        labelByCategory.get(category) ?? category,
        estimate === null ? DASH : money(estimate),
        money(spent),
        estimate === null ? DASH : signedMoney(round2(spent - estimate), currency),
      ];
    });
    const result = drawPdfTable(ctx, cursor.page, cursor.cursorY, SHEET_COLUMNS, sheetRows);
    cursor = { page: result.page, cursorY: result.cursorY - SECTION_GAP + BLOCK_GAP };
  }

  // Per-line variances: every estimate always lists (the panel's exact-cost
  // table does too), while spent and difference only speak once a ledger
  // exists — rows of "0 against 400" with nothing logged would be noise
  // pretending to be information.
  cursor = drawSectionTitle(ctx, cursor, 'Variance by line');
  if (estimates.length === 0 && !hasLedger) {
    cursor = drawBodyLines(ctx, cursor, 'No estimate lines and no actuals logged yet.');
  } else {
    const lineRows: string[][] = estimates.map((estimate) => {
      const spent = spentByEntry.get(estimate.id) ?? 0;
      const difference =
        hasLedger && estimate.plannedNet !== undefined ? round2(spent - estimate.plannedNet) : undefined;
      return [
        estimate.detail ? `${estimate.label}\n${estimate.detail}` : estimate.label,
        estimate.plannedNet === undefined ? 'Not priced' : money(estimate.plannedNet),
        hasLedger ? money(spent) : DASH,
        difference === undefined ? DASH : signedMoney(difference, currency),
      ];
    });
    for (const [entryId, spent] of spentByEntry) {
      if (estimateById.has(entryId)) continue;
      lineRows.push([entryId, 'Unknown estimate', money(spent), signedMoney(spent, currency)]);
    }
    const result = drawPdfTable(ctx, cursor.page, cursor.cursorY, LINE_COLUMNS, lineRows);
    cursor = { page: result.page, cursorY: result.cursorY - SECTION_GAP + BLOCK_GAP };
  }

  // Receipts as logged.
  cursor = drawSectionTitle(ctx, cursor, 'Receipts');
  if (actuals.length === 0) {
    drawBodyLines(ctx, cursor, 'Nothing logged yet.');
  } else {
    const receiptRows = actuals.map((actual) => [
      actual.note ? `${actual.label}\n${actual.note}` : actual.label,
      actual.category,
      money(actual.amount),
      actual.date ?? DASH,
      attachLabel(actual.entryId),
    ]);
    drawPdfTable(ctx, cursor.page, cursor.cursorY, RECEIPT_COLUMNS, receiptRows);
  }

  return finalizePdfDocument(ctx);
};
