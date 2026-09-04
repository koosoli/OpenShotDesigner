/**
 * Stripboard PDF (roadmap Phase 3: schedule report).
 *
 * Printable data model (mirrors `PrintableStripboardDay` from
 * `StripboardPrintView`, which itself derives from
 * `buildPrintableStripboardDays` in `domain/scheduling/stripboardPrint`):
 * - Days in shooting order, each with date, crew call, planned wrap and a
 *   strip list (label, kind label, estimate, cast numbers, page eighths).
 *
 * Grouping: within each day, consecutive strips are grouped under scene
 * headings. A strip whose kind is "Scene" opens a new group: the scene strip
 * doubles as the group heading AND as the first row of the group table, so
 * its own estimate stays in the table. Strips before the first scene strip
 * render as a plain table without a heading. Tone (strip colour) is
 * presentation-only on screen and is dropped on paper on purpose.
 *
 * Landscape A4 by default; StandardFonts only (offline); every drawn string
 * passes through `sanitizePdfText` via the shared shell and table renderer.
 * Page lengths use the production eighths convention ("2 4/8"); unknown
 * lengths print as "-" (ASCII, so the source stays encoding-check clean).
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
import type { PDFPage } from 'pdf-lib';
import type { PrintableStripboardDay } from '../../components/reports/StripboardPrintView';

/** One strip on the board: a scene, setup, banner, shots block or cue. */
export interface StripboardPdfItem {
  label: string;
  kindLabel: string;
  minutes?: number;
  castNumbers?: number[];
  /** Script length in canonical eighths; undefined prints as "-". */
  pageEighths?: number;
}

export interface StripboardPdfDay {
  id: string;
  name: string;
  date?: string;
  crewCall?: string;
  plannedWrap?: string;
  items: StripboardPdfItem[];
  totalMinutes: number;
}

export interface StripboardPdfInput {
  productionTitle: string;
  /** Scope line under the heading; defaults to the day/estimate summary. */
  subtitle?: string;
  days: StripboardPdfDay[];
  pageSize?: PdfPageSize;
  orientation?: PdfOrientation;
  generatedAt?: Date;
  draft?: boolean | string;
  confidentialityLine?: string;
  /** Raw PNG bytes for the production logo; corrupt bytes print logo-less. */
  logoPngBytes?: Uint8Array;
}

export interface StripboardPdfFilenameInput {
  productionTitle: string;
  qualifier?: string;
  date?: string;
}

/** `my-film_stripboard.pdf`; qualifier scopes to e.g. a single day. */
export const buildStripboardPdfFilename = (input: StripboardPdfFilenameInput): string =>
  buildPdfFilename({
    production: input.productionTitle,
    document: 'stripboard',
    ...(input.qualifier === undefined ? {} : { qualifier: input.qualifier }),
    ...(input.date === undefined ? {} : { date: input.date }),
  });

/**
 * Map the print view model onto PDF days, dropping only the screen-only
 * strip tone. Order and estimates pass through untouched.
 */
export const stripboardDaysFromPrintable = (days: PrintableStripboardDay[]): StripboardPdfDay[] =>
  days.map((day) => ({
    id: day.id,
    name: day.name,
    ...(day.date === undefined ? {} : { date: day.date }),
    ...(day.crewCall === undefined ? {} : { crewCall: day.crewCall }),
    ...(day.plannedWrap === undefined ? {} : { plannedWrap: day.plannedWrap }),
    items: day.items.map((item) => ({
      label: item.label,
      kindLabel: item.kindLabel,
      ...(item.minutes === undefined ? {} : { minutes: item.minutes }),
      ...(item.castNumbers === undefined ? {} : { castNumbers: [...item.castNumbers] }),
      ...(item.pageEighths === undefined ? {} : { pageEighths: item.pageEighths }),
    })),
    totalMinutes: day.totalMinutes,
  }));

const SECTION_TITLE_SIZE = 11;
const GROUP_TITLE_SIZE = 9.5;
const BODY_SIZE = 9;
const BODY_LINE_HEIGHT = BODY_SIZE * 1.35;
const SECTION_GAP = 10;
const BLOCK_GAP = 6;

const STRIP_COLUMNS: PdfTableColumn[] = [
  { header: '#', widthFrac: 6, align: 'center' },
  { header: 'Item', widthFrac: 44 },
  { header: 'Type', widthFrac: 12 },
  { header: 'Pages', widthFrac: 10, align: 'center' },
  { header: 'Cast', widthFrac: 12, align: 'center' },
  { header: 'Est.', widthFrac: 10, align: 'center' },
];

interface PageCursor {
  page: PDFPage;
  cursorY: number;
}

/** "3h 15m" / "45m" / "-" for missing estimates (never silently 0). */
const formatMinutes = (total: number | undefined): string => {
  if (total === undefined) return '-';
  if (total <= 0) return '0m';
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

/** Page eighths as a production writes them: 20 -> "2 4/8", 8 -> "1". */
const formatPageEighths = (eighths: number | undefined): string => {
  if (eighths === undefined || !Number.isFinite(eighths)) return '-';
  const whole = Math.floor(eighths / 8);
  const remainder = eighths % 8;
  if (whole === 0 && remainder === 0) return '0';
  if (remainder === 0) return String(whole);
  if (whole === 0) return `${remainder}/8`;
  return `${whole} ${remainder}/8`;
};

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

/** Single "Label: value" line; kept in one drawText call so tokens stay contiguous. */
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

interface StripGroup {
  heading: string | undefined;
  items: StripboardPdfItem[];
}

/** Consecutive strips under one scene strip share its label as a heading. */
const groupStripsByScene = (items: StripboardPdfItem[]): StripGroup[] => {
  const groups: StripGroup[] = [];
  for (const item of items) {
    if (item.kindLabel.trim().toLowerCase() === 'scene') {
      groups.push({ heading: item.label, items: [item] });
      continue;
    }
    const current = groups[groups.length - 1];
    if (current) current.items.push(item);
    else groups.push({ heading: undefined, items: [item] });
  }
  return groups;
};

const drawDay = (
  ctx: PdfDocumentContext,
  cursor: PageCursor,
  day: StripboardPdfDay,
  startNumber: number,
): { cursor: PageCursor; stripsUsed: number } => {
  let placed = drawSectionTitle(ctx, cursor, `Shooting day ${day.name}`);
  if (day.date !== undefined && day.date.trim() !== '') placed = drawKeyValue(ctx, placed, 'Date', day.date.trim());
  const callWrap = [
    day.crewCall && day.crewCall.trim() !== '' ? `Call ${day.crewCall.trim()}` : null,
    day.plannedWrap && day.plannedWrap.trim() !== '' ? `Wrap ${day.plannedWrap.trim()}` : null,
  ].filter((bit): bit is string => bit !== null);
  if (callWrap.length > 0) placed = drawBodyLines(ctx, placed, callWrap.join('  |  '));
  if (day.items.length === 0) {
    placed = drawBodyLines(ctx, placed, 'No strips scheduled for this day.');
    return { cursor: { page: placed.page, cursorY: placed.cursorY - SECTION_GAP + BLOCK_GAP }, stripsUsed: 0 };
  }
  let number = startNumber;
  for (const group of groupStripsByScene(day.items)) {
    if (group.heading !== undefined) {
      placed = ensureSpace(ctx, placed, GROUP_TITLE_SIZE + 26);
      placed.page.drawText(sanitizePdfText(group.heading), {
        x: ctx.margins.left,
        y: placed.cursorY - GROUP_TITLE_SIZE,
        size: GROUP_TITLE_SIZE,
        font: ctx.bold,
      });
      placed = { page: placed.page, cursorY: placed.cursorY - GROUP_TITLE_SIZE - 4 };
    }
    const rows = group.items.map((item) => {
      const row = [
        String(number),
        item.label,
        item.kindLabel,
        formatPageEighths(item.pageEighths),
        item.castNumbers && item.castNumbers.length > 0 ? item.castNumbers.join(', ') : '-',
        formatMinutes(item.minutes),
      ];
      number += 1;
      return row;
    });
    const result = drawPdfTable(ctx, placed.page, placed.cursorY, STRIP_COLUMNS, rows);
    placed = { page: result.page, cursorY: result.cursorY };
  }
  placed = drawKeyValue(ctx, placed, 'Day total', formatMinutes(day.totalMinutes));
  return {
    cursor: { page: placed.page, cursorY: placed.cursorY - SECTION_GAP + BLOCK_GAP },
    stripsUsed: number - startNumber,
  };
};

/** Render the stripboard and return the finished PDF bytes. */
export const createStripboardPdf = async (input: StripboardPdfInput): Promise<Uint8Array> => {
  const grandTotal = input.days.reduce((sum, day) => sum + day.totalMinutes, 0);
  const ctx = await createPdfDocument({
    title: `Stripboard - ${input.productionTitle}`,
    subject: 'Stripboard',
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
    documentTitle: 'Stripboard',
    subtitle:
      input.subtitle ??
      `${input.days.length} shooting day${input.days.length === 1 ? '' : 's'}  |  Total estimated ${formatMinutes(grandTotal)}`,
    logo,
  });
  let cursor: PageCursor = { page, cursorY: headerY };
  if (input.days.length === 0) {
    drawBodyLines(ctx, cursor, 'No shooting days scheduled yet.');
  } else {
    let stripNumber = 1;
    for (const day of input.days) {
      const drawn = drawDay(ctx, cursor, day, stripNumber);
      cursor = drawn.cursor;
      stripNumber += drawn.stripsUsed;
    }
  }
  return finalizePdfDocument(ctx);
};
