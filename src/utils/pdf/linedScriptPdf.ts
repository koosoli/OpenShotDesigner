/**
 * Lined screenplay PDF (roadmap Phase 3: script family).
 *
 * Printable data model (mirrors `LinedScriptPage`'s Hollywood layout,
 * flattened so the PDF layer stays React-free):
 * - Full screenplay in flow text on the print page's 60-column Courier grid:
 *   sluglines and shots full-width bold, character cues at column 22,
 *   parentheticals at 17, dialogue at 12, transitions right-aligned.
 * - Scene numbers print in both margins like a numbered production draft;
 *   omitted scenes print `SCENE n — OMITTED` and skip their parked body.
 * - Page breaks fall between scenes where sensible: a new slugline starts a
 *   fresh page when less than ~40% of the current page remains; explicit
 *   `page-break` lines force one.
 *
 * Portrait A4 by default; StandardFonts only (offline); every drawn string
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
import { wrapPdfCellText } from './tables';
import { sanitizePdfText } from './text';
import type { PDFPage } from 'pdf-lib';

/** One screenplay line, mirroring `ScriptLine` in minimal printable form. */
export interface LinedScriptPdfLine {
  type?: string;
  text: string;
  sceneNumber?: string;
  omitted?: boolean;
}

export interface LinedScriptPdfInput {
  productionTitle: string;
  /** Scope line, e.g. "White draft - 2026-09-04". */
  subtitle?: string;
  lines: LinedScriptPdfLine[];
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

export interface LinedScriptPdfFilenameInput {
  productionTitle: string;
  date?: string;
}

/** `my-film_screenplay.pdf`. */
export const buildLinedScriptPdfFilename = (input: LinedScriptPdfFilenameInput): string =>
  buildPdfFilename({
    production: input.productionTitle,
    document: 'screenplay',
    ...(input.date === undefined ? {} : { date: input.date }),
  });

interface PageCursor {
  page: PDFPage;
  cursorY: number;
}

/** Hollywood column grid from the lined page: 60 columns, offsets in characters. */
const LINED_LAYOUT: Record<string, { left: number; width: number; size: number; bold: boolean; upper: boolean }> = {
  scene: { left: 0, width: 60, size: 10, bold: true, upper: true },
  action: { left: 0, width: 60, size: 9.5, bold: false, upper: false },
  character: { left: 22, width: 38, size: 9.5, bold: false, upper: true },
  parenthetical: { left: 17, width: 26, size: 9, bold: false, upper: false },
  dialogue: { left: 12, width: 35, size: 9.5, bold: false, upper: false },
  transition: { left: 40, width: 20, size: 9.5, bold: false, upper: true },
  shot: { left: 0, width: 60, size: 9.5, bold: true, upper: true },
  note: { left: 0, width: 60, size: 8.5, bold: false, upper: false },
};

const FALLBACK_LAYOUT = { left: 0, width: 60, size: 9.5, bold: false, upper: false };
const LINE_HEIGHT_FACTOR = 1.35;
const SCENE_NUMBER_SIZE = 8;

/** New page when fewer than `needed` points remain above the footer zone. */
const ensureSpace = (ctx: PdfDocumentContext, cursor: PageCursor, needed: number): PageCursor => {
  if (cursor.cursorY - needed < ctx.margins.bottom) {
    const page = addPdfPage(ctx);
    return { page, cursorY: ctx.contentTop };
  }
  return cursor;
};

const drawSceneNumber = (
  ctx: PdfDocumentContext,
  page: PDFPage,
  y: number,
  sceneNumber: string,
  side: 'left' | 'right',
): void => {
  const label = sanitizePdfText(sceneNumber);
  const x =
    side === 'left'
      ? ctx.margins.left - ctx.regular.widthOfTextAtSize(label, SCENE_NUMBER_SIZE) - 8
      : ctx.margins.left + ctx.contentWidth + 8;
  page.drawText(label, { x, y, size: SCENE_NUMBER_SIZE, font: ctx.bold });
};

/** One wrapped screenplay line at its grid column. */
const drawScriptLine = (
  ctx: PdfDocumentContext,
  cursor: PageCursor,
  text: string,
  layout: { left: number; width: number; size: number; bold: boolean },
): PageCursor => {
  const x = ctx.margins.left + (layout.left / 60) * ctx.contentWidth;
  const maxWidth = (layout.width / 60) * ctx.contentWidth;
  const font = layout.bold ? ctx.bold : ctx.regular;
  const lines = wrapPdfCellText(font, text, maxWidth, layout.size);
  const lineHeight = layout.size * LINE_HEIGHT_FACTOR;
  const placed = ensureSpace(ctx, cursor, lines.length * lineHeight);
  lines.forEach((line, index) => {
    placed.page.drawText(line, {
      x,
      y: placed.cursorY - lineHeight * (index + 1) + 3,
      size: layout.size,
      font,
    });
  });
  return { page: placed.page, cursorY: placed.cursorY - lines.length * lineHeight };
};

const layoutFor = (type: string | undefined): { left: number; width: number; size: number; bold: boolean; upper: boolean } =>
  (type !== undefined ? LINED_LAYOUT[type] : undefined) ?? FALLBACK_LAYOUT;

/** Render the lined screenplay and return the finished PDF bytes. */
export const createLinedScriptPdf = async (input: LinedScriptPdfInput): Promise<Uint8Array> => {
  const ctx = await createPdfDocument({
    title: `Screenplay - ${input.productionTitle}`,
    subject: 'Screenplay',
    pageSize: input.pageSize ?? 'A4',
    orientation: input.orientation ?? 'portrait',
    productionTitle: input.productionTitle,
    generatedAt: input.generatedAt,
    draft: input.draft ?? input.isDraft ?? false,
    confidentialityLine: input.confidentialityLine,
  });
  const logo = await embedProductionLogoPng(ctx.doc, input.logoPngBytes);
  const page = addPdfPage(ctx);
  const headerY = drawDocumentHeader(ctx, page, ctx.contentTop, {
    productionTitle: input.productionTitle,
    documentTitle: 'Screenplay',
    subtitle: input.subtitle ?? `${input.lines.length} line${input.lines.length === 1 ? '' : 's'}`,
    logo,
  });
  let cursor: PageCursor = { page, cursorY: headerY };

  if (input.lines.length === 0) {
    cursor.page.drawText('No script lines yet.', {
      x: ctx.margins.left,
      y: cursor.cursorY - 12,
      size: 10,
      font: ctx.regular,
    });
    return finalizePdfDocument(ctx);
  }

  const contentHeight = ctx.contentTop - ctx.margins.bottom;
  let sceneOrdinal = 0;
  let skippingOmittedBody = false;

  for (const line of input.lines) {
    if (line.type === 'page-break') {
      const fresh = addPdfPage(ctx);
      cursor = { page: fresh, cursorY: ctx.contentTop };
      skippingOmittedBody = false;
      continue;
    }
    if (line.type === 'scene') {
      sceneOrdinal += 1;
      const sceneNumber = line.sceneNumber || String(sceneOrdinal);
      if (line.omitted === true) {
        // Numbered-draft rule: the slug stays, the body is parked elsewhere.
        cursor = ensureSpace(ctx, cursor, 30);
        const label = `SCENE ${sceneNumber} — OMITTED`;
        const placed = drawScriptLine(ctx, cursor, label, { left: 0, width: 60, size: 10, bold: true });
        drawSceneNumber(ctx, placed.page, placed.cursorY + 10, sceneNumber, 'left');
        drawSceneNumber(ctx, placed.page, placed.cursorY + 10, sceneNumber, 'right');
        cursor = { page: placed.page, cursorY: placed.cursorY - 6 };
        skippingOmittedBody = true;
        continue;
      }
      skippingOmittedBody = false;
      // Page breaks between scenes where sensible: a slugline low on the
      // page starts fresh rather than orphaning the heading from its action.
      const remainingFrac = (cursor.cursorY - ctx.margins.bottom) / contentHeight;
      const atTop = cursor.cursorY >= ctx.contentTop - 1;
      if (!atTop && remainingFrac < 0.4) {
        const fresh = addPdfPage(ctx);
        cursor = { page: fresh, cursorY: ctx.contentTop };
      }
      cursor = ensureSpace(ctx, cursor, 40);
      const gapY = cursor.cursorY - 8;
      cursor = { page: cursor.page, cursorY: gapY };
      const placed = drawScriptLine(ctx, cursor, line.text.toUpperCase(), LINED_LAYOUT.scene);
      drawSceneNumber(ctx, placed.page, placed.cursorY + 10, sceneNumber, 'left');
      drawSceneNumber(ctx, placed.page, placed.cursorY + 10, sceneNumber, 'right');
      cursor = placed;
      continue;
    }
    if (skippingOmittedBody) continue;
    if (line.text.trim() === '') continue;
    const layout = layoutFor(line.type);
    const text = layout.upper ? line.text.toUpperCase() : line.text;
    const gap = line.type === 'character' ? 5 : 2;
    cursor = { page: cursor.page, cursorY: cursor.cursorY - gap };
    cursor = drawScriptLine(ctx, cursor, text, layout);
  }

  return finalizePdfDocument(ctx);
};
