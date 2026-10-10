/**
 * One-table report PDF: a header, an optional section heading per group of
 * rows, and a legend. Used where a panel prints exactly what it shows — the
 * day-out-of-days in its current view, the prop report, an Exhibit G sheet —
 * so "print just this report" never means opening the export studio.
 */
import { addPdfPage, createPdfDocument, drawDocumentHeader, finalizePdfDocument } from './document';
import type { PdfOrientation } from './document';
import { drawPdfTable, wrapPdfCellText } from './tables';
import type { PdfTableColumn } from './tables';
import { sanitizePdfText } from './text';

export interface TableReportPdfSection {
  /** Heading above this group of rows; omitted for a single unnamed group. */
  heading?: string;
  rows: string[][];
  /** Per-row fill/ink ("#rrggbb"), e.g. stripboard colours. */
  rowColors?: Array<{ fill?: string; ink?: string } | undefined>;
}

export interface TableReportPdfInput {
  productionTitle: string;
  documentTitle: string;
  subtitle?: string;
  columns: PdfTableColumn[];
  sections: TableReportPdfSection[];
  /** Small print under the table: a legend, a disclaimer. */
  footnote?: string;
  orientation?: PdfOrientation;
  /** Font size for the table body (default 8). */
  fontSize?: number;
}

export const createTableReportPdf = async (input: TableReportPdfInput): Promise<Uint8Array> => {
  const ctx = await createPdfDocument({
    title: `${input.documentTitle} - ${input.productionTitle}`,
    subject: input.documentTitle,
    pageSize: 'A4',
    orientation: input.orientation ?? 'landscape',
    productionTitle: input.productionTitle,
  });
  let page = addPdfPage(ctx);
  let cursorY = drawDocumentHeader(ctx, page, ctx.contentTop, {
    productionTitle: input.productionTitle,
    documentTitle: input.documentTitle,
    ...(input.subtitle ? { subtitle: input.subtitle } : {}),
  });
  const style = { fontSize: input.fontSize ?? 8, headerFontSize: (input.fontSize ?? 8) - 0.5 };
  const sections = input.sections.filter((section) => section.rows.length > 0);
  if (sections.length === 0) {
    page.drawText('Nothing to report yet.', { x: ctx.margins.left, y: cursorY - 12, size: 10, font: ctx.regular });
    return finalizePdfDocument(ctx);
  }
  for (const section of sections) {
    if (section.heading) {
      if (cursorY - 40 < ctx.margins.bottom) {
        page = addPdfPage(ctx);
        cursorY = ctx.contentTop;
      }
      page.drawText(sanitizePdfText(section.heading), { x: ctx.margins.left, y: cursorY - 10, size: 10, font: ctx.bold });
      cursorY -= 16;
    }
    const result = drawPdfTable(ctx, page, cursorY, input.columns, section.rows, { ...style, rowColors: section.rowColors });
    page = result.page;
    cursorY = result.cursorY - 10;
  }
  if (input.footnote) {
    const lines = wrapPdfCellText(ctx.regular, input.footnote, ctx.contentWidth, 7.5);
    if (cursorY - lines.length * 10 < ctx.margins.bottom) {
      page = addPdfPage(ctx);
      cursorY = ctx.contentTop;
    }
    lines.forEach((line, index) => {
      page.drawText(line, { x: ctx.margins.left, y: cursorY - 8 - index * 10, size: 7.5, font: ctx.regular });
    });
  }
  return finalizePdfDocument(ctx);
};
