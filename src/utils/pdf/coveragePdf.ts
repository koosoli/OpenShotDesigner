/**
 * Coverage matrix PDF (roadmap Phase 3: schedule report).
 *
 * Printable data model (mirrors `PrintableCoverageRow` from
 * `CoverageMatrixPrintView`, which derives from
 * `buildPrintableCoverageRows` in `domain/scheduling/stripboardPrint`):
 * - Camera ids (columns) plus rows of per-camera responsibility text, where
 *   an empty cell means "no responsibility" and prints as "-" (the print
 *   view's em dash, in ASCII so the source stays encoding-check clean).
 *   The on-screen camera accent colours are presentation-only and dropped.
 *
 * Landscape A4 by default: one column per camera needs the width.
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
import type { PdfOrientation, PdfPageSize } from './document';
import { buildPdfFilename } from './filenames';
import { drawPdfTable } from './tables';
import type { PdfTableColumn } from './tables';
import type { PrintableCoverageRow } from '../../components/reports/CoverageMatrixPrintView';

/** One matrix row: responsibility text per camera, aligned with `cameras`. */
export interface CoveragePdfRow {
  label: string;
  /** One entry per camera; '' means no responsibility. */
  cells: string[];
}

export interface CoveragePdfInput {
  productionTitle: string;
  /** Scope line under the heading; defaults to the camera/row counts. */
  subtitle?: string;
  cameras: string[];
  rows: CoveragePdfRow[];
  pageSize?: PdfPageSize;
  orientation?: PdfOrientation;
  generatedAt?: Date;
  draft?: boolean | string;
  confidentialityLine?: string;
  /** Raw PNG bytes for the production logo; corrupt bytes print logo-less. */
  logoPngBytes?: Uint8Array;
}

export interface CoveragePdfFilenameInput {
  productionTitle: string;
  qualifier?: string;
  date?: string;
}

/** `my-film_coverage-matrix.pdf`. */
export const buildCoveragePdfFilename = (input: CoveragePdfFilenameInput): string =>
  buildPdfFilename({
    production: input.productionTitle,
    document: 'coverage-matrix',
    ...(input.qualifier === undefined ? {} : { qualifier: input.qualifier }),
    ...(input.date === undefined ? {} : { date: input.date }),
  });

/**
 * Map the print view rows onto PDF rows. Cells pass through untouched;
 * missing cells (a row shorter than the camera list) read as empty.
 */
export const coverageRowsFromPrintable = (rows: PrintableCoverageRow[]): CoveragePdfRow[] =>
  rows.map((row) => ({ label: row.label, cells: [...row.cells] }));

/** Render the coverage matrix and return the finished PDF bytes. */
export const createCoveragePdf = async (input: CoveragePdfInput): Promise<Uint8Array> => {
  const ctx = await createPdfDocument({
    title: `Coverage Matrix - ${input.productionTitle}`,
    subject: 'Coverage matrix',
    pageSize: input.pageSize ?? 'A4',
    orientation: input.orientation ?? 'landscape',
    productionTitle: input.productionTitle,
    generatedAt: input.generatedAt,
    draft: input.draft,
    confidentialityLine: input.confidentialityLine,
  });
  const logo = await embedProductionLogoPng(ctx.doc, input.logoPngBytes);
  const page = addPdfPage(ctx);
  const cursorY = drawDocumentHeader(ctx, page, ctx.contentTop, {
    productionTitle: input.productionTitle,
    documentTitle: 'Coverage Matrix',
    subtitle:
      input.subtitle ??
      `${input.cameras.length} camera${input.cameras.length === 1 ? '' : 's'}  |  ${input.rows.length} row${input.rows.length === 1 ? '' : 's'}`,
    logo,
  });

  if (input.rows.length === 0 || input.cameras.length === 0) {
    page.drawText('The coverage matrix is empty - add camera columns and rows in the Coverage tab.', {
      x: ctx.margins.left,
      y: cursorY - 12,
      size: 10,
      font: ctx.regular,
    });
  } else {
    const cameraFrac = 76 / input.cameras.length;
    const columns: PdfTableColumn[] = [
      { header: 'Row', widthFrac: 24 },
      ...input.cameras.map((camera): PdfTableColumn => ({ header: camera, widthFrac: cameraFrac })),
    ];
    const tableRows = input.rows.map((row) => [
      row.label,
      ...input.cameras.map((_, index) => {
        const cell = row.cells[index] ?? '';
        return cell.trim() === '' ? '-' : cell;
      }),
    ]);
    drawPdfTable(ctx, page, cursorY, columns, tableRows);
  }
  return finalizePdfDocument(ctx);
};
