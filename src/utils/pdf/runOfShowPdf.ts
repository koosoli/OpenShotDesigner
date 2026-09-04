/**
 * Run-of-show PDF (roadmap Phase 3: people/set report).
 *
 * Printable data model (mirrors `PrintableRunOfShowCue` from
 * `RunOfShowPrintView`, derived by `buildRunOfShowSheet` in
 * `domain/scheduling/runOfShow`):
 * - Numbered cues in calling order with label, segment, resolved start,
 *   length and per-department notes, plus the total run time and the
 *   cue-list issues. A null start or length prints as "-" (unknown is not
 *   zero) exactly like the print view.
 *
 * The print view renders each cue as two table rows (cue row + notes row);
 * the PDF renders one row per cue with a Notes column ("DEPT: text" joined
 * with " | ") so a cue never splits across pages and every note stays a
 * contiguous searchable token.
 *
 * Landscape A4 by default; StandardFonts only (offline); every drawn string
 * passes through `sanitizePdfText` via the shared shell and table renderer.
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
import type { PrintableRunOfShowCue } from '../../components/reports/RunOfShowPrintView';

export interface RunOfShowPdfNote {
  department: string;
  text: string;
}

export interface RunOfShowPdfCue {
  id: string;
  /** Position on the page, 1-based: the number the caller says out loud. */
  number: number;
  label: string;
  segmentName?: string;
  /** Resolved start, seconds past midnight; null prints as "-". */
  startSeconds: number | null;
  /** Null prints as "-" (unknown length is not a zero-length cue). */
  durationSeconds: number | null;
  notes: RunOfShowPdfNote[];
}

export interface RunOfShowPdfIssue {
  severity: string;
  message: string;
}

export interface RunOfShowPdfInput {
  productionTitle: string;
  /** Scope line under the heading; defaults to the cue count + run time. */
  subtitle?: string;
  cues: RunOfShowPdfCue[];
  /** Null when any cue has no duration, so the sheet says so. */
  totalRunTimeSeconds?: number | null;
  issues?: RunOfShowPdfIssue[];
  pageSize?: PdfPageSize;
  orientation?: PdfOrientation;
  generatedAt?: Date;
  draft?: boolean | string;
  confidentialityLine?: string;
  /** Raw PNG bytes for the production logo; corrupt bytes print logo-less. */
  logoPngBytes?: Uint8Array;
}

export interface RunOfShowPdfFilenameInput {
  productionTitle: string;
  qualifier?: string;
  date?: string;
}

/** `my-film_run-of-show.pdf`. */
export const buildRunOfShowPdfFilename = (input: RunOfShowPdfFilenameInput): string =>
  buildPdfFilename({
    production: input.productionTitle,
    document: 'run-of-show',
    ...(input.qualifier === undefined ? {} : { qualifier: input.qualifier }),
    ...(input.date === undefined ? {} : { date: input.date }),
  });

/** Pass-through mapper: the print view cue is already the PDF cue. */
export const runOfShowCuesFromPrintable = (cues: PrintableRunOfShowCue[]): RunOfShowPdfCue[] =>
  cues.map((cue) => ({
    id: cue.id,
    number: cue.number,
    label: cue.label,
    ...(cue.segmentName === undefined ? {} : { segmentName: cue.segmentName }),
    startSeconds: cue.startSeconds,
    durationSeconds: cue.durationSeconds,
    notes: cue.notes.map((note) => ({ department: note.department, text: note.text })),
  }));

const SECTION_TITLE_SIZE = 11;
const BODY_SIZE = 9;
const BODY_LINE_HEIGHT = BODY_SIZE * 1.35;
const SECTION_GAP = 10;
const BLOCK_GAP = 6;

const CUE_COLUMNS: PdfTableColumn[] = [
  { header: '#', widthFrac: 5, align: 'center' },
  { header: 'Cue', widthFrac: 28 },
  { header: 'Segment', widthFrac: 14 },
  { header: 'Start', widthFrac: 9, align: 'center' },
  { header: 'Length', widthFrac: 10, align: 'center' },
  { header: 'Notes', widthFrac: 34 },
];

interface PageCursor {
  page: PDFPage;
  cursorY: number;
}

/** "20:00" / "20:00:30" clock time; "-" when the start is unknown. */
const formatClock = (seconds: number | null): string => {
  if (seconds === null) return '-';
  const norm = ((seconds % 86400) + 86400) % 86400;
  const h = Math.floor(norm / 3600);
  const m = Math.floor((norm % 3600) / 60);
  const s = norm % 60;
  const mm = String(m).padStart(2, '0');
  return s > 0 ? `${h}:${mm}:${String(s).padStart(2, '0')}` : `${h}:${mm}`;
};

/** "1h 05m" / "45m 30s" / "-" for an unknown length (never silently 0). */
const formatDuration = (seconds: number | null): string => {
  if (seconds === null) return '-';
  if (seconds <= 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0) parts.push(`${s}s`);
  return parts.join(' ');
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

const cueNotesCell = (cue: RunOfShowPdfCue): string => {
  if (cue.notes.length === 0) return '-';
  return cue.notes.map((note) => `${note.department}: ${note.text}`).join('  |  ');
};

/** Render the run of show and return the finished PDF bytes. */
export const createRunOfShowPdf = async (input: RunOfShowPdfInput): Promise<Uint8Array> => {
  const total = input.totalRunTimeSeconds ?? null;
  const ctx = await createPdfDocument({
    title: `Run of Show - ${input.productionTitle}`,
    subject: 'Run of show',
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
    documentTitle: 'Run of Show',
    subtitle:
      input.subtitle ??
      `${input.cues.length} cue${input.cues.length === 1 ? '' : 's'}  |  Total run time ${formatDuration(total)}`,
    logo,
  });
  let cursor: PageCursor = { page, cursorY: headerY };

  cursor = drawSectionTitle(ctx, cursor, 'Cues');
  if (input.cues.length === 0) {
    cursor = drawKeyValue(ctx, cursor, 'Cues', 'No cues in the running order yet.');
  } else {
    const result = drawPdfTable(
      ctx,
      cursor.page,
      cursor.cursorY,
      CUE_COLUMNS,
      input.cues.map((cue) => [
        String(cue.number),
        cue.label.trim() === '' ? '-' : cue.label,
        cue.segmentName ?? '-',
        formatClock(cue.startSeconds),
        formatDuration(cue.durationSeconds),
        cueNotesCell(cue),
      ]),
    );
    cursor = { page: result.page, cursorY: result.cursorY };
    cursor = drawKeyValue(ctx, cursor, 'Total run time', formatDuration(total));
  }
  cursor = { page: cursor.page, cursorY: cursor.cursorY - SECTION_GAP + BLOCK_GAP };

  const issues = input.issues ?? [];
  if (issues.length > 0) {
    cursor = drawSectionTitle(ctx, cursor, 'Cue-list issues');
    for (const issue of issues) {
      cursor = drawKeyValue(ctx, cursor, issue.severity, issue.message);
    }
  }

  return finalizePdfDocument(ctx);
};
