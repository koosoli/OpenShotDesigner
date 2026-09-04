/**
 * Production readiness report PDF.
 *
 * Printable data model (mirrors `domain/readiness`, read-only): the findings
 * `buildReadinessItems` derives, grouped by severity and area. Every finding
 * carries a Fix-target label — the tab whose panel resolves it — so the paper
 * tells the unit where to go, not just what is wrong.
 *
 * Unknown-value handling: findings are derived facts rendered as reported;
 * nothing is completed, dismissed or re-scored here. An empty list prints
 * "No open findings" rather than a fabricated clean bill with numbers.
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
import type { ReadinessItem, ReadinessTarget } from '../../domain/readiness';
import type { PDFPage } from 'pdf-lib';

export interface ReadinessPdfInput {
  productionTitle: string;
  scopeLabel?: string;
  items: ReadinessItem[];
  pageSize?: PdfPageSize;
  orientation?: PdfOrientation;
  generatedAt?: Date;
  draft?: boolean | string;
  confidentialityLine?: string;
  /** Raw PNG bytes for the production logo; corrupt bytes print logo-less. */
  logoPngBytes?: Uint8Array;
}

export interface ReadinessPdfFilenameInput {
  productionTitle: string;
  qualifier?: string;
  date?: string;
}

/** `my-film_readiness-report.pdf`, with optional scope and date segments. */
export const buildReadinessPdfFilename = (input: ReadinessPdfFilenameInput): string =>
  buildPdfFilename({
    production: input.productionTitle,
    document: 'readiness-report',
    ...(input.qualifier === undefined ? {} : { qualifier: input.qualifier }),
    ...(input.date === undefined ? {} : { date: input.date }),
  });

const FIX_TARGET_AREAS: Record<ReadinessTarget, string> = {
  schedule: 'Schedule',
  continuity: 'Continuity',
  tasks: 'Tasks',
  locations: 'Locations',
  power: 'Power',
  equipment: 'Equipment',
  rigging: 'Rigging',
  budget: 'Budget',
};

/** Where the finding gets fixed: the panel tab, in words the unit recognises. */
export const readinessFixTargetLabel = (tab: ReadinessTarget): string => `Fix: ${FIX_TARGET_AREAS[tab]}`;

const FINDING_COLUMNS: PdfTableColumn[] = [
  { header: 'Finding', widthFrac: 38 },
  { header: 'Fix target', widthFrac: 18 },
  { header: 'Detail', widthFrac: 44 },
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

/** Blockers first, then by fix-target area, then by finding title: stable paper. */
const sortFindings = (items: ReadinessItem[]): ReadinessItem[] =>
  [...items].sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'blocker' ? -1 : 1;
    if (a.tab !== b.tab) return a.tab.localeCompare(b.tab);
    return a.label.localeCompare(b.label);
  });

/** Render the readiness report and return the finished PDF bytes. */
export const createReadinessPdf = async (input: ReadinessPdfInput): Promise<Uint8Array> => {
  const sorted = sortFindings(input.items);
  const blockers = sorted.filter((item) => item.severity === 'blocker');
  const warnings = sorted.filter((item) => item.severity === 'warning');

  const ctx = await createPdfDocument({
    title: `Readiness Report - ${input.productionTitle}`,
    subject: 'Readiness report',
    pageSize: input.pageSize ?? 'A4',
    orientation: input.orientation ?? 'portrait',
    productionTitle: input.productionTitle,
    generatedAt: input.generatedAt,
    draft: input.draft,
    confidentialityLine: input.confidentialityLine,
  });
  const logo = await embedProductionLogoPng(ctx.doc, input.logoPngBytes);
  const page = addPdfPage(ctx);
  const headerY = drawDocumentHeader(ctx, page, ctx.contentTop, {
    productionTitle: input.productionTitle,
    documentTitle: 'Readiness Report',
    subtitle: input.scopeLabel ?? `${blockers.length} blocker${blockers.length === 1 ? '' : 's'} · ${warnings.length} warning${warnings.length === 1 ? '' : 's'}`,
    logo,
  });
  let cursor: PageCursor = { page, cursorY: headerY };

  cursor = drawSectionTitle(ctx, cursor, 'Summary');
  cursor = drawKeyValue(ctx, cursor, 'Blockers', String(blockers.length));
  cursor = drawKeyValue(ctx, cursor, 'Warnings', String(warnings.length));
  const areas = [...new Set(sorted.map((item) => FIX_TARGET_AREAS[item.tab]))];
  cursor = drawKeyValue(ctx, cursor, 'Areas flagged', areas.length > 0 ? areas.join(', ') : 'None');
  cursor = { page: cursor.page, cursorY: cursor.cursorY - SECTION_GAP + BLOCK_GAP };

  if (sorted.length === 0) {
    drawBodyLines(ctx, cursor, 'No open findings. Every checked area reads ready.');
    return finalizePdfDocument(ctx);
  }

  const sections: Array<{ title: string; findings: ReadinessItem[] }> = [
    { title: `Blockers (${blockers.length})`, findings: blockers },
    { title: `Warnings (${warnings.length})`, findings: warnings },
  ];
  for (const section of sections) {
    if (section.findings.length === 0) continue;
    cursor = drawSectionTitle(ctx, cursor, section.title);
    const rows = section.findings.map((item) => [
      item.label,
      readinessFixTargetLabel(item.tab),
      item.detail,
    ]);
    const result = drawPdfTable(ctx, cursor.page, cursor.cursorY, FINDING_COLUMNS, rows);
    cursor = { page: result.page, cursorY: result.cursorY - SECTION_GAP + BLOCK_GAP };
  }

  return finalizePdfDocument(ctx);
};
