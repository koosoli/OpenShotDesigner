/**
 * Production calendar PDF (roadmap Phase 3: schedule report).
 *
 * Printable data model (mirrors `PrintableCalendarEvent` /
 * `PrintableCalendarDay` from `ScheduleCalendarPrintView`):
 * - Calendar lines (milestones) with title, start/end dates, category and
 *   status, plus the dated shooting days with call/wrap, totals and schedule
 *   items. The on-screen month grid and timeline bars are layout, not data:
 *   on paper the same facts render as the two tables the print view already
 *   carries ("Production calendar lines" and "Shooting days"), so paper and
 *   screen cannot disagree.
 *
 * Landscape A4 by default (both tables are wide); StandardFonts only
 * (offline); every drawn string passes through `sanitizePdfText` via the
 * shared shell and table renderer.
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
import { drawPdfTable } from './tables';
import type { PdfTableColumn } from './tables';
import { sanitizePdfText } from './text';
import type { PDFPage } from 'pdf-lib';
import type {
  PrintableCalendarDay,
  PrintableCalendarEvent,
} from '../../components/reports/ScheduleCalendarPrintView';

/** One milestone line on the production calendar. */
export interface CalendarPdfEvent {
  title: string;
  startDate: string;
  endDate: string;
  category: string;
  status?: string;
}

/** One shooting day as the calendar prints it. */
export interface CalendarPdfDay {
  name: string;
  date?: string;
  crewCall?: string;
  plannedWrap?: string;
  totalMinutes?: number;
  items?: string[];
}

export interface CalendarPdfInput {
  productionTitle: string;
  /** Scope line under the heading; defaults to the line/day counts. */
  subtitle?: string;
  events: CalendarPdfEvent[];
  days: CalendarPdfDay[];
  /** Which calendar tab the export mirrors; printed in the subtitle. */
  mode?: 'timeline' | 'month' | 'list';
  /** Month in view (YYYY-MM) when mirroring the month tab. */
  yearMonth?: string;
  pageSize?: PdfPageSize;
  orientation?: PdfOrientation;
  generatedAt?: Date;
  draft?: boolean | string;
  confidentialityLine?: string;
  /** Raw PNG bytes for the production logo; corrupt bytes print logo-less. */
  logoPngBytes?: Uint8Array;
}

export interface CalendarPdfFilenameInput {
  productionTitle: string;
  qualifier?: string;
  date?: string;
}

/** `my-film_calendar.pdf`; qualifier scopes to e.g. a month. */
export const buildCalendarPdfFilename = (input: CalendarPdfFilenameInput): string =>
  buildPdfFilename({
    production: input.productionTitle,
    document: 'calendar',
    ...(input.qualifier === undefined ? {} : { qualifier: input.qualifier }),
    ...(input.date === undefined ? {} : { date: input.date }),
  });

/** Pass-through mappers: the print view model is already the PDF model. */
export const calendarEventsFromPrintable = (events: PrintableCalendarEvent[]): CalendarPdfEvent[] =>
  events.map((event) => ({
    title: event.title,
    startDate: event.startDate,
    endDate: event.endDate,
    category: event.category,
    ...(event.status === undefined ? {} : { status: event.status }),
  }));

export const calendarDaysFromPrintable = (days: PrintableCalendarDay[]): CalendarPdfDay[] =>
  days.map((day) => ({
    name: day.name,
    ...(day.date === undefined ? {} : { date: day.date }),
    ...(day.crewCall === undefined ? {} : { crewCall: day.crewCall }),
    ...(day.plannedWrap === undefined ? {} : { plannedWrap: day.plannedWrap }),
    ...(day.totalMinutes === undefined ? {} : { totalMinutes: day.totalMinutes }),
    ...(day.items === undefined ? {} : { items: [...day.items] }),
  }));

const CATEGORY_LABELS: Record<string, string> = {
  development: 'Development',
  preproduction: 'Pre-production',
  shoot: 'Shoot',
  post: 'Post',
  delivery: 'Delivery',
  custom: 'Other',
};

const STATUS_LABELS: Record<string, string> = {
  planned: 'Planned',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
};

const SECTION_TITLE_SIZE = 11;
const BODY_SIZE = 9;
const BODY_LINE_HEIGHT = BODY_SIZE * 1.35;
const SECTION_GAP = 10;
const BLOCK_GAP = 6;

const EVENT_COLUMNS: PdfTableColumn[] = [
  { header: 'Line', widthFrac: 38 },
  { header: 'Start', widthFrac: 14, align: 'center' },
  { header: 'End', widthFrac: 14, align: 'center' },
  { header: 'Category', widthFrac: 18 },
  { header: 'Status', widthFrac: 16 },
];

const DAY_COLUMNS: PdfTableColumn[] = [
  { header: '#', widthFrac: 5, align: 'center' },
  { header: 'Day', widthFrac: 14 },
  { header: 'Date', widthFrac: 11, align: 'center' },
  { header: 'Schedule', widthFrac: 42 },
  { header: 'Call', widthFrac: 8, align: 'center' },
  { header: 'Wrap', widthFrac: 8, align: 'center' },
  { header: 'Est.', widthFrac: 12, align: 'center' },
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

const drawPlaceholder = (ctx: PdfDocumentContext, cursor: PageCursor, text: string): PageCursor => {
  const placed = ensureSpace(ctx, cursor, BODY_LINE_HEIGHT + 2);
  placed.page.drawText(sanitizePdfText(text), {
    x: ctx.margins.left,
    y: placed.cursorY - BODY_SIZE,
    size: BODY_SIZE,
    font: ctx.regular,
  });
  return { page: placed.page, cursorY: placed.cursorY - BODY_LINE_HEIGHT };
};

const drawTableBlock = (
  ctx: PdfDocumentContext,
  cursor: PageCursor,
  columns: PdfTableColumn[],
  rows: string[][],
  placeholder: string,
): PageCursor => {
  if (rows.length === 0) return drawPlaceholder(ctx, cursor, placeholder);
  const result = drawPdfTable(ctx, cursor.page, cursor.cursorY, columns, rows);
  return { page: result.page, cursorY: result.cursorY };
};

/** Render the production calendar and return the finished PDF bytes. */
export const createCalendarPdf = async (input: CalendarPdfInput): Promise<Uint8Array> => {
  const modeBit = input.mode !== undefined ? `  |  ${input.mode}` : '';
  const monthBit = input.yearMonth !== undefined && input.yearMonth.trim() !== '' ? `  |  ${input.yearMonth.trim()}` : '';
  const ctx = await createPdfDocument({
    title: `Production Calendar - ${input.productionTitle}`,
    subject: 'Production calendar',
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
    documentTitle: 'Production Calendar',
    subtitle:
      input.subtitle ??
      `${input.events.length} calendar line${input.events.length === 1 ? '' : 's'}  |  ${input.days.length} shooting day${input.days.length === 1 ? '' : 's'}${modeBit}${monthBit}`,
    logo,
  });
  let cursor: PageCursor = { page, cursorY: headerY };

  cursor = drawSectionTitle(ctx, cursor, 'Production calendar lines');
  cursor = drawTableBlock(
    ctx,
    cursor,
    EVENT_COLUMNS,
    input.events.map((event) => [
      event.title,
      event.startDate,
      event.endDate,
      CATEGORY_LABELS[event.category] ?? event.category,
      event.status !== undefined ? (STATUS_LABELS[event.status] ?? event.status) : '-',
    ]),
    'No calendar lines yet.',
  );
  cursor = { page: cursor.page, cursorY: cursor.cursorY - SECTION_GAP + BLOCK_GAP };

  cursor = drawSectionTitle(ctx, cursor, 'Shooting days');
  drawTableBlock(
    ctx,
    cursor,
    DAY_COLUMNS,
    input.days.map((day, index) => [
      String(index + 1),
      day.name,
      day.date ?? '-',
      day.items && day.items.length > 0 ? day.items.join('; ') : '-',
      day.crewCall ?? '-',
      day.plannedWrap ?? '-',
      formatMinutes(day.totalMinutes),
    ]),
    'No shooting days scheduled yet.',
  );

  return finalizePdfDocument(ctx);
};
