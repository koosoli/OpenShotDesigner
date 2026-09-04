/**
 * AV (two-column) script PDF (roadmap Phase 3: script family).
 *
 * Printable data model (mirrors `AvScriptPrintView`, flattened so the PDF
 * layer stays React-free):
 * - Five columns: Shot #, Name & Size, Video (visuals & camera), Audio
 *   (VO, dialogue, SFX, music), Time. A linked row prints its shot's number
 *   (mirrors `avRowNumber` without importing the domain: the shot list owns
 *   numbering, so any stored copy here would be stale after a renumber).
 * - Shotless rows (titles, graphics, stock) print with a NO CAMERA tag and
 *   are never reported as gaps; the header carries the shot count and total
 *   running time like the print view.
 *
 * Landscape A4 by default (five columns need the width); StandardFonts only
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
import type { PdfOrientation, PdfPageSize } from './document';
import { buildPdfFilename } from './filenames';
import { drawPdfTable } from './tables';
import type { PdfTableColumn } from './tables';

/** One AV row, mirroring `AVScriptRow` in minimal printable form. */
export interface AvScriptPdfRow {
  id: string;
  shotNumber: string;
  shotName?: string;
  shotSize?: string;
  video: string;
  audio: string;
  durationSec?: number;
  linkedShotId?: string;
  /** Titles, graphics, stock: prints with NO CAMERA, never a coverage gap. */
  noShot?: boolean;
}

/** Minimum shot data needed to resolve a linked row's number. */
export interface AvScriptPdfShot {
  id: string;
  shotNumber: string;
}

export interface AvScriptPdfInput {
  productionTitle: string;
  /** Scope line; defaults to "N SHOTS · M:SS" like the print view. */
  subtitle?: string;
  rows: AvScriptPdfRow[];
  /** The shot list, so a linked row prints the shot's live number. */
  shots?: AvScriptPdfShot[];
  /** True prints a DRAFT watermark; a string prints that label instead. */
  draft?: boolean | string;
  /** Explicit lifecycle alternative to `draft`. */
  isDraft?: boolean;
  pageSize?: PdfPageSize;
  orientation?: PdfOrientation;
  generatedAt?: Date;
  confidentialityLine?: string;
  /** Raw PNG bytes for the production logo; corrupt bytes print logo-less. */
  logoPngBytes?: Uint8Array;
}

export interface AvScriptPdfFilenameInput {
  productionTitle: string;
  date?: string;
}

/** `my-film_av-script.pdf`. */
export const buildAvScriptPdfFilename = (input: AvScriptPdfFilenameInput): string =>
  buildPdfFilename({
    production: input.productionTitle,
    document: 'av-script',
    ...(input.date === undefined ? {} : { date: input.date }),
  });

const AV_COLUMNS: PdfTableColumn[] = [
  { header: 'Shot #', widthFrac: 9, align: 'center' },
  { header: 'Name & Size', widthFrac: 17 },
  { header: 'Video (Visuals & Camera)', widthFrac: 33 },
  { header: 'Audio (VO, Dialogue, SFX, Music)', widthFrac: 33 },
  { header: 'Time', widthFrac: 8, align: 'center' },
];

/**
 * What a row's number reads: a linked row shows its shot's number, always;
 * an unlinked row keeps its own. Mirrors `avRowNumber` over plain data so
 * this layer stays free of domain imports.
 */
export const avScriptRowNumber = (row: AvScriptPdfRow, shots: readonly AvScriptPdfShot[] = []): string => {
  if (!row.linkedShotId) return row.shotNumber;
  return shots.find((shot) => shot.id === row.linkedShotId)?.shotNumber ?? row.shotNumber;
};

/**
 * Map plan AV rows to PDF rows: resolve live shot numbers, fold the size
 * badge and NO CAMERA tag into the name cell, freeze durations as "Ns".
 */
export const avScriptRowsFromAvRows = (
  rows: readonly AvScriptPdfRow[],
  shots: readonly AvScriptPdfShot[] = [],
): string[][] =>
  rows.map((row) => {
    const number = avScriptRowNumber(row, shots);
    const nameBits = [row.shotName || `Shot ${number}`];
    if (row.shotSize && !row.noShot) nameBits.push(row.shotSize);
    if (row.noShot) nameBits.push('NO CAMERA');
    return [
      number,
      nameBits.join('\n'),
      row.video,
      row.audio,
      row.durationSec ? `${row.durationSec}s` : '—',
    ];
  });

const formatTotalTime = (totalSeconds: number): string =>
  `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;

/** Render the AV script and return the finished PDF bytes. */
export const createAvScriptPdf = async (input: AvScriptPdfInput): Promise<Uint8Array> => {
  const totalSeconds = input.rows.reduce((sum, row) => sum + (row.durationSec ?? 0), 0);
  const subtitle =
    input.subtitle ??
    `${input.rows.length} SHOT${input.rows.length === 1 ? '' : 'S'}${totalSeconds > 0 ? ` · ${formatTotalTime(totalSeconds)}` : ''}`;
  const ctx = await createPdfDocument({
    title: `AV Script - ${input.productionTitle}`,
    subject: 'AV script',
    pageSize: input.pageSize ?? 'A4',
    orientation: input.orientation ?? 'landscape',
    productionTitle: input.productionTitle,
    generatedAt: input.generatedAt,
    draft: input.draft ?? input.isDraft ?? false,
    confidentialityLine: input.confidentialityLine,
  });
  const logo = await embedProductionLogoPng(ctx.doc, input.logoPngBytes);
  const page = addPdfPage(ctx);
  const cursorY = drawDocumentHeader(ctx, page, ctx.contentTop, {
    productionTitle: input.productionTitle,
    documentTitle: 'Audio-Visual (AV) 2-Column Script',
    subtitle,
    logo,
  });

  if (input.rows.length === 0) {
    page.drawText('No AV script rows yet.', {
      x: ctx.margins.left,
      y: cursorY - 12,
      size: 10,
      font: ctx.regular,
    });
  } else {
    drawPdfTable(ctx, page, cursorY, AV_COLUMNS, avScriptRowsFromAvRows(input.rows, input.shots ?? []));
  }
  return finalizePdfDocument(ctx);
};
