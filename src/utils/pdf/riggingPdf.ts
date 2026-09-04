/**
 * Rigging plan PDF.
 *
 * Printable data model (mirrors `RiggingPrintView` and its
 * `buildRiggingPrintModel` read-only):
 * - One block per truss run: profile and geometry facts, suspended loads
 *   with per-unit and line weights plus their source (catalogue / manual /
 *   unknown), load totals kept as separate checkable rows (known loads,
 *   self-weight, clamp and safety hardware at assumed weights, cable
 *   allowance, planned total), rigging hardware, and the capacity verdict.
 * - Hardware attached to no run still prints under its own heading: it has
 *   to be packed and hung all the same.
 * - The hardware-weight assumptions print in full so a rigger who disagrees
 *   with a figure can see it rather than infer it from a total.
 *
 * Unknown figures print as an em dash and are never counted as zero.
 * Landscape A4 by default.
 */

import type { PDFPage } from 'pdf-lib';
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

export interface RiggingPdfLoad {
  label: string;
  quantity: number;
  /** Per-unit weight; absent stays unknown and prints as an em dash. */
  unitKg?: number | null;
  /** Combined weight for the row; absent whenever the unit weight is. */
  lineKg?: number | null;
  /** Where the weight came from, e.g. "Catalogue", "Manual", "Unknown". */
  sourceLabel: string;
}

export interface RiggingPdfHardware {
  kindLabel: string;
  label?: string;
  /** Distance along the run from its origin, in mm. */
  positionMm?: number;
  /** Rated capacity for motors and hang points. */
  capacityKg?: number | null;
  notes?: string;
}

export interface RiggingPdfRun {
  /** Element label, falling back to the profile name. */
  name: string;
  profileLabel: string;
  geometryLabel?: string;
  lengthMm?: number;
  /** True when the length shown is the profile length, not an override. */
  lengthFromProfile: boolean;
  selfWeightKg: number | null;
  loadsKg: number;
  unknownLoadCount: number;
  clampsKg: number;
  clampCount: number;
  safetyCount: number;
  cableAllowanceKg?: number | null;
  totalKg: number | null;
  /** Preformatted verdict line, e.g. "Within capacity - 42% of 500 kg". */
  verdict: string;
  loads: RiggingPdfLoad[];
  hardware: RiggingPdfHardware[];
}

export interface RiggingPdfInput {
  productionTitle: string;
  scopeLabel?: string;
  runs: RiggingPdfRun[];
  /** Hardware attached to no truss run. */
  unassignedHardware: RiggingPdfHardware[];
  /** Full assumption sentence, e.g. clamp / safety / cable weights. */
  assumptionsLine?: string;
  pageSize?: PdfPageSize;
  orientation?: PdfOrientation;
  generatedAt?: Date;
  draft?: boolean | string;
  confidentialityLine?: string;
  /** Raw PNG bytes for the production logo; corrupt bytes print logo-less. */
  logoPngBytes?: Uint8Array;
}

export interface RiggingPdfFilenameInput {
  productionTitle: string;
  scopeLabel?: string;
  date?: string;
}

/** `my-film_rigging-plan.pdf`. */
export const buildRiggingPdfFilename = (input: RiggingPdfFilenameInput): string =>
  buildPdfFilename({
    production: input.productionTitle,
    document: 'rigging-plan',
    ...(input.scopeLabel === undefined ? {} : { qualifier: input.scopeLabel }),
    ...(input.date === undefined ? {} : { date: input.date }),
  });

const LOAD_COLUMNS: PdfTableColumn[] = [
  { header: 'Item', widthFrac: 40 },
  { header: 'Qty', widthFrac: 8, align: 'center' },
  { header: 'Unit', widthFrac: 16, align: 'center' },
  { header: 'Line', widthFrac: 16, align: 'center' },
  { header: 'Source', widthFrac: 20 },
];

const HARDWARE_COLUMNS: PdfTableColumn[] = [
  { header: 'Kind', widthFrac: 18 },
  { header: 'Label / note', widthFrac: 50 },
  { header: 'Position', widthFrac: 14, align: 'center' },
  { header: 'Rated', widthFrac: 18, align: 'center' },
];

const SECTION_TITLE_SIZE = 11;
const RUN_TITLE_SIZE = 10;
const BODY_SIZE = 9;
const BODY_LINE_HEIGHT = BODY_SIZE * 1.35;
const BLOCK_GAP = 6;
const SECTION_GAP = 10;

interface PageCursor {
  page: PDFPage;
  cursorY: number;
}

/** "12.5 kg" / em dash for anything unknown: blanks never print as 0. */
export const formatRiggingKg = (kg: number | null | undefined): string =>
  kg === null || kg === undefined ? '---' : `${Number(kg.toFixed(2))} kg`;

const formatMm = (mm: number | undefined): string =>
  mm === undefined ? '---' : `${Math.round(mm)} mm`;

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

const drawTableBlock = (
  ctx: PdfDocumentContext,
  cursor: PageCursor,
  columns: PdfTableColumn[],
  rows: string[][],
  placeholder: string,
): PageCursor => {
  if (rows.length === 0) return drawBodyLines(ctx, cursor, placeholder);
  const result = drawPdfTable(ctx, cursor.page, cursor.cursorY, columns, rows);
  return { page: result.page, cursorY: result.cursorY };
};

const drawRun = (ctx: PdfDocumentContext, cursor: PageCursor, run: RiggingPdfRun): PageCursor => {
  const facts = [
    run.profileLabel,
    run.geometryLabel ?? null,
    run.lengthMm === undefined
      ? null
      : `${formatMm(run.lengthMm)}${run.lengthFromProfile ? ' (profile)' : ''}`,
  ].filter((bit): bit is string => bit !== null);
  let placed = ensureSpace(ctx, cursor, RUN_TITLE_SIZE + 26);
  placed.page.drawText(sanitizePdfText(run.name), {
    x: ctx.margins.left,
    y: placed.cursorY - RUN_TITLE_SIZE,
    size: RUN_TITLE_SIZE,
    font: ctx.bold,
  });
  placed = { page: placed.page, cursorY: placed.cursorY - RUN_TITLE_SIZE - 2 };
  if (facts.length > 0) {
    placed = drawBodyLines(ctx, placed, facts.join(' - '));
  }

  placed = drawSectionTitle(ctx, placed, 'Suspended loads');
  placed = drawTableBlock(
    ctx,
    placed,
    LOAD_COLUMNS,
    run.loads.map((load) => [
      load.label.trim() === '' ? 'Unnamed load' : load.label,
      String(load.quantity),
      formatRiggingKg(load.unitKg),
      formatRiggingKg(load.lineKg),
      load.sourceLabel,
    ]),
    'No loads recorded on this run.',
  );
  placed = drawKeyValue(
    ctx,
    placed,
    'Known loads',
    run.unknownLoadCount > 0
      ? `${formatRiggingKg(run.loadsKg)} (${run.unknownLoadCount} without a weight - not counted)`
      : formatRiggingKg(run.loadsKg),
  );
  placed = drawKeyValue(ctx, placed, 'Truss self-weight', formatRiggingKg(run.selfWeightKg));
  placed = drawKeyValue(
    ctx,
    placed,
    `Clamps (${run.clampCount}) + safeties (${run.safetyCount}) at assumed weights`,
    formatRiggingKg(run.clampsKg),
  );
  placed = drawKeyValue(ctx, placed, 'Cable allowance', formatRiggingKg(run.cableAllowanceKg));
  placed = drawKeyValue(ctx, placed, 'Planned total on the run', formatRiggingKg(run.totalKg));

  placed = drawSectionTitle(ctx, placed, 'Rigging hardware');
  placed = drawTableBlock(
    ctx,
    placed,
    HARDWARE_COLUMNS,
    run.hardware.map((item) => [
      item.kindLabel,
      [item.label, item.notes].filter((part) => part && part.trim() !== '').join(' - ') || '---',
      formatMm(item.positionMm),
      formatRiggingKg(item.capacityKg),
    ]),
    'No hardware recorded on this run.',
  );

  placed = drawBodyLines(ctx, placed, run.verdict);
  return { page: placed.page, cursorY: placed.cursorY - SECTION_GAP + BLOCK_GAP };
};

/** Render the rigging plan and return the finished PDF bytes. */
export const createRiggingPdf = async (input: RiggingPdfInput): Promise<Uint8Array> => {
  const subtitleBits = [
    input.scopeLabel && input.scopeLabel.trim() !== '' ? input.scopeLabel.trim() : null,
    `${input.runs.length} truss run${input.runs.length === 1 ? '' : 's'}`,
  ].filter((bit): bit is string => bit !== null);

  const ctx = await createPdfDocument({
    title: `Rigging Plan - ${input.productionTitle}`,
    subject: 'Rigging plan',
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
    documentTitle: 'Rigging Plan',
    subtitle: subtitleBits.join('  |  '),
    logo,
  });
  let cursor: PageCursor = { page, cursorY: headerY };

  if (input.runs.length === 0) {
    cursor = drawBodyLines(ctx, cursor, 'No truss runs planned yet.');
  } else {
    for (const run of input.runs) {
      cursor = drawRun(ctx, cursor, run);
    }
  }

  if (input.unassignedHardware.length > 0) {
    cursor = drawSectionTitle(ctx, cursor, 'Hardware not on a run');
    cursor = drawTableBlock(
      ctx,
      cursor,
      HARDWARE_COLUMNS,
      input.unassignedHardware.map((item) => [
        item.kindLabel,
        [item.label, item.notes].filter((part) => part && part.trim() !== '').join(' - ') || '---',
        formatMm(item.positionMm),
        formatRiggingKg(item.capacityKg),
      ]),
      'No unassigned hardware.',
    );
    cursor = { page: cursor.page, cursorY: cursor.cursorY - SECTION_GAP + BLOCK_GAP };
  }

  if (input.assumptionsLine && input.assumptionsLine.trim() !== '') {
    drawBodyLines(ctx, cursor, input.assumptionsLine.trim());
  }

  return finalizePdfDocument(ctx);
};
