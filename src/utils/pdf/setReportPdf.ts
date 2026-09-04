/**
 * Set report PDF (roadmap Phase 3: set/daily reports).
 *
 * DECISION (documented per the brief): one module covers all three variants
 * via the `variant` option, because all three derive from the same continuity
 * log and share the masthead, roll-section and table machinery:
 * - `camera`: the camera report that travels with the cards to the DIT and
 *   post (`CameraReportPrintView` in `SetReportsPrintView`, studio section
 *   `camerareport`). Wild tracks are absent by definition. Groups by camera
 *   roll; slugs as `camera-report`.
 * - `sound`: the sound report for the mixer and post (same file, studio
 *   section `soundreport`). MOS takes are listed as "MOS - no sound" and
 *   wild tracks as "Wild track" so a missing file reads as intended rather
 *   than as lost. Groups by sound roll; slugs as `sound-report`.
 * - `daily`: the end-of-day daily progress report the production office reads
 *   first (`DailyProgressPrintView`, studio section `dailyprogress`):
 *   scheduled vs shot, pages/setups/shots, first/last takes, variance, the
 *   gap list, unscheduled pickups and gear movement. Slugs as `set-report`.
 *
 * Printable data models are the domain derivations themselves
 * (`SetReport<CameraReportRow>`, `SetReport<SoundReportRow>` from
 * `domain/continuity/setReports`, `DailyProgressReport` from
 * `domain/reports/dailyProgress`) — type-only imports, no recomputation.
 *
 * WinAnsi deviation: the print views mark takes with U+25CF/U+25CB
 * (good/NG), which WinAnsi cannot encode, so the PDF marks them `G` / `NG`
 * / `-` (not yet judged) with a printed legend. Dashes print as ASCII "-".
 *
 * Landscape A4 by default: the camera sheet has fourteen columns.
 * StandardFonts only (offline); every drawn string passes through
 * `sanitizePdfText` via the shared shell and table renderer.
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
import type { CameraReportRow, SetReport, SoundReportRow } from '../../domain/continuity';
import type { DailyProgressReport } from '../../domain/reports';

export type SetReportPdfVariant = 'daily' | 'camera' | 'sound';

interface SetReportPdfBase {
  productionTitle: string;
  /** Day scope, e.g. "Day 04 - 2026-09-04". */
  scopeLabel?: string;
  /** Crew line, e.g. "DOP Jane - Sound Joe". */
  crewLine?: string;
  pageSize?: PdfPageSize;
  orientation?: PdfOrientation;
  generatedAt?: Date;
  draft?: boolean | string;
  confidentialityLine?: string;
  /** Raw PNG bytes for the production logo; corrupt bytes print logo-less. */
  logoPngBytes?: Uint8Array;
}

export interface DailySetReportPdfInput extends SetReportPdfBase {
  variant: 'daily';
  report: DailyProgressReport;
  /** The published call-to-wrap window; null prints without it. */
  plannedDayMinutes?: number | null;
  director?: string;
  firstAd?: string;
}

export interface CameraSetReportPdfInput extends SetReportPdfBase {
  variant: 'camera';
  report: SetReport<CameraReportRow>;
}

export interface SoundSetReportPdfInput extends SetReportPdfBase {
  variant: 'sound';
  report: SetReport<SoundReportRow>;
}

export type SetReportPdfInput = DailySetReportPdfInput | CameraSetReportPdfInput | SoundSetReportPdfInput;

export interface SetReportPdfFilenameInput {
  productionTitle: string;
  variant: SetReportPdfVariant;
  qualifier?: string;
  date?: string;
}

const VARIANT_DOCUMENT_SLUG: Record<SetReportPdfVariant, string> = {
  daily: 'set-report',
  camera: 'camera-report',
  sound: 'sound-report',
};

const VARIANT_TITLE: Record<SetReportPdfVariant, string> = {
  daily: 'Daily Progress Report',
  camera: 'Camera Report',
  sound: 'Sound Report',
};

/** `my-film_camera-report_day-04.pdf` (slug depends on the variant). */
export const buildSetReportPdfFilename = (input: SetReportPdfFilenameInput): string =>
  buildPdfFilename({
    production: input.productionTitle,
    document: VARIANT_DOCUMENT_SLUG[input.variant],
    ...(input.qualifier === undefined ? {} : { qualifier: input.qualifier }),
    ...(input.date === undefined ? {} : { date: input.date }),
  });

const SECTION_TITLE_SIZE = 11;
const BODY_SIZE = 9;
const BODY_LINE_HEIGHT = BODY_SIZE * 1.35;
const GROUP_TITLE_SIZE = 9.5;
const SECTION_GAP = 10;
const BLOCK_GAP = 6;

const CAMERA_COLUMNS: PdfTableColumn[] = [
  { header: 'Mark', widthFrac: 5, align: 'center' },
  { header: 'File', widthFrac: 12 },
  { header: 'Sc', widthFrac: 6, align: 'center' },
  { header: 'Shot', widthFrac: 7, align: 'center' },
  { header: 'Tk', widthFrac: 5, align: 'center' },
  { header: 'Cam', widthFrac: 6, align: 'center' },
  { header: 'Description', widthFrac: 14 },
  { header: 'Lens', widthFrac: 8, align: 'center' },
  { header: 'FPS', widthFrac: 6, align: 'center' },
  { header: 'Shutter', widthFrac: 8, align: 'center' },
  { header: 'ISO', widthFrac: 6, align: 'center' },
  { header: 'Filter', widthFrac: 7, align: 'center' },
  { header: 'T-stop', widthFrac: 7, align: 'center' },
  { header: 'Notes', widthFrac: 13 },
];

const SOUND_COLUMNS: PdfTableColumn[] = [
  { header: 'Mark', widthFrac: 6, align: 'center' },
  { header: 'Audio file', widthFrac: 20 },
  { header: 'Sc', widthFrac: 8, align: 'center' },
  { header: 'Shot', widthFrac: 9, align: 'center' },
  { header: 'Tk', widthFrac: 6, align: 'center' },
  { header: 'Type', widthFrac: 16 },
  { header: 'Notes', widthFrac: 35 },
];

const SCENE_COLUMNS: PdfTableColumn[] = [
  { header: 'Scene', widthFrac: 20 },
  { header: 'Pages', widthFrac: 16, align: 'center' },
  { header: 'Planned', widthFrac: 16, align: 'center' },
  { header: 'Covered', widthFrac: 16, align: 'center' },
  { header: 'Status', widthFrac: 32 },
];

const UNSCHEDULED_COLUMNS: PdfTableColumn[] = [
  { header: 'Shot', widthFrac: 20 },
  { header: 'Scene', widthFrac: 16 },
  { header: 'Description', widthFrac: 48 },
  { header: 'Takes', widthFrac: 16, align: 'center' },
];

const GEAR_COLUMNS: PdfTableColumn[] = [
  { header: 'Container', widthFrac: 34 },
  { header: 'Kind', widthFrac: 22 },
  { header: 'Where it is', widthFrac: 44 },
];

interface PageCursor {
  page: PDFPage;
  cursorY: number;
}

const dash = (value: string | undefined): string => (value && value.trim() !== '' ? value : '-');

/** G good, NG no-good, "-" not yet judged (WinAnsi-safe take marks). */
const goodMark = (value: boolean | undefined): string => {
  if (value === true) return 'G';
  if (value === false) return 'NG';
  return '-';
};

/** Page eighths as a production writes them: 20 -> "2 4/8", 8 -> "1". */
const formatPageEighths = (eighths: number | null | undefined): string => {
  if (eighths === null || eighths === undefined || !Number.isFinite(eighths)) return '-';
  const whole = Math.floor(eighths / 8);
  const remainder = eighths % 8;
  if (whole === 0 && remainder === 0) return '0';
  if (remainder === 0) return String(whole);
  if (whole === 0) return `${remainder}/8`;
  return `${whole} ${remainder}/8`;
};

/** Shooting span as "9h 05m", or a dash when unknown. */
const formatSpan = (minutes: number | undefined): string => {
  if (minutes === undefined) return '-';
  const h = Math.floor(minutes / 60);
  const mm = minutes % 60;
  return h > 0 ? `${h}h ${String(mm).padStart(2, '0')}m` : `${mm}m`;
};

/** Call-to-wrap window as "9h 05m". */
const formatWindow = (minutes: number | null | undefined): string | null => {
  if (minutes === null || minutes === undefined) return null;
  return formatSpan(minutes);
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

const drawRollHeading = (
  ctx: PdfDocumentContext,
  cursor: PageCursor,
  roll: string,
  takes: number,
  good: number,
  ng: number,
): PageCursor => {
  const placed = ensureSpace(ctx, cursor, GROUP_TITLE_SIZE + 26);
  placed.page.drawText(sanitizePdfText(`${roll} - ${takes} take${takes === 1 ? '' : 's'} - ${good} good - ${ng} NG`), {
    x: ctx.margins.left,
    y: placed.cursorY - GROUP_TITLE_SIZE,
    size: GROUP_TITLE_SIZE,
    font: ctx.bold,
  });
  return { page: placed.page, cursorY: placed.cursorY - GROUP_TITLE_SIZE - 4 };
};

const drawTableBlock = (
  ctx: PdfDocumentContext,
  cursor: PageCursor,
  columns: PdfTableColumn[],
  rows: string[][],
  placeholder: string,
): PageCursor => {
  if (rows.length === 0) {
    return drawKeyValue(ctx, cursor, 'None', placeholder);
  }
  const result = drawPdfTable(ctx, cursor.page, cursor.cursorY, columns, rows, { fontSize: 7.5 });
  return { page: result.page, cursorY: result.cursorY };
};

const cameraRow = (row: CameraReportRow): string[] => [
  goodMark(row.isGoodTake),
  dash(row.fileName),
  dash(row.scene),
  dash(row.shot),
  String(row.take),
  dash(row.camera),
  row.mos ? `${dash(row.description)} [MOS]` : dash(row.description),
  dash(row.lens),
  dash(row.fps),
  dash(row.shutter),
  dash(row.iso),
  dash(row.filter),
  dash(row.aperture),
  dash(row.notes),
];

const soundRow = (row: SoundReportRow): string[] => [
  goodMark(row.isGoodTake),
  dash(row.soundFileName),
  dash(row.scene),
  dash(row.shot),
  String(row.take),
  row.wildTrack ? 'Wild track' : row.mos ? 'MOS - no sound' : 'Sync',
  dash(row.notes),
];

const drawCameraReport = (
  ctx: PdfDocumentContext,
  cursor: PageCursor,
  input: CameraSetReportPdfInput,
): PageCursor => {
  let placed = cursor;
  if (input.report.rolls.length === 0) {
    return drawKeyValue(ctx, placed, 'Takes', 'No takes logged. The camera report derives from the continuity log.');
  }
  for (const roll of input.report.rolls) {
    placed = drawRollHeading(ctx, placed, roll.roll, roll.rows.length, roll.goodCount, roll.ngCount);
    placed = drawTableBlock(ctx, placed, CAMERA_COLUMNS, roll.rows.map(cameraRow), 'No takes on this roll.');
    placed = { page: placed.page, cursorY: placed.cursorY - SECTION_GAP + BLOCK_GAP };
  }
  placed = drawKeyValue(
    ctx,
    placed,
    'Total',
    `${input.report.totalRows} takes - ${input.report.totalGood} good. G good - NG no good - - not yet judged.`,
  );
  return placed;
};

const drawSoundReport = (
  ctx: PdfDocumentContext,
  cursor: PageCursor,
  input: SoundSetReportPdfInput,
): PageCursor => {
  let placed = cursor;
  if (input.report.rolls.length === 0) {
    return drawKeyValue(ctx, placed, 'Takes', 'No takes logged. The sound report derives from the continuity log.');
  }
  for (const roll of input.report.rolls) {
    placed = drawRollHeading(ctx, placed, roll.roll, roll.rows.length, roll.goodCount, roll.ngCount);
    placed = drawTableBlock(ctx, placed, SOUND_COLUMNS, roll.rows.map(soundRow), 'No takes on this roll.');
    placed = { page: placed.page, cursorY: placed.cursorY - SECTION_GAP + BLOCK_GAP };
  }
  placed = drawKeyValue(
    ctx,
    placed,
    'Total',
    `${input.report.totalRows} takes - ${input.report.totalGood} good. MOS rows are listed so a missing file reads as intended.`,
  );
  return placed;
};

const drawDailyReport = (
  ctx: PdfDocumentContext,
  cursor: PageCursor,
  input: DailySetReportPdfInput,
): PageCursor => {
  const report = input.report;
  let placed = drawSectionTitle(ctx, cursor, 'Day summary');
  placed = drawKeyValue(ctx, placed, 'Day', report.dayName);
  if (report.date) placed = drawKeyValue(ctx, placed, 'Date', report.date);
  if (report.crewCall) placed = drawKeyValue(ctx, placed, 'Call', report.crewCall);
  if (report.plannedWrap) {
    const window = formatWindow(input.plannedDayMinutes ?? null);
    placed = drawKeyValue(
      ctx,
      placed,
      'Planned wrap',
      window ? `${report.plannedWrap} (${window} window)` : report.plannedWrap,
    );
  }
  if (input.director) placed = drawKeyValue(ctx, placed, 'Director', input.director);
  if (input.firstAd) placed = drawKeyValue(ctx, placed, '1st AD', input.firstAd);
  placed = drawKeyValue(ctx, placed, 'Schedule', report.scheduleVarianceLabel ?? '-');
  placed = drawKeyValue(
    ctx,
    placed,
    'Scenes',
    `${report.scenesCompleted}/${report.scenesScheduled} completed`,
  );
  placed = drawKeyValue(
    ctx,
    placed,
    'Pages',
    `${formatPageEighths(report.pagesCoveredEighths)}/${formatPageEighths(report.pagesScheduledEighths)} shot/scheduled`,
  );
  placed = drawKeyValue(
    ctx,
    placed,
    'Setups',
    `${report.setupsCompleted}/${report.setupsScheduled} completed`,
  );
  placed = drawKeyValue(
    ctx,
    placed,
    'Shots',
    `${report.shotsCovered}/${report.shotsScheduled} covered - ${report.shotsAttempted} with no good take`,
  );
  placed = drawKeyValue(
    ctx,
    placed,
    'Takes',
    `${report.takesLogged} logged - ${report.takesGood} good - ${report.takesNg} NG`,
  );
  placed = drawKeyValue(
    ctx,
    placed,
    'Shooting span',
    `${report.firstTakeAt ?? '-'} to ${report.lastTakeAt ?? '-'} (${formatSpan(report.shootingSpanMinutes)})`,
  );
  placed = { page: placed.page, cursorY: placed.cursorY - SECTION_GAP + BLOCK_GAP };

  placed = drawSectionTitle(ctx, placed, 'Scenes');
  placed = drawTableBlock(
    ctx,
    placed,
    SCENE_COLUMNS,
    report.scenes.map((scene) => [
      scene.sceneNumber,
      formatPageEighths(scene.pageEighths),
      String(scene.plannedShots),
      String(scene.coveredShots),
      scene.complete ? 'Complete' : 'Incomplete',
    ]),
    'Nothing scheduled on this day.',
  );
  placed = { page: placed.page, cursorY: placed.cursorY - SECTION_GAP + BLOCK_GAP };

  placed = drawSectionTitle(ctx, placed, 'Not covered');
  if (report.shotsNotShot.length === 0 && report.shotsAttempted === 0) {
    placed = drawKeyValue(ctx, placed, 'Not covered', 'Every shot scheduled for the day has a good take.');
  } else {
    if (report.shotsNotShot.length > 0) {
      placed = drawKeyValue(
        ctx,
        placed,
        `Not shot (${report.shotsNotShot.length})`,
        report.shotsNotShot.map((shot) => shot.shotNumber || shot.name || shot.shotId).join(', '),
      );
    }
    if (report.shotsAttempted > 0) {
      placed = drawKeyValue(ctx, placed, 'Shot with no good take', String(report.shotsAttempted));
    }
  }
  placed = { page: placed.page, cursorY: placed.cursorY - SECTION_GAP + BLOCK_GAP };

  if (report.shotsUnscheduled.length > 0) {
    placed = drawSectionTitle(ctx, placed, 'Shot but not scheduled');
    placed = drawTableBlock(
      ctx,
      placed,
      UNSCHEDULED_COLUMNS,
      report.shotsUnscheduled.map((shot) => [
        dash(shot.shotNumber),
        dash(shot.sceneNumber),
        dash(shot.name),
        String(shot.takeCount),
      ]),
      'No unscheduled shots.',
    );
    placed = { page: placed.page, cursorY: placed.cursorY - SECTION_GAP + BLOCK_GAP };
  }

  if (report.gearMovement && report.gearMovement.length > 0) {
    placed = drawSectionTitle(ctx, placed, 'Gear movement');
    placed = drawTableBlock(
      ctx,
      placed,
      GEAR_COLUMNS,
      report.gearMovement.map((row) => [row.name, row.kind, row.journey ?? 'Not marked']),
      'No gear routed to this day.',
    );
  }
  return placed;
};

/** Render the set report variant and return the finished PDF bytes. */
export const createSetReportPdf = async (input: SetReportPdfInput): Promise<Uint8Array> => {
  const documentTitle = VARIANT_TITLE[input.variant];
  const totalRows =
    input.variant === 'daily'
      ? input.report.takesLogged
      : input.report.totalRows;
  const totalGood =
    input.variant === 'daily' ? input.report.takesGood : input.report.totalGood;
  const scopeBits = [
    input.scopeLabel && input.scopeLabel.trim() !== '' ? input.scopeLabel.trim() : null,
    input.crewLine && input.crewLine.trim() !== '' ? input.crewLine.trim() : null,
    `${totalRows} takes - ${totalGood} good`,
  ].filter((bit): bit is string => bit !== null);
  const ctx = await createPdfDocument({
    title: `${documentTitle} - ${input.productionTitle}`,
    subject: documentTitle,
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
    documentTitle,
    subtitle: scopeBits.join('  |  '),
    logo,
  });
  const cursor: PageCursor = { page, cursorY: headerY };
  if (input.variant === 'camera') drawCameraReport(ctx, cursor, input);
  else if (input.variant === 'sound') drawSoundReport(ctx, cursor, input);
  else drawDailyReport(ctx, cursor, input);
  return finalizePdfDocument(ctx);
};
