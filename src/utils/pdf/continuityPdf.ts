/**
 * Continuity report PDF (script report + shooting-day checklist).
 *
 * Printable data model (mirrors `ContinuityPrintView`, read-only): the
 * checklist first — the page the 1st AD reads at wrap — then the continuity
 * log behind it, then the gaps. The take rows are the same rows the Resolve
 * CSV exports, so paper and file describe the same takes.
 *
 * Unknown-value handling (mirrors the view): unknown prints as an em dash,
 * never as a plausible guess. A take not yet judged prints a dash in the
 * good-take column; status words ("Good take", "Shot, no good take",
 * "Not shot") are the view's own, not re-derived here.
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

export interface ContinuityPdfTakeDetail {
  soundRoll?: string;
  soundFileName?: string;
  soundNotes?: string;
  mos?: boolean;
  wildTrack?: boolean;
  slateDate?: string;
  slateLocation?: string;
  slateEnvironment?: string;
  slateDayNight?: string;
  cameraLabel?: string;
  shutterSpeed?: string;
  whitePointKelvin?: string;
  filter?: string;
  cameraNotes?: string;
}

export interface ContinuityPdfTakeRow {
  scene: string;
  shot: string;
  take: string;
  /** "1", "0", or empty while the take has not been judged. */
  goodTake: string;
  fileName: string;
  rollCard: string;
  description: string;
  comments: string;
  keywords: string;
  cameraSummary: string;
  /** Appendix fields the log table cannot fit; absent when the take needs none. */
  detail?: ContinuityPdfTakeDetail;
}

/** One continuity-binder note, with its subject resolved for paper. */
export interface ContinuityPdfNote {
  /** Already labelled department, e.g. "Wardrobe". */
  department: string;
  /** Character name, free-text subject, or empty when neither is set. */
  subject: string;
  sceneNumber?: string;
  scriptDay?: string;
  description: string;
  notes?: string;
  photoCount: number;
}

export interface ContinuityPdfChecklistRow {
  shot: string;
  scene: string;
  name: string;
  takeCount: number;
  covered: boolean;
  unplanned: boolean;
}

export interface ContinuityPdfTotals {
  takes: number;
  goodTakes: number;
  plannedShots: number;
  coveredShots: number;
  /** Takes with no file name yet — the reconciliation pass is unfinished. */
  withoutFileName: number;
}

export interface ContinuityPdfInput {
  productionTitle: string;
  company?: string;
  director?: string;
  cinematographer?: string;
  scriptSupervisor?: string;
  /** "Day 3 · 2024-05-21", or absent when no day is scoped. */
  scopeLabel?: string;
  takeRows: ContinuityPdfTakeRow[];
  checklist: ContinuityPdfChecklistRow[];
  unscheduled: ContinuityPdfChecklistRow[];
  /** Binder notes, in entry order. Empty when the production keeps none. */
  notes: ContinuityPdfNote[];
  gaps: {
    notShot: ContinuityPdfChecklistRow[];
    noGoodTake: ContinuityPdfChecklistRow[];
  };
  totals: ContinuityPdfTotals;
  pageSize?: PdfPageSize;
  orientation?: PdfOrientation;
  generatedAt?: Date;
  draft?: boolean | string;
  confidentialityLine?: string;
  /** Raw PNG bytes for the production logo; corrupt bytes print logo-less. */
  logoPngBytes?: Uint8Array;
}

export interface ContinuityPdfFilenameInput {
  productionTitle: string;
  qualifier?: string;
  date?: string;
}

/** `my-film_continuity-report_day-03.pdf`, with optional scope and date segments. */
export const buildContinuityPdfFilename = (input: ContinuityPdfFilenameInput): string =>
  buildPdfFilename({
    production: input.productionTitle,
    document: 'continuity-report',
    ...(input.qualifier === undefined ? {} : { qualifier: input.qualifier }),
    ...(input.date === undefined ? {} : { date: input.date }),
  });

const DASH = '—';

const dash = (value: string | undefined): string => (value && value.trim() !== '' ? value : DASH);

/** View's own marks, in WinAnsi-safe words: the PDF has no symbol font to borrow. */
const goodTakeLabel = (value: string): string => {
  if (value === '1') return 'Good';
  if (value === '0') return 'No good';
  return DASH;
};

const checklistStatus = (row: ContinuityPdfChecklistRow): string => {
  if (row.covered) return 'Good take';
  if (row.takeCount > 0) return 'Shot, no good take';
  return 'Not shot';
};

const CHECKLIST_COLUMNS: PdfTableColumn[] = [
  { header: 'Shot', widthFrac: 12 },
  { header: 'Scene', widthFrac: 10 },
  { header: 'Description', widthFrac: 44 },
  { header: 'Takes', widthFrac: 8, align: 'center' },
  { header: 'Status', widthFrac: 26 },
];

const LOG_COLUMNS: PdfTableColumn[] = [
  { header: 'Sc', widthFrac: 7 },
  { header: 'Sh', widthFrac: 9 },
  { header: 'Tk', widthFrac: 6, align: 'center' },
  { header: 'Good', widthFrac: 10, align: 'center' },
  { header: 'File name', widthFrac: 16 },
  { header: 'Card', widthFrac: 10 },
  { header: 'Description / comments', widthFrac: 26 },
  { header: 'Camera', widthFrac: 16 },
];

const DETAIL_COLUMNS: PdfTableColumn[] = [
  { header: 'Take', widthFrac: 18 },
  { header: 'Sound', widthFrac: 28 },
  { header: 'Slate', widthFrac: 26 },
  { header: 'Camera', widthFrac: 28 },
];

/** Join only the filled bits; unknowns stay absent, never guessed. */
const joinBits = (parts: (string | undefined)[]): string =>
  parts
    .map((part) => part?.trim() ?? '')
    .filter((part) => part !== '')
    .join(' · ');

const takeDetailLabel = (row: ContinuityPdfTakeRow): string => {
  const label = joinBits([
    row.scene.trim() !== '' ? `Sc ${row.scene.trim()}` : undefined,
    row.shot.trim() !== '' ? `Sh ${row.shot.trim()}` : undefined,
    row.take.trim() !== '' ? `Tk ${row.take.trim()}` : undefined,
  ]);
  return label === '' ? DASH : label;
};

const soundDetailCell = (detail: ContinuityPdfTakeDetail): string => {
  const text = joinBits([
    detail.soundRoll,
    detail.soundFileName,
    detail.soundNotes,
    detail.mos === true ? 'MOS' : undefined,
    detail.wildTrack === true ? 'Wild track' : undefined,
  ]);
  return text === '' ? DASH : text;
};

const slateDetailCell = (detail: ContinuityPdfTakeDetail): string =>
  joinBits([detail.slateDate, detail.slateLocation, detail.slateEnvironment, detail.slateDayNight]) || DASH;

const cameraDetailCell = (detail: ContinuityPdfTakeDetail): string =>
  joinBits([
    detail.cameraLabel,
    detail.shutterSpeed,
    detail.whitePointKelvin,
    detail.filter,
    detail.cameraNotes,
  ]) || DASH;

/** `subject · Sc X · Day Y`, with only the filled bits joined. */
const continuityNoteHeading = (note: ContinuityPdfNote): string =>
  joinBits([
    note.subject,
    note.sceneNumber?.trim() ? `Sc ${note.sceneNumber.trim()}` : undefined,
    note.scriptDay?.trim() ? `Day ${note.scriptDay.trim()}` : undefined,
  ]);

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

/** Render the continuity report and return the finished PDF bytes. */
export const createContinuityPdf = async (input: ContinuityPdfInput): Promise<Uint8Array> => {
  const missing = input.gaps.notShot.length + input.gaps.noGoodTake.length;

  const ctx = await createPdfDocument({
    title: `Continuity Report - ${input.productionTitle}`,
    subject: 'Continuity report',
    pageSize: input.pageSize ?? 'A4',
    orientation: input.orientation ?? 'landscape',
    productionTitle: input.productionTitle,
    generatedAt: input.generatedAt,
    draft: input.draft,
    confidentialityLine: input.confidentialityLine,
  });
  const logo = await embedProductionLogoPng(ctx.doc, input.logoPngBytes);
  const page = addPdfPage(ctx);
  const scopeBits = [
    `${input.totals.takes} take${input.totals.takes === 1 ? '' : 's'}`,
    `${input.totals.plannedShots} shot${input.totals.plannedShots === 1 ? '' : 's'} planned`,
  ];
  if (input.scopeLabel && input.scopeLabel.trim() !== '') scopeBits.unshift(input.scopeLabel.trim());
  if (input.company && input.company.trim() !== '') scopeBits.unshift(input.company.trim());
  const headerY = drawDocumentHeader(ctx, page, ctx.contentTop, {
    productionTitle: input.productionTitle,
    documentTitle: 'Continuity Report',
    subtitle: scopeBits.join(' · '),
    logo,
  });
  let cursor: PageCursor = { page, cursorY: headerY };

  // Credits and coverage at a glance, each fact one searchable line.
  cursor = drawSectionTitle(ctx, cursor, 'Coverage');
  if (input.director) cursor = drawKeyValue(ctx, cursor, 'Director', input.director);
  if (input.cinematographer) cursor = drawKeyValue(ctx, cursor, 'DOP', input.cinematographer);
  if (input.scriptSupervisor) cursor = drawKeyValue(ctx, cursor, 'Script supervisor', input.scriptSupervisor);
  cursor = drawKeyValue(ctx, cursor, 'Good takes', String(input.totals.goodTakes));
  cursor = drawKeyValue(ctx, cursor, 'Shots covered', `${input.totals.coveredShots}/${input.totals.plannedShots}`);
  cursor = drawKeyValue(ctx, cursor, 'Not covered', String(missing));
  cursor = { page: cursor.page, cursorY: cursor.cursorY - SECTION_GAP + BLOCK_GAP };

  // The checklist first: at wrap it is the page people actually read.
  cursor = drawSectionTitle(ctx, cursor, 'Shooting-day checklist');
  if (input.checklist.length === 0) {
    cursor = drawBodyLines(ctx, cursor, 'Nothing scheduled for this day. Schedule scenes, setups or shots to build the checklist.');
    cursor = { page: cursor.page, cursorY: cursor.cursorY - SECTION_GAP + BLOCK_GAP };
  } else {
    const rows = input.checklist.map((row) => [
      dash(row.shot),
      dash(row.scene),
      dash(row.name),
      String(row.takeCount),
      checklistStatus(row),
    ]);
    const result = drawPdfTable(ctx, cursor.page, cursor.cursorY, CHECKLIST_COLUMNS, rows);
    cursor = { page: result.page, cursorY: result.cursorY - SECTION_GAP + BLOCK_GAP };
  }

  if (missing > 0) {
    cursor = drawSectionTitle(ctx, cursor, 'Gaps');
    if (input.gaps.notShot.length > 0) {
      cursor = drawKeyValue(
        ctx,
        cursor,
        `Not shot (${input.gaps.notShot.length})`,
        input.gaps.notShot.map((row) => dash(row.shot)).join(', '),
      );
    }
    if (input.gaps.noGoodTake.length > 0) {
      cursor = drawKeyValue(
        ctx,
        cursor,
        `Shot but no good take (${input.gaps.noGoodTake.length})`,
        input.gaps.noGoodTake.map((row) => dash(row.shot)).join(', '),
      );
    }
    cursor = { page: cursor.page, cursorY: cursor.cursorY - SECTION_GAP + BLOCK_GAP };
  } else if (input.checklist.length > 0) {
    cursor = drawBodyLines(ctx, cursor, 'Every shot scheduled for this day has a good take.');
    cursor = { page: cursor.page, cursorY: cursor.cursorY - SECTION_GAP + BLOCK_GAP };
  }

  if (input.unscheduled.length > 0) {
    cursor = drawSectionTitle(ctx, cursor, 'Shot but not planned');
    const rows = input.unscheduled.map((row) => [
      row.unplanned ? `${dash(row.shot)} (unplanned)` : dash(row.shot),
      dash(row.scene),
      dash(row.name),
      String(row.takeCount),
      row.covered ? 'Good base take' : 'No good base take',
    ]);
    const result = drawPdfTable(ctx, cursor.page, cursor.cursorY, CHECKLIST_COLUMNS, rows);
    cursor = { page: result.page, cursorY: result.cursorY - SECTION_GAP + BLOCK_GAP };
  }

  cursor = drawSectionTitle(ctx, cursor, 'Continuity log');
  if (input.takeRows.length === 0) {
    cursor = drawBodyLines(ctx, cursor, 'No takes logged for this day yet.');
  } else {
    const rows = input.takeRows.map((row) => [
      dash(row.scene),
      dash(row.shot),
      dash(row.take),
      goodTakeLabel(row.goodTake),
      dash(row.fileName),
      dash(row.rollCard),
      [dash(row.description), row.comments, row.keywords].filter((part) => part.trim() !== '').join('\n'),
      dash(row.cameraSummary),
    ]);
    const result = drawPdfTable(ctx, cursor.page, cursor.cursorY, LOG_COLUMNS, rows);
    cursor = { page: result.page, cursorY: result.cursorY };
  }
  cursor = { page: cursor.page, cursorY: cursor.cursorY - SECTION_GAP + BLOCK_GAP };

  // Appendix for everything the log table cannot fit; one row per take that has detail.
  const detailedRows = input.takeRows.filter((row) => row.detail !== undefined);
  if (detailedRows.length > 0) {
    cursor = drawSectionTitle(ctx, cursor, 'Take details');
    const rows = detailedRows.map((row) => {
      const detail = row.detail as ContinuityPdfTakeDetail;
      return [takeDetailLabel(row), soundDetailCell(detail), slateDetailCell(detail), cameraDetailCell(detail)];
    });
    const result = drawPdfTable(ctx, cursor.page, cursor.cursorY, DETAIL_COLUMNS, rows);
    cursor = { page: result.page, cursorY: result.cursorY - SECTION_GAP + BLOCK_GAP };
  }

  // Binder notes grouped by department in first-seen order.
  const notes = input.notes;
  if (notes.length > 0) {
    cursor = drawSectionTitle(ctx, cursor, 'Continuity notes');
    const seenDepartments: string[] = [];
    const byDepartment = new Map<string, ContinuityPdfNote[]>();
    for (const note of notes) {
      const existing = byDepartment.get(note.department);
      if (existing) {
        existing.push(note);
      } else {
        byDepartment.set(note.department, [note]);
        seenDepartments.push(note.department);
      }
    }
    for (const department of seenDepartments) {
      cursor = drawBodyLines(ctx, cursor, department);
      for (const note of byDepartment.get(department) ?? []) {
        const heading = continuityNoteHeading(note);
        if (heading !== '') cursor = drawBodyLines(ctx, cursor, heading);
        if (note.description.trim() !== '') cursor = drawBodyLines(ctx, cursor, note.description);
        if (note.notes !== undefined && note.notes.trim() !== '') cursor = drawBodyLines(ctx, cursor, note.notes);
        cursor = drawBodyLines(ctx, cursor, `${note.photoCount} photo(s)`);
      }
    }
    cursor = { page: cursor.page, cursorY: cursor.cursorY - SECTION_GAP + BLOCK_GAP };
  }

  cursor = drawBodyLines(
    ctx,
    cursor,
    `Good take marks: Good / No good / ${DASH} not judged${input.totals.withoutFileName > 0 ? ` · ${input.totals.withoutFileName} take${input.totals.withoutFileName === 1 ? '' : 's'} without a file name` : ''}`,
  );
  void cursor;

  return finalizePdfDocument(ctx);
};
