/**
 * Lined screenplay PDF (roadmap Phase 3: script family).
 *
 * US Hollywood layout on US Letter, set in 12pt Courier throughout:
 * - 1.5" left / 1" right / 1" top-bottom margins leave exactly 6" of text,
 *   which at Courier's 10 pitch is the classic 60-column grid. Every element
 *   sits on that grid: sluglines, action and shots full-width; character cues
 *   at 2.2", parentheticals at 1.6", dialogue at 1.0" running 3.5" wide;
 *   transitions flush right. Single-spaced with a blank line between blocks
 *   (none inside a speech), a double space before each new slugline.
 * - Scene numbers print in both margins like a numbered production draft;
 *   omitted scenes print `SCENE n — OMITTED` and skip their parked body.
 * - Page breaks fall between scenes where sensible: a new slugline starts a
 *   fresh page when less than ~40% of the current page remains; explicit
 *   `page-break` lines force one.
 * - The title-page cover prints first, alone on its own page, when the
 *   production enabled it and it carries content — mirroring TitlePageView:
 *   title a third down centred in caps, credit/author/source beneath, contact
 *   bottom-left, draft and date bottom-right. No cover is ever invented:
 *   without content the script starts on page one.
 *
 * Courier/CourierBold are pdf-lib standard fonts (offline); every drawn
 * string passes through `sanitizePdfText` via the shared shell and renderer.
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
import { hasTitlePageContent, resolveTitlePage } from '../../domain/script';
import type { ScreenplayTitlePage } from '../../domain/script';
import { StandardFonts, degrees, rgb } from 'pdf-lib';
import type { PDFFont, PDFPage } from 'pdf-lib';

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
  /** Hollywood means US Letter; overridable for tests. */
  pageSize?: PdfPageSize;
  orientation?: PdfOrientation;
  generatedAt?: Date;
  confidentialityLine?: string;
  /** Raw PNG bytes for the production logo; corrupt bytes print logo-less. */
  logoPngBytes?: Uint8Array;
  /** The screenplay cover. Prints first, on its own page, only when enabled
   * and carrying content — never invented, never a blank page. */
  titlePage?: ScreenplayTitlePage;
  /** Stands in for a blank cover title, like the editor does. */
  scriptTitle?: string;
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

interface ScriptFonts {
  regular: PDFFont;
  bold: PDFFont;
}

/** Courier 12pt: 10 pitch, so one column is exactly 7.2pt and 60 columns are 6". */
const COURIER_SIZE = 12;
const COURIER_CHAR_WIDTH = 7.2;
const SCRIPT_LINE_HEIGHT = 12;

/**
 * Hollywood column grid, offsets in characters from the text block's left
 * edge: action full-width; character cues 2.2" in; parentheticals 1.6" in;
 * dialogue 1.0" in running 3.5" wide; transitions flush to the right edge.
 */
const LINED_LAYOUT: Record<string, { left: number; width: number; bold: boolean; upper: boolean; right?: boolean }> = {
  scene: { left: 0, width: 60, bold: true, upper: true },
  action: { left: 0, width: 60, bold: false, upper: false },
  character: { left: 22, width: 38, bold: false, upper: true },
  parenthetical: { left: 16, width: 20, bold: false, upper: false },
  dialogue: { left: 10, width: 35, bold: false, upper: false },
  transition: { left: 0, width: 60, bold: false, upper: true, right: true },
  shot: { left: 0, width: 60, bold: true, upper: true },
  note: { left: 0, width: 60, bold: false, upper: false },
};

const FALLBACK_LAYOUT = { left: 0, width: 60, bold: false, upper: false };
const SCENE_NUMBER_SIZE = 12;

/** Single-spaced inside a block; a blank line between blocks; two before a slugline. */
const gapBefore = (type: string | undefined, previous: string | undefined): number => {
  if (type === 'scene') return SCRIPT_LINE_HEIGHT * 2;
  const inSpeech = (value: string | undefined): boolean =>
    value === 'character' || value === 'parenthetical' || value === 'dialogue';
  if (inSpeech(type) && inSpeech(previous) && type !== 'character') return 0;
  return SCRIPT_LINE_HEIGHT;
};

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
  fonts: ScriptFonts,
  page: PDFPage,
  y: number,
  sceneNumber: string,
  side: 'left' | 'right',
): void => {
  const label = sanitizePdfText(sceneNumber);
  const x =
    side === 'left'
      ? ctx.margins.left - fonts.bold.widthOfTextAtSize(label, SCENE_NUMBER_SIZE) - 8
      : ctx.margins.left + ctx.contentWidth + 8;
  page.drawText(label, { x, y, size: SCENE_NUMBER_SIZE, font: fonts.bold });
};

/** One wrapped screenplay line at its grid column, in 12pt Courier. */
const drawScriptLine = (
  ctx: PdfDocumentContext,
  fonts: ScriptFonts,
  cursor: PageCursor,
  text: string,
  layout: { left: number; width: number; bold: boolean; right?: boolean },
): PageCursor => {
  const font = layout.bold ? fonts.bold : fonts.regular;
  const maxWidth = layout.width * COURIER_CHAR_WIDTH;
  const lines = wrapPdfCellText(font, text, maxWidth, COURIER_SIZE);
  const placed = ensureSpace(ctx, cursor, lines.length * SCRIPT_LINE_HEIGHT);
  lines.forEach((line, index) => {
    const clean = sanitizePdfText(line);
    const x = layout.right === true
      ? ctx.margins.left + ctx.contentWidth - font.widthOfTextAtSize(clean, COURIER_SIZE)
      : ctx.margins.left + layout.left * COURIER_CHAR_WIDTH;
    placed.page.drawText(clean, {
      x,
      y: placed.cursorY - SCRIPT_LINE_HEIGHT * (index + 1) + 3,
      size: COURIER_SIZE,
      font,
    });
  });
  return { page: placed.page, cursorY: placed.cursorY - lines.length * SCRIPT_LINE_HEIGHT };
};

const layoutFor = (type: string | undefined): { left: number; width: number; bold: boolean; upper: boolean; right?: boolean } =>
  (type !== undefined ? LINED_LAYOUT[type] : undefined) ?? FALLBACK_LAYOUT;

/** Centred Courier line, e.g. for the cover. */
const drawCentered = (
  page: PDFPage,
  fonts: ScriptFonts,
  ctx: PdfDocumentContext,
  text: string,
  y: number,
  opts?: { bold?: boolean; size?: number },
): void => {
  const font = opts?.bold === true ? fonts.bold : fonts.regular;
  const size = opts?.size ?? COURIER_SIZE;
  const clean = sanitizePdfText(text);
  page.drawText(clean, {
    x: ctx.margins.left + (ctx.contentWidth - font.widthOfTextAtSize(clean, size)) / 2,
    y,
    size,
    font,
  });
};

/**
 * The screenplay cover on its own page, mirroring TitlePageView: title a
 * third down in caps, credit/author/source beneath, contact bottom-left,
 * draft and date bottom-right. Caller guarantees content exists.
 */
const drawTitlePageCover = (
  ctx: PdfDocumentContext,
  fonts: ScriptFonts,
  page: PDFPage,
  input: Pick<LinedScriptPdfInput, 'titlePage' | 'scriptTitle'>,
): void => {
  const cover = resolveTitlePage(input.titlePage, input.scriptTitle);
  const contentTop = ctx.pageHeight - ctx.margins.top;
  const contentHeight = contentTop - ctx.margins.bottom;

  if (cover.draft) {
    page.drawText('DRAFT', {
      x: ctx.margins.left + ctx.contentWidth / 2,
      y: ctx.margins.bottom + contentHeight / 2,
      size: 72,
      font: fonts.bold,
      color: rgb(0.86, 0.15, 0.15),
      opacity: 0.13,
      rotate: degrees(-32),
    });
  }

  let y = contentTop - contentHeight * 0.34;
  drawCentered(page, fonts, ctx, cover.title.toUpperCase(), y, { bold: true });
  y -= SCRIPT_LINE_HEIGHT * 2.5;
  if (cover.credit) {
    drawCentered(page, fonts, ctx, cover.credit, y);
    y -= SCRIPT_LINE_HEIGHT * 2.5;
  }
  for (const author of cover.authors) {
    drawCentered(page, fonts, ctx, author, y);
    y -= SCRIPT_LINE_HEIGHT;
  }
  if (cover.source) {
    y -= SCRIPT_LINE_HEIGHT * 1.5;
    drawCentered(page, fonts, ctx, cover.source, y);
  }

  const bottomY = ctx.margins.bottom + SCRIPT_LINE_HEIGHT * 4;
  const smallGap = SCRIPT_LINE_HEIGHT;
  let leftY = bottomY;
  for (const line of cover.contact) {
    page.drawText(sanitizePdfText(line), { x: ctx.margins.left, y: leftY, size: COURIER_SIZE, font: fonts.regular });
    leftY -= smallGap;
  }
  if (cover.copyright) {
    if (cover.contact.length > 0) leftY -= smallGap;
    page.drawText(sanitizePdfText(cover.copyright), { x: ctx.margins.left, y: leftY, size: COURIER_SIZE, font: fonts.regular });
  }
  let rightY = bottomY;
  const drawRight = (text: string, bold = false): void => {
    const clean = sanitizePdfText(text);
    const font = bold ? fonts.bold : fonts.regular;
    page.drawText(clean, {
      x: ctx.margins.left + ctx.contentWidth - font.widthOfTextAtSize(clean, COURIER_SIZE),
      y: rightY,
      size: COURIER_SIZE,
      font,
    });
    rightY -= smallGap;
  };
  if (cover.draftLabel) drawRight(cover.draftLabel);
  if (cover.draft) drawRight('DRAFT', true);
  if (cover.date) drawRight(cover.date);
  if (cover.notes) {
    page.drawText(sanitizePdfText(cover.notes), {
      x: ctx.margins.left,
      y: ctx.margins.bottom + SCRIPT_LINE_HEIGHT,
      size: COURIER_SIZE,
      font: fonts.regular,
    });
  }
};

/** Render the lined screenplay and return the finished PDF bytes. */
export const createLinedScriptPdf = async (input: LinedScriptPdfInput): Promise<Uint8Array> => {
  const ctx = await createPdfDocument({
    title: `Screenplay - ${input.productionTitle}`,
    subject: 'Screenplay',
    pageSize: input.pageSize ?? 'Letter',
    orientation: input.orientation ?? 'portrait',
    // Hollywood margins: 1.5" left / 1" right leaves exactly 6" of text,
    // which at Courier 12pt is the classic 60-column grid.
    marginsPt: { left: 108, right: 72, top: 72, bottom: 72 },
    productionTitle: input.productionTitle,
    generatedAt: input.generatedAt,
    draft: input.draft ?? input.isDraft ?? false,
    confidentialityLine: input.confidentialityLine,
  });
  const fonts: ScriptFonts = {
    regular: await ctx.doc.embedFont(StandardFonts.Courier),
    bold: await ctx.doc.embedFont(StandardFonts.CourierBold),
  };
  const logo = await embedProductionLogoPng(ctx.doc, input.logoPngBytes);

  const coverPrinted =
    input.titlePage?.enabled === true && hasTitlePageContent(input.titlePage, input.scriptTitle);
  if (coverPrinted) {
    drawTitlePageCover(ctx, fonts, addPdfPage(ctx), input);
  }

  const page = addPdfPage(ctx);
  // A printed cover already says what this is and who wrote it: repeating the
  // paperwork title block underneath would demote the cover to a preface, so
  // the script starts straight in. Without a cover the title block stays —
  // it is the only thing naming the production on the page.
  const headerY = coverPrinted
    ? ctx.contentTop
    : drawDocumentHeader(ctx, page, ctx.contentTop, {
        productionTitle: input.productionTitle,
        documentTitle: 'Screenplay',
        subtitle: input.subtitle ?? `${input.lines.length} line${input.lines.length === 1 ? '' : 's'}`,
        logo,
      });
  let cursor: PageCursor = { page, cursorY: headerY };

  if (input.lines.length === 0) {
    cursor.page.drawText(sanitizePdfText('No script lines yet.'), {
      x: ctx.margins.left,
      y: cursor.cursorY - 12,
      size: COURIER_SIZE,
      font: fonts.regular,
    });
    return finalizePdfDocument(ctx);
  }

  const contentHeight = ctx.contentTop - ctx.margins.bottom;
  let sceneOrdinal = 0;
  let skippingOmittedBody = false;
  let previousType: string | undefined;

  for (const line of input.lines) {
    if (line.type === 'page-break') {
      const fresh = addPdfPage(ctx);
      cursor = { page: fresh, cursorY: ctx.contentTop };
      skippingOmittedBody = false;
      previousType = undefined;
      continue;
    }
    if (line.type === 'scene') {
      sceneOrdinal += 1;
      const sceneNumber = line.sceneNumber || String(sceneOrdinal);
      if (line.omitted === true) {
        // Numbered-draft rule: the slug stays, the body is parked elsewhere.
        cursor = ensureSpace(ctx, cursor, 30);
        const placed = drawScriptLine(ctx, fonts, cursor, `SCENE ${sceneNumber} — OMITTED`, { left: 0, width: 60, bold: true });
        drawSceneNumber(ctx, fonts, placed.page, placed.cursorY + 10, sceneNumber, 'left');
        drawSceneNumber(ctx, fonts, placed.page, placed.cursorY + 10, sceneNumber, 'right');
        cursor = { page: placed.page, cursorY: placed.cursorY - 6 };
        skippingOmittedBody = true;
        previousType = 'scene';
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
      const placed = drawScriptLine(ctx, fonts, cursor, line.text.toUpperCase(), LINED_LAYOUT.scene);
      drawSceneNumber(ctx, fonts, placed.page, placed.cursorY + 10, sceneNumber, 'left');
      drawSceneNumber(ctx, fonts, placed.page, placed.cursorY + 10, sceneNumber, 'right');
      cursor = placed;
      previousType = 'scene';
      continue;
    }
    if (skippingOmittedBody) continue;
    if (line.text.trim() === '') continue;
    const layout = layoutFor(line.type);
    const text = layout.upper ? line.text.toUpperCase() : line.text;
    cursor = { page: cursor.page, cursorY: cursor.cursorY - gapBefore(line.type, previousType) };
    cursor = drawScriptLine(ctx, fonts, cursor, text, layout);
    previousType = line.type;
  }

  return finalizePdfDocument(ctx);
};
