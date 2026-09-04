/**
 * Table renderer for production PDFs.
 *
 * Guarantees, in priority order:
 * 1. Repeating header rows: every page opens with the column headers.
 * 2. Row-keep-together: a data row is never split across two pages. A row
 *    taller than a whole page still gets its own page and overflows rather
 *    than looping forever; plan data never produces such rows.
 * 3. Widow control: the header never stands alone at the bottom of a page
 *    (a page always carries at least one data row), and a single final row
 *    never sits alone on the last page — it borrows the previous page's last
 *    row so the sheet ends on at least two rows.
 * 4. Automatic page breaks with the footer zone always respected.
 *
 * Pagination is a pure function (`paginateTableRows`) so the widow rule is
 * unit-testable without rendering a PDF.
 */

import { rgb } from 'pdf-lib';
import type { PDFFont, PDFPage } from 'pdf-lib';
import { addPdfPage } from './document';
import type { PdfDocumentContext } from './document';
import { sanitizePdfText } from './text';

export interface PdfTableColumn {
  header: string;
  /** Relative width; fractions are normalised, so they only need to sum to ~1. */
  widthFrac: number;
  align?: 'left' | 'center' | 'right';
}

export interface PdfTableStyle {
  fontSize?: number;
  headerFontSize?: number;
  /** Line-height multiplier. Defaults to 1.3. */
  lineHeightFactor?: number;
  cellPaddingX?: number;
  cellPaddingY?: number;
}

export interface PdfTableResult {
  /** Page the table ended on. */
  page: PDFPage;
  /** Y where the next block starts. */
  cursorY: number;
  /** Total pages of the document after the table. */
  pageCount: number;
}

interface ResolvedTableStyle {
  fontSize: number;
  headerFontSize: number;
  lineHeight: number;
  headerLineHeight: number;
  cellPaddingX: number;
  cellPaddingY: number;
}

const resolveStyle = (style: PdfTableStyle | undefined): ResolvedTableStyle => {
  const fontSize = style?.fontSize ?? 8.5;
  const headerFontSize = style?.headerFontSize ?? 8.5;
  const factor = style?.lineHeightFactor ?? 1.3;
  return {
    fontSize,
    headerFontSize,
    lineHeight: fontSize * factor,
    headerLineHeight: headerFontSize * factor,
    cellPaddingX: style?.cellPaddingX ?? 4,
    cellPaddingY: style?.cellPaddingY ?? 3,
  };
};

/**
 * Split pre-sanitised text into lines that fit `maxWidth`. Splits on
 * recorded line feeds first, then word-wraps; a single word longer than the
 * column is hard-broken character by character (a 40-char lens SKU must not
 * push its column off the page).
 */
export const wrapPdfCellText = (
  font: PDFFont,
  text: string,
  maxWidth: number,
  fontSize: number,
): string[] => {
  const lines: string[] = [];
  for (const paragraph of sanitizePdfText(text).split('\n')) {
    const words = paragraph.split(/ +/).filter((word) => word.length > 0);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let current = '';
    const pushCurrent = (): void => {
      lines.push(current);
      current = '';
    };
    for (const word of words) {
      const candidate = current === '' ? word : `${current} ${word}`;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current !== '') pushCurrent();
      // The word alone still overflows: hard-break it.
      if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
        let rest = word;
        while (rest !== '') {
          let take = rest.length;
          while (take > 1 && font.widthOfTextAtSize(rest.slice(0, take), fontSize) > maxWidth) take -= 1;
          lines.push(rest.slice(0, take));
          rest = rest.slice(take);
        }
      } else {
        current = word;
      }
    }
    if (current !== '') pushCurrent();
  }
  return lines;
};

/**
 * Assign row indexes to pages. `rowHeights` and `headerHeight` are in points;
 * `contentHeight` is the space between the content top and the footer zone.
 * Returns one index list per page, in order, never empty.
 */
export const paginateTableRows = (
  rowHeights: number[],
  headerHeight: number,
  contentHeight: number,
): number[][] => {
  const pages: number[][] = [];
  let current: number[] = [];
  let used = headerHeight;
  const flush = (): void => {
    if (current.length > 0) pages.push(current);
    current = [];
    used = headerHeight;
  };
  rowHeights.forEach((height, index) => {
    if (height > contentHeight - headerHeight) {
      // Oversize row: quarantine it on its own page instead of looping.
      flush();
      pages.push([index]);
      return;
    }
    if (used + height > contentHeight) flush();
    current.push(index);
    used += height;
  });
  flush();
  // Widow control: a lone final row borrows the previous page's last row,
  // provided all three (header + two rows) fit on one page.
  if (pages.length > 1) {
    const last = pages[pages.length - 1];
    const previous = pages[pages.length - 2];
    if (last.length === 1 && previous.length > 1) {
      const moved = previous[previous.length - 1];
      if (headerHeight + rowHeights[moved] + rowHeights[last[0]] <= contentHeight) {
        previous.pop();
        last.unshift(moved);
      }
    }
  }
  return pages;
};

/** Draw one table starting at `cursorY` on `startPage`. Handles its own page breaks. */
export const drawPdfTable = (
  ctx: PdfDocumentContext,
  startPage: PDFPage,
  cursorY: number,
  columns: PdfTableColumn[],
  rows: string[][],
  style?: PdfTableStyle,
): PdfTableResult => {
  const resolved = resolveStyle(style);
  const totalFrac = columns.reduce((sum, column) => sum + column.widthFrac, 0) || 1;
  const widths = columns.map((column) => (column.widthFrac / totalFrac) * ctx.contentWidth);
  const columnX: number[] = [];
  let x = ctx.margins.left;
  for (const width of widths) {
    columnX.push(x);
    x += width;
  }

  const headerLines = columns.map((column, index) =>
    wrapPdfCellText(ctx.bold, column.header, widths[index] - resolved.cellPaddingX * 2, resolved.headerFontSize),
  );
  const headerHeight =
    Math.max(...headerLines.map((lines) => lines.length)) * resolved.headerLineHeight +
    resolved.cellPaddingY * 2;

  const bodyLines = rows.map((row) =>
    columns.map((_, index) =>
      wrapPdfCellText(ctx.regular, row[index] ?? '', widths[index] - resolved.cellPaddingX * 2, resolved.fontSize),
    ),
  );
  const rowHeights = bodyLines.map(
    (cells) => Math.max(...cells.map((lines) => lines.length)) * resolved.lineHeight + resolved.cellPaddingY * 2,
  );

  const contentHeight = cursorY - ctx.margins.bottom;
  const pagePlans = paginateTableRows(rowHeights, headerHeight, contentHeight);

  const gridColor = rgb(0.72, 0.72, 0.72);
  const headerFill = rgb(0.92, 0.92, 0.92);
  const altFill = rgb(0.965, 0.965, 0.965);
  const ink = rgb(0.12, 0.12, 0.12);

  let page = startPage;
  let pageTop = cursorY;

  pagePlans.forEach((plan, planIndex) => {
    if (planIndex > 0) {
      page = addPdfPage(ctx);
      pageTop = ctx.contentTop;
    }
    let rowTop = pageTop;

    // Header row.
    page.drawRectangle({
      x: ctx.margins.left,
      y: rowTop - headerHeight,
      width: ctx.contentWidth,
      height: headerHeight,
      color: headerFill,
    });
    columns.forEach((column, columnIndex) => {
      const lines = headerLines[columnIndex];
      lines.forEach((line, lineIndex) => {
        const width = ctx.bold.widthOfTextAtSize(line, resolved.headerFontSize);
        const align = column.align ?? 'left';
        const textX =
          align === 'center'
            ? columnX[columnIndex] + (widths[columnIndex] - width) / 2
            : align === 'right'
              ? columnX[columnIndex] + widths[columnIndex] - resolved.cellPaddingX - width
              : columnX[columnIndex] + resolved.cellPaddingX;
        page.drawText(line, {
          x: textX,
          y: rowTop - resolved.cellPaddingY - resolved.headerLineHeight * (lineIndex + 1) + 2,
          size: resolved.headerFontSize,
          font: ctx.bold,
          color: ink,
        });
      });
    });
    page.drawLine({
      start: { x: ctx.margins.left, y: rowTop - headerHeight },
      end: { x: ctx.margins.left + ctx.contentWidth, y: rowTop - headerHeight },
      thickness: 1,
      color: gridColor,
    });
    rowTop -= headerHeight;

    // Data rows.
    plan.forEach((rowIndex, position) => {
      const height = rowHeights[rowIndex];
      if (position % 2 === 1) {
        page.drawRectangle({
          x: ctx.margins.left,
          y: rowTop - height,
          width: ctx.contentWidth,
          height,
          color: altFill,
        });
      }
      columns.forEach((column, columnIndex) => {
        const lines = bodyLines[rowIndex][columnIndex];
        lines.forEach((line, lineIndex) => {
          const width = ctx.regular.widthOfTextAtSize(line, resolved.fontSize);
          const align = column.align ?? 'left';
          const textX =
            align === 'center'
              ? columnX[columnIndex] + (widths[columnIndex] - width) / 2
              : align === 'right'
                ? columnX[columnIndex] + widths[columnIndex] - resolved.cellPaddingX - width
                : columnX[columnIndex] + resolved.cellPaddingX;
          page.drawText(line, {
            x: textX,
            y: rowTop - resolved.cellPaddingY - resolved.lineHeight * (lineIndex + 1) + 2,
            size: resolved.fontSize,
            font: ctx.regular,
            color: ink,
          });
        });
      });
      page.drawLine({
        start: { x: ctx.margins.left, y: rowTop - height },
        end: { x: ctx.margins.left + ctx.contentWidth, y: rowTop - height },
        thickness: 0.5,
        color: gridColor,
      });
      rowTop -= height;
    });

    // Outer box + column separators.
    page.drawRectangle({
      x: ctx.margins.left,
      y: rowTop,
      width: ctx.contentWidth,
      height: pageTop - rowTop,
      borderColor: gridColor,
      borderWidth: 1,
    });
    columnX.forEach((left, index) => {
      if (index === 0) return;
      page.drawLine({
        start: { x: left, y: rowTop },
        end: { x: left, y: pageTop },
        thickness: 0.5,
        color: gridColor,
      });
    });
    pageTop = rowTop;
  });

  return { page, cursorY: pageTop - 8, pageCount: ctx.doc.getPageCount() };
};
