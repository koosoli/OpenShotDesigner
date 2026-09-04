/**
 * Daily progress report PDF (the DPR).
 *
 * Printable data model (mirrors `DailyProgressPrintView`, read-only): what
 * was scheduled, what was actually shot, and whether the unit is ahead or
 * behind. The input `report` is the derived `DailyProgressReport` itself, so
 * paper and panel cannot disagree.
 *
 * Unknown-value handling (mirrors the view): unknown prints as an em dash
 * and says so where the reason matters. A day with no usable estimates
 * reports its variance as unknown rather than zero; pages stay unknown while
 * any scheduled scene has no recorded length. Gear with no journey mark
 * prints "Not marked", which is a different fact from "Packed".
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
import type { DailyProgressReport } from '../../domain/reports';
import type { PDFPage } from 'pdf-lib';

export interface DailyProgressPdfInput {
  productionTitle: string;
  company?: string;
  director?: string;
  firstAd?: string;
  report: DailyProgressReport;
  /** The published call-to-wrap window, when the day names both. */
  plannedDayMinutes: number | null;
  pageSize?: PdfPageSize;
  orientation?: PdfOrientation;
  generatedAt?: Date;
  draft?: boolean | string;
  confidentialityLine?: string;
  /** Raw PNG bytes for the production logo; corrupt bytes print logo-less. */
  logoPngBytes?: Uint8Array;
}

export interface DailyProgressPdfFilenameInput {
  productionTitle: string;
  qualifier?: string;
  date?: string;
}

/** `my-film_daily-progress_day-03.pdf`, with optional scope and date segments. */
export const buildDailyProgressPdfFilename = (input: DailyProgressPdfFilenameInput): string =>
  buildPdfFilename({
    production: input.productionTitle,
    document: 'daily-progress',
    ...(input.qualifier === undefined ? {} : { qualifier: input.qualifier }),
    ...(input.date === undefined ? {} : { date: input.date }),
  });

const DASH = '—';

const dash = (value: string | number | undefined): string => (value === undefined || value === '' ? DASH : String(value));

/** Local mirror of `formatDurationHours`: `450` as `"7h 30m"`. */
const formatDurationHoursPlain = (minutes: number): string => {
  const rounded = Math.round(minutes);
  const sign = rounded < 0 ? '-' : '';
  const absolute = Math.abs(rounded);
  return `${sign}${Math.floor(absolute / 60)}h ${String(absolute % 60).padStart(2, '0')}m`;
};

/** Local mirror of `formatPageEighths`: eighths as a production writes them. */
const formatPageEighthsPlain = (eighths: number | null | undefined): string => {
  if (eighths === null || eighths === undefined || !Number.isFinite(eighths)) return DASH;
  const whole = Math.floor(eighths / 8);
  const remainder = eighths % 8;
  if (whole === 0 && remainder === 0) return '0';
  if (remainder === 0) return String(whole);
  if (whole === 0) return `${remainder}/8`;
  return `${whole} ${remainder}/8`;
};

/** Local mirror of `formatSpan`: the shooting span, or a dash. */
const formatSpanPlain = (minutes: number | undefined): string =>
  minutes === undefined ? DASH : formatDurationHoursPlain(minutes);

const JOURNEY_LABELS: Record<string, string> = {
  packed: 'Packed',
  loaded: 'Loaded',
  delivered: 'Delivered',
  returned: 'Returned',
};

/** The captain's mark in words; absence prints as its own fact. */
const journeyLabel = (stage: string | undefined): string => (stage && JOURNEY_LABELS[stage]) || 'Not marked';

const SCENE_COLUMNS: PdfTableColumn[] = [
  { header: 'Scene', widthFrac: 28 },
  { header: 'Pages', widthFrac: 18, align: 'right' },
  { header: 'Planned', widthFrac: 18, align: 'right' },
  { header: 'Covered', widthFrac: 18, align: 'right' },
  { header: 'Status', widthFrac: 18 },
];

const UNSCHEDULED_COLUMNS: PdfTableColumn[] = [
  { header: 'Shot', widthFrac: 22 },
  { header: 'Scene', widthFrac: 16 },
  { header: 'Description', widthFrac: 46 },
  { header: 'Takes', widthFrac: 16, align: 'right' },
];

const GEAR_COLUMNS: PdfTableColumn[] = [
  { header: 'Container', widthFrac: 40 },
  { header: 'Kind', widthFrac: 30 },
  { header: 'Where it is', widthFrac: 30 },
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

/** Render the daily progress report and return the finished PDF bytes. */
export const createDailyProgressPdf = async (input: DailyProgressPdfInput): Promise<Uint8Array> => {
  const { report } = input;
  const scopeBits = [report.dayName];
  if (report.date) scopeBits.push(report.date);
  scopeBits.push(`call ${dash(report.crewCall)}`);
  scopeBits.push(`planned wrap ${dash(report.plannedWrap)}`);
  if (input.plannedDayMinutes !== null) scopeBits.push(`(${formatDurationHoursPlain(input.plannedDayMinutes)})`);
  if (input.company && input.company.trim() !== '') scopeBits.unshift(input.company.trim());

  const ctx = await createPdfDocument({
    title: `Daily Progress - ${input.productionTitle} - ${report.dayName}`,
    subject: 'Daily progress report',
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
    documentTitle: `Daily Progress - ${report.dayName}`,
    subtitle: scopeBits.join(' · '),
    logo,
  });
  let cursor: PageCursor = { page, cursorY: headerY };

  // The day at a glance: schedule verdict, coverage counts, take times.
  cursor = drawSectionTitle(ctx, cursor, 'Day Summary');
  cursor = drawKeyValue(ctx, cursor, 'Schedule', report.scheduleVarianceLabel ?? DASH);
  cursor = drawKeyValue(ctx, cursor, 'Scenes', `${report.scenesCompleted}/${report.scenesScheduled} completed`);
  cursor = drawKeyValue(
    ctx,
    cursor,
    'Pages',
    report.pagesScheduledEighths === null
      ? `${formatPageEighthsPlain(report.pagesCoveredEighths)}/${formatPageEighthsPlain(report.pagesScheduledEighths)} (not all scenes have a page length)`
      : `${formatPageEighthsPlain(report.pagesCoveredEighths)}/${formatPageEighthsPlain(report.pagesScheduledEighths)} shot / scheduled`,
  );
  cursor = drawKeyValue(ctx, cursor, 'Setups', `${report.setupsCompleted}/${report.setupsScheduled} completed`);
  cursor = drawKeyValue(ctx, cursor, 'Shots', `${report.shotsCovered}/${report.shotsScheduled} covered`);
  cursor = drawKeyValue(ctx, cursor, 'First take (logged)', dash(report.firstTakeAt));
  cursor = drawKeyValue(ctx, cursor, 'Last take (logged)', dash(report.lastTakeAt));
  cursor = drawKeyValue(ctx, cursor, 'Shooting span', formatSpanPlain(report.shootingSpanMinutes));
  cursor = drawKeyValue(
    ctx,
    cursor,
    'Takes',
    `${report.takesLogged} (${report.takesGood} good · ${report.takesNg} NG)`,
  );
  if (input.director) cursor = drawKeyValue(ctx, cursor, 'Director', input.director);
  if (input.firstAd) cursor = drawKeyValue(ctx, cursor, '1st AD', input.firstAd);
  cursor = { page: cursor.page, cursorY: cursor.cursorY - SECTION_GAP + BLOCK_GAP };

  cursor = drawSectionTitle(ctx, cursor, 'Scenes');
  if (report.scenes.length === 0) {
    cursor = drawBodyLines(ctx, cursor, 'Nothing scheduled on this day.');
    cursor = { page: cursor.page, cursorY: cursor.cursorY - SECTION_GAP + BLOCK_GAP };
  } else {
    const rows = report.scenes.map((scene) => [
      scene.sceneNumber,
      formatPageEighthsPlain(scene.pageEighths),
      String(scene.plannedShots),
      String(scene.coveredShots),
      scene.complete ? 'Complete' : 'Incomplete',
    ]);
    const result = drawPdfTable(ctx, cursor.page, cursor.cursorY, SCENE_COLUMNS, rows);
    cursor = { page: result.page, cursorY: result.cursorY - SECTION_GAP + BLOCK_GAP };
  }

  cursor = drawSectionTitle(ctx, cursor, 'Not covered');
  if (report.shotsNotShot.length === 0 && report.shotsAttempted === 0) {
    cursor = drawBodyLines(ctx, cursor, 'Every shot scheduled for the day has a good take.');
    cursor = { page: cursor.page, cursorY: cursor.cursorY - SECTION_GAP + BLOCK_GAP };
  } else {
    if (report.shotsNotShot.length > 0) {
      cursor = drawKeyValue(
        ctx,
        cursor,
        `Not shot (${report.shotsNotShot.length})`,
        report.shotsNotShot.map((shot) => shot.shotNumber || shot.name || shot.shotId).join(', '),
      );
    }
    if (report.shotsAttempted > 0) {
      cursor = drawKeyValue(ctx, cursor, 'Shot with no good take', String(report.shotsAttempted));
    }
    cursor = { page: cursor.page, cursorY: cursor.cursorY - SECTION_GAP + BLOCK_GAP };
  }

  if (report.shotsUnscheduled.length > 0) {
    cursor = drawSectionTitle(ctx, cursor, 'Shot but not scheduled');
    const rows = report.shotsUnscheduled.map((shot) => [
      dash(shot.shotNumber),
      dash(shot.sceneNumber),
      dash(shot.name),
      String(shot.takeCount),
    ]);
    const result = drawPdfTable(ctx, cursor.page, cursor.cursorY, UNSCHEDULED_COLUMNS, rows);
    cursor = { page: result.page, cursorY: result.cursorY - SECTION_GAP + BLOCK_GAP };
  }

  if (report.gearMovement && report.gearMovement.length > 0) {
    cursor = drawSectionTitle(ctx, cursor, 'Gear movement');
    const rows = report.gearMovement.map((row) => [row.name, row.kind, journeyLabel(row.journey)]);
    const result = drawPdfTable(ctx, cursor.page, cursor.cursorY, GEAR_COLUMNS, rows);
    cursor = { page: result.page, cursorY: result.cursorY - SECTION_GAP + BLOCK_GAP };
  }

  drawBodyLines(
    ctx,
    cursor,
    'Derived from the schedule and the continuity log. First and last are takes logged, not camera-roll times.',
  );

  return finalizePdfDocument(ctx);
};
