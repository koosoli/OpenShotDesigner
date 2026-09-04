/**
 * DMX patch sheet PDF.
 *
 * Printable data model (mirrors `DmxPatchPrintView` read-only):
 * - Patched block ordered by universe then address: Universe, Address,
 *   Range (inclusive footprint), Ch (channel count), Fixture, Label, Type,
 *   Mode. Addresses print zero-padded to three digits, like a console.
 * - Unpatched block for fixtures with no universe/address or an unknown
 *   footprint, so nothing on the plan silently vanishes from the paper.
 * - Address conflicts flagged inline (`[CONFLICT]`) and summarised in a
 *   note, because overlapping footprints are the failure this sheet exists
 *   to catch before show time.
 *
 * Landscape A4 by default: eight columns need the width.
 */

import type { PDFPage } from 'pdf-lib';
import type { DmxPatchSheetRow } from '../../utils/dmxPatch';
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

/** One printable DMX row, plain data so the layer stays React-free. */
export interface DmxPatchPdfRow {
  label: string;
  /** The production's own name for the fixture, when it differs from `label`. */
  role?: string;
  universe?: number;
  address?: number;
  /** Inclusive last channel of the footprint; undefined when unknown. */
  endAddress?: number;
  channels?: number;
  fixtureType?: string;
  /** DMX mode / profile name, e.g. "Extended 16ch". */
  mode?: string;
  conflict?: boolean;
}

export interface DmxPatchPdfInput {
  productionTitle: string;
  sceneName?: string;
  rows: DmxPatchPdfRow[];
  pageSize?: PdfPageSize;
  orientation?: PdfOrientation;
  generatedAt?: Date;
  draft?: boolean | string;
  confidentialityLine?: string;
  /** Raw PNG bytes for the production logo; corrupt bytes print logo-less. */
  logoPngBytes?: Uint8Array;
}

export interface DmxPatchPdfFilenameInput {
  productionTitle: string;
  sceneName?: string;
  date?: string;
}

/** `my-film_dmx-patch_scene-4.pdf`. */
export const buildDmxPatchPdfFilename = (input: DmxPatchPdfFilenameInput): string =>
  buildPdfFilename({
    production: input.productionTitle,
    document: 'dmx-patch',
    ...(input.sceneName === undefined ? {} : { qualifier: input.sceneName }),
    ...(input.date === undefined ? {} : { date: input.date }),
  });

const PATCHED_COLUMNS: PdfTableColumn[] = [
  { header: 'Universe', widthFrac: 9, align: 'center' },
  { header: 'Address', widthFrac: 9, align: 'center' },
  { header: 'Range', widthFrac: 14, align: 'center' },
  { header: 'Ch', widthFrac: 6, align: 'center' },
  { header: 'Fixture', widthFrac: 20 },
  { header: 'Label', widthFrac: 14 },
  { header: 'Type', widthFrac: 14 },
  { header: 'Mode', widthFrac: 14 },
];

const UNPATCHED_COLUMNS: PdfTableColumn[] = [
  { header: 'Fixture', widthFrac: 34 },
  { header: 'Label', widthFrac: 22 },
  { header: 'Type', widthFrac: 22 },
  { header: 'Footprint', widthFrac: 22, align: 'center' },
];

const SECTION_TITLE_SIZE = 11;
const BODY_SIZE = 9;
const BODY_LINE_HEIGHT = BODY_SIZE * 1.35;
const BLOCK_GAP = 6;

interface PageCursor {
  page: PDFPage;
  cursorY: number;
}

/** Map print-view sheet rows to PDF rows, keeping the console readout order. */
export const dmxPatchRowsFromSheetRows = (rows: DmxPatchSheetRow[]): DmxPatchPdfRow[] =>
  rows.map((row) => ({
    label: row.label,
    role: row.role,
    universe: row.universe,
    address: row.address,
    endAddress: row.endAddress,
    channels: row.channels,
    fixtureType: row.fixtureType,
    mode: row.dmxModeName,
    conflict: row.conflict,
  }));

const padAddress = (value: number | undefined): string =>
  value === undefined ? '---' : String(value).padStart(3, '0');

const formatRange = (row: DmxPatchPdfRow): string =>
  row.address !== undefined && row.endAddress !== undefined
    ? `${padAddress(row.address)}-${padAddress(row.endAddress)}`
    : '---';

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

/** Render the DMX patch sheet and return the finished PDF bytes. */
export const createDmxPatchPdf = async (input: DmxPatchPdfInput): Promise<Uint8Array> => {
  const patched = input.rows.filter((row) => row.universe !== undefined && row.address !== undefined);
  const unpatched = input.rows.filter((row) => row.universe === undefined || row.address === undefined);
  const conflicts = patched.filter((row) => row.conflict === true);
  const universes = [...new Set(patched.map((row) => row.universe as number))].sort((a, b) => a - b);
  const subtitleBits = [
    input.sceneName && input.sceneName.trim() !== '' ? input.sceneName.trim() : null,
    `${input.rows.length} fixture${input.rows.length === 1 ? '' : 's'} - ${patched.length} patched`,
    universes.length > 0 ? `Universes: ${universes.join(', ')}` : null,
  ].filter((bit): bit is string => bit !== null);

  const ctx = await createPdfDocument({
    title: `DMX Patch - ${input.productionTitle}`,
    subject: 'DMX patch sheet',
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
    documentTitle: 'DMX Patch Sheet',
    subtitle: subtitleBits.join('  |  '),
    logo,
  });
  let cursor: PageCursor = { page, cursorY: headerY };

  cursor = drawSectionTitle(ctx, cursor, 'Patched fixtures');
  if (patched.length === 0) {
    cursor = drawBodyLines(ctx, cursor, 'No fixtures patched yet.');
  } else {
    const tableRows = patched.map((row) => [
      String(row.universe),
      padAddress(row.address),
      formatRange(row),
      row.channels === undefined ? '?' : String(row.channels),
      row.conflict === true ? `${row.label} [CONFLICT]` : row.label,
      row.role ?? '---',
      row.fixtureType ?? '---',
      row.mode ?? '---',
    ]);
    const result = drawPdfTable(ctx, cursor.page, cursor.cursorY, PATCHED_COLUMNS, tableRows);
    cursor = { page: result.page, cursorY: result.cursorY };
  }

  cursor = drawSectionTitle(ctx, cursor, 'Unpatched / unknown footprint');
  if (unpatched.length === 0) {
    cursor = drawBodyLines(ctx, cursor, 'Every fixture on the plan is patched.');
  } else {
    const tableRows = unpatched.map((row) => [
      row.label,
      row.role ?? '---',
      row.fixtureType ?? '---',
      row.channels === undefined ? 'channels unknown - set in fixture inspector' : `${row.channels} ch`,
    ]);
    const result = drawPdfTable(ctx, cursor.page, cursor.cursorY, UNPATCHED_COLUMNS, tableRows);
    cursor = { page: result.page, cursorY: result.cursorY };
  }

  if (conflicts.length > 0) {
    const summary = `${conflicts.length} address conflict${conflicts.length === 1 ? '' : 's'}: ${conflicts
      .map((row) => `${row.label} (U${row.universe}:${padAddress(row.address)})`)
      .join(' - ')} - resolve before show time.`;
    drawBodyLines(ctx, cursor, summary);
  }

  return finalizePdfDocument(ctx);
};
