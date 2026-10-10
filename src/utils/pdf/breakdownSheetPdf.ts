/**
 * Breakdown sheets PDF: one page per scene, with a header band in the scene's
 * stripboard colour (INT/EXT x DAY/NIGHT) and the cast and every department's
 * elements in a two-column table underneath.
 */
import { rgb } from 'pdf-lib';
import { addPdfPage, createPdfDocument, finalizePdfDocument } from './document';
import { drawPdfTable, hexToPdfRgb, wrapPdfCellText } from './tables';
import { sanitizePdfText } from './text';

export interface BreakdownSheetPdfSheet {
  sceneNumber: string;
  /** "INT · DINER · NIGHT". */
  title: string;
  /** "Pages 1 3/8 · Story day D2 · Shoot day 1". */
  facts: string;
  synopsis?: string;
  omitted?: boolean;
  fill: string;
  border: string;
  ink: string;
  /** [department, elements] rows; the cast comes first. */
  rows: Array<[string, string]>;
}

export interface BreakdownSheetPdfInput {
  productionTitle: string;
  sheets: BreakdownSheetPdfSheet[];
}

export const createBreakdownSheetsPdf = async (input: BreakdownSheetPdfInput): Promise<Uint8Array> => {
  const ctx = await createPdfDocument({
    title: `Breakdown Sheets - ${input.productionTitle}`,
    subject: 'Script breakdown sheets',
    pageSize: 'A4',
    orientation: 'portrait',
    productionTitle: input.productionTitle,
  });
  if (input.sheets.length === 0) {
    const page = addPdfPage(ctx);
    page.drawText('No scenes to break down.', { x: ctx.margins.left, y: ctx.contentTop - 12, size: 10, font: ctx.regular });
    return finalizePdfDocument(ctx);
  }
  for (const sheet of input.sheets) {
    const page = addPdfPage(ctx);
    let y = ctx.contentTop;
    // Small production line above the band.
    page.drawText(sanitizePdfText(`${input.productionTitle} — Breakdown sheet`), {
      x: ctx.margins.left, y: y - 9, size: 8.5, font: ctx.regular, color: rgb(0.35, 0.35, 0.35),
    });
    y -= 16;
    const bandHeight = 54;
    page.drawRectangle({
      x: ctx.margins.left,
      y: y - bandHeight,
      width: ctx.contentWidth,
      height: bandHeight,
      color: hexToPdfRgb(sheet.fill),
      borderColor: hexToPdfRgb(sheet.border),
      borderWidth: 1.2,
    });
    const ink = hexToPdfRgb(sheet.ink) ?? rgb(0, 0, 0);
    page.drawText(sanitizePdfText(`SC ${sheet.sceneNumber}`), { x: ctx.margins.left + 10, y: y - 24, size: 18, font: ctx.bold, color: ink });
    const numberWidth = ctx.bold.widthOfTextAtSize(sanitizePdfText(`SC ${sheet.sceneNumber}`), 18);
    page.drawText(sanitizePdfText(sheet.omitted ? `${sheet.title} (OMITTED)` : sheet.title), {
      x: ctx.margins.left + 22 + numberWidth, y: y - 23, size: 12, font: ctx.bold, color: ink,
    });
    page.drawText(sanitizePdfText(sheet.facts), { x: ctx.margins.left + 10, y: y - 43, size: 9, font: ctx.regular, color: ink });
    y -= bandHeight + 10;
    if (sheet.synopsis) {
      const lines = wrapPdfCellText(ctx.regular, sheet.synopsis, ctx.contentWidth, 9.5).slice(0, 6);
      lines.forEach((line, index) => page.drawText(line, { x: ctx.margins.left, y: y - 10 - index * 12.5, size: 9.5, font: ctx.regular }));
      y -= lines.length * 12.5 + 10;
    }
    drawPdfTable(
      ctx,
      page,
      y,
      [{ header: 'Department', widthFrac: 26 }, { header: 'Elements', widthFrac: 74 }],
      sheet.rows.length ? sheet.rows.map(([label, value]) => [label, value]) : [['—', 'Nothing tagged in this scene yet.']],
      { fontSize: 9.5, headerFontSize: 8.5 },
    );
  }
  return finalizePdfDocument(ctx);
};
