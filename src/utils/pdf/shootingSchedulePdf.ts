/**
 * The shooting schedule in the layout crews know: each day under a dark day
 * bar, each scene as a block — a header strip in its board colour (scene,
 * INT/EXT, set, D/N, pages), the synopsis, then its elements grouped by
 * department in columns (cast first) — and the day's page total at the break.
 */
import { rgb } from 'pdf-lib';
import type { PDFPage } from 'pdf-lib';
import { addPdfPage, createPdfDocument, drawDocumentHeader, finalizePdfDocument } from './document';
import type { PdfDocumentContext } from './document';
import { hexToPdfRgb, wrapPdfCellText } from './tables';
import { sanitizePdfText } from './text';
import type { OneLinerDay, OneLinerScene } from '../../domain/reports/oneLiner';
import { formatPageEighths } from '../../domain/reports/dailyProgress';
import { STRIP_COLORS } from '../../domain/scheduling/stripboardPrint';

export interface ShootingSchedulePdfInput {
  productionTitle: string;
  days: OneLinerDay[];
  /** Category id -> printed label ("props" -> "Props"). */
  categoryLabel: (category: string) => string;
}

const GROUP_COLUMNS = 3;
const ELEMENT_SIZE = 7.5;
const LINE = 9.5;

interface Group {
  label: string;
  items: string[];
}

const groupsOf = (scene: OneLinerScene, categoryLabel: (category: string) => string): Group[] => [
  ...(scene.cast && scene.cast.length > 0 ? [{ label: 'Cast', items: scene.cast }] : []),
  ...(scene.elements ?? []).map((group) => ({ label: categoryLabel(group.category), items: group.items })),
];

/** Lines each group takes when laid out in a column of `width`. */
const groupLines = (ctx: PdfDocumentContext, group: Group, width: number): string[] =>
  group.items.flatMap((item) => wrapPdfCellText(ctx.regular, item, width - 4, ELEMENT_SIZE));

export const createShootingSchedulePdf = async (input: ShootingSchedulePdfInput): Promise<Uint8Array> => {
  const ctx = await createPdfDocument({
    title: `Shooting Schedule - ${input.productionTitle}`,
    subject: 'Shooting schedule',
    pageSize: 'A4',
    orientation: 'portrait',
    productionTitle: input.productionTitle,
  });
  const left = ctx.margins.left;
  const width = ctx.contentWidth;
  const columnWidth = width / GROUP_COLUMNS;
  const totalEighths = input.days.reduce((sum, day) => sum + day.pageEighths, 0);

  let page: PDFPage = addPdfPage(ctx);
  let y = drawDocumentHeader(ctx, page, ctx.contentTop, {
    productionTitle: input.productionTitle,
    documentTitle: 'Shooting Schedule',
    subtitle: `${input.days.length} shooting day${input.days.length === 1 ? '' : 's'} · ${formatPageEighths(totalEighths)} pages`,
  });

  const ensure = (height: number) => {
    if (y - height < ctx.margins.bottom) {
      page = addPdfPage(ctx);
      y = ctx.contentTop;
    }
  };
  const write = (value: string, x: number, at: number, size: number, bold = false, color = rgb(0, 0, 0)) =>
    page.drawText(sanitizePdfText(value), { x, y: at, size, font: bold ? ctx.bold : ctx.regular, color });

  for (const day of input.days) {
    ensure(40);
    page.drawRectangle({ x: left, y: y - 16, width, height: 16, color: rgb(0.1, 0.12, 0.16) });
    write([day.dayName, day.date, day.crewCall ? `Call ${day.crewCall}` : undefined].filter(Boolean).join('  ·  ').toUpperCase(), left + 6, y - 11.5, 8.5, true, rgb(1, 1, 1));
    y -= 22;

    if (day.entries.length === 0) {
      write('No strips on this day.', left, y - 8, 8);
      y -= 16;
    }

    for (const entry of day.entries) {
      const colors = STRIP_COLORS[entry.colorKey];
      const fill = hexToPdfRgb(colors.fill) ?? rgb(1, 1, 1);
      const ink = hexToPdfRgb(colors.ink) ?? rgb(0, 0, 0);
      const border = hexToPdfRgb(colors.border) ?? rgb(0.6, 0.6, 0.6);
      if (entry.kind === 'banner') {
        ensure(18);
        page.drawRectangle({ x: left, y: y - 14, width, height: 14, color: fill, borderColor: border, borderWidth: 0.6 });
        write(entry.label.toUpperCase(), left + 6, y - 10, 7.5, true, ink);
        y -= 18;
        continue;
      }

      const groups = groupsOf(entry, input.categoryLabel);
      const synopsis = entry.synopsis ? wrapPdfCellText(ctx.regular, entry.synopsis, width - 12, 7.5) : [];
      // Height of the element grid: groups flow into columns, row by row.
      const rows: Group[][] = [];
      for (let index = 0; index < groups.length; index += GROUP_COLUMNS) rows.push(groups.slice(index, index + GROUP_COLUMNS));
      const rowHeights = rows.map((row) => 11 + Math.max(...row.map((group) => groupLines(ctx, group, columnWidth).length)) * LINE + 3);
      const blockHeight = 16 + (synopsis.length ? synopsis.length * 9 + 4 : 0) + rowHeights.reduce((sum, height) => sum + height, 0) + 6;
      ensure(Math.min(blockHeight, 200));

      // Header strip.
      page.drawRectangle({ x: left, y: y - 16, width, height: 16, color: fill, borderColor: border, borderWidth: 0.8 });
      const pages = entry.pageEighths === undefined ? '' : `${formatPageEighths(entry.pageEighths)} pgs`;
      write(`Sc ${entry.sceneNumber}`, left + 6, y - 11.5, 9, true, ink);
      write([entry.intExt, entry.set].filter(Boolean).join('  '), left + 58, y - 11.5, 8.5, true, ink);
      const right = [entry.timeOfDay, pages].filter(Boolean).join('   ');
      write(right, left + width - 6 - ctx.bold.widthOfTextAtSize(sanitizePdfText(right), 8.5), y - 11.5, 8.5, true, ink);
      y -= 16;
      const blockTop = y;

      if (synopsis.length) {
        synopsis.forEach((line, index) => write(line, left + 6, y - 9 - index * 9, 7.5));
        y -= synopsis.length * 9 + 4;
      }
      rows.forEach((row, rowIndex) => {
        ensure(rowHeights[rowIndex]);
        row.forEach((group, columnIndex) => {
          const x = left + 6 + columnIndex * columnWidth;
          write(group.label.toUpperCase(), x, y - 8, 6.5, true, rgb(0.35, 0.35, 0.35));
          groupLines(ctx, group, columnWidth).forEach((line, index) => write(line, x, y - 17 - index * LINE, ELEMENT_SIZE));
        });
        y -= rowHeights[rowIndex];
      });
      if (groups.length === 0 && !synopsis.length) y -= 4;
      // Thin frame down the block's sides, on the page it started on.
      if (page.getHeight() && y < blockTop) {
        page.drawLine({ start: { x: left, y: Math.max(y, ctx.margins.bottom) }, end: { x: left + width, y: Math.max(y, ctx.margins.bottom) }, thickness: 0.4, color: rgb(0.7, 0.7, 0.7) });
      }
      y -= 6;
    }

    ensure(16);
    const total = `End of ${day.dayName} — ${formatPageEighths(day.pageEighths)} pages`;
    write(total, left + width - ctx.bold.widthOfTextAtSize(sanitizePdfText(total), 8), y - 9, 8, true);
    y -= 20;
  }

  return finalizePdfDocument(ctx);
};
