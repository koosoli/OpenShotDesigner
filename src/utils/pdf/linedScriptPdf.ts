/**
 * Lined screenplay PDF (roadmap Phase 3: script family).
 *
 * US Hollywood layout on US Letter (or A4), set in 12pt Courier throughout:
 * - 1.5" left / 1" right / 1" top-bottom margins leave exactly 6" of text,
 *   which at Courier's 10 pitch is the classic 60-column grid.
 * - The pages are the app's screenplay pages (domain/script/pagination): the
 *   industry break rules, (MORE) / (CONT'D) across dialogue breaks, dual
 *   dialogue side by side, automatic (CONT'D), locked page numbers and
 *   A-pages. So the page a breakdown or call sheet names is the page printed.
 * - Page numbers top right from page 2 (every page once pages are locked).
 * - Scene numbers print in both margins like a numbered production draft;
 *   omitted scenes print `SCENE n — OMITTED` and skip their parked body.
 *   Script notes do not print.
 * - The title-page cover prints first, alone on its own page, when the
 *   production enabled it and it carries content — mirroring TitlePageView:
 *   title a third down centred in caps, credit/author/source beneath, contact
 *   bottom-left, draft and date bottom-right. No cover is ever invented:
 *   without content the script starts on page one.
 *
 * Latin text uses standard Courier faces. Unicode text embeds bundled
 * Courier Badi faces; unsupported glyphs stop the export with an explicit error.
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
import type { PdfHeaderLogo } from './document';
import { embedScriptFonts, type ScriptFonts } from './scriptFonts';
import type { ScriptTextStyle } from '../../types';
import { styleRuns, uppercaseScriptText } from '../../domain/script/editing';
import { hasTitlePageContent, paginateScreenplay, resolveTitlePage, screenplayLayoutOptions } from '../../domain/script';
import type { ScreenplayLayout, ScreenplayTitlePage } from '../../domain/script';
import { degrees, rgb } from 'pdf-lib';
import type { PDFPage } from 'pdf-lib';

/** One screenplay line, mirroring `ScriptLine` in minimal printable form. */
export interface LinedScriptPdfLine {
  /** The script line id — what a page lock is keyed on. */
  id?: string;
  type?: string;
  text: string;
  styles?: ScriptTextStyle[];
  sceneNumber?: string;
  omitted?: boolean;
  /** Changed in the current revision: prints the margin asterisk. */
  revised?: boolean;
  /** On a character cue: sets the speech beside the one before it. */
  dual?: boolean;
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
  /** Paper and automatic (CONT'D), as the project sets them. */
  layout?: ScreenplayLayout;
  /** Overrides the paper from `layout`. */
  pageSize?: PdfPageSize;
  orientation?: PdfOrientation;
  generatedAt?: Date;
  confidentialityLine?: string;
  /** Raw PNG bytes for the production logo; corrupt bytes print logo-less. */
  logoPngBytes?: Uint8Array;
  /** Locked page per line id (needs `id` on the lines): numbers and A-pages as on screen. */
  pageLock?: Record<string, number>;
  /**
   * Explicit page starts ("12", "12A") by the index of the line that starts
   * each one, for callers without line ids. Wins over `pageLock`.
   */
  pageStarts?: Array<{ lineIndex: number; label: string }>;
  /** The screenplay cover. Prints first, on its own page, only when enabled
   * and carrying content — never invented, never a blank page. */
  titlePage?: ScreenplayTitlePage;
  /** Stands in for a blank cover title, like the editor does. */
  scriptTitle?: string;
  /** Set character cues in bold (off by default, per Hollywood standard). */
  boldCharacters?: boolean;
  /** Print scene numbers in both margins (on by default, like a numbered production draft). */
  showSceneNumbers?: boolean;
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

/** Courier 12pt: 10 pitch, so one column is exactly 7.2pt and 60 columns are 6". */
const COURIER_SIZE = 12;
const COURIER_CHAR_WIDTH = 7.2;
const SCRIPT_LINE_HEIGHT = 12;

/** Type style per element; the columns come from the pagination. */
const LINED_LAYOUT: Record<string, { bold: boolean; upper: boolean }> = {
  scene: { bold: true, upper: true },
  action: { bold: false, upper: false },
  character: { bold: false, upper: true },
  parenthetical: { bold: false, upper: false },
  dialogue: { bold: false, upper: false },
  transition: { bold: false, upper: true },
  shot: { bold: true, upper: true },
};

const FALLBACK_LAYOUT = { bold: false, upper: false };
const SCENE_NUMBER_SIZE = 12;

const drawSceneNumber = (
  ctx: PdfDocumentContext,
  fonts: ScriptFonts,
  page: PDFPage,
  y: number,
  sceneNumber: string,
  side: 'left' | 'right',
): void => {
  const label = fonts.clean(sceneNumber);
  const x =
    side === 'left'
      ? ctx.margins.left - fonts.bold.widthOfTextAtSize(label, SCENE_NUMBER_SIZE) - 8
      : ctx.margins.left + ctx.contentWidth + 8;
  page.drawText(label, { x, y, size: SCENE_NUMBER_SIZE, font: fonts.bold });
};

/** The revision asterisk, in the right margin beside the changed line. */
const drawRevisionMark = (ctx: PdfDocumentContext, page: PDFPage, baseline: number): void => {
  page.drawText('*', {
    x: ctx.margins.left + ctx.contentWidth + 22,
    y: baseline,
    size: 12,
    font: ctx.bold,
  });
};

const layoutFor = (type: string | undefined): { bold: boolean; upper: boolean } =>
  (type !== undefined ? LINED_LAYOUT[type] : undefined) ?? FALLBACK_LAYOUT;

/**
 * Page one's title line when no cover prints: production, "Screenplay" and the
 * scope line, small, in the top margin — the body keeps all of its lines so
 * the pages match the ones the app counts.
 */
const drawSlimHeader = (
  ctx: PdfDocumentContext,
  fonts: ScriptFonts,
  page: PDFPage,
  input: Pick<LinedScriptPdfInput, 'productionTitle' | 'subtitle' | 'lines'>,
  logo: PdfHeaderLogo | null,
): void => {
  const top = ctx.pageHeight - 30;
  const logoHeight = logo ? Math.min(24, logo.height) : 0;
  const logoWidth = logo ? (logo.width * logoHeight) / Math.max(1, logo.height) : 0;
  const textWidth = ctx.contentWidth - (logo ? logoWidth + 8 : 0) - 48;
  page.drawText(fonts.clean(input.productionTitle), {
    x: ctx.margins.left,
    y: top - 9,
    size: 10,
    font: ctx.bold,
    color: rgb(0.1, 0.1, 0.1),
    maxWidth: textWidth,
  });
  const subtitle = input.subtitle ?? `${input.lines.length} line${input.lines.length === 1 ? '' : 's'}`;
  page.drawText(fonts.clean(`Screenplay${subtitle.trim() ? ` · ${subtitle}` : ''}`), {
    x: ctx.margins.left,
    y: top - 20,
    size: 8,
    font: ctx.regular,
    color: rgb(0.35, 0.35, 0.35),
    maxWidth: textWidth,
  });
  if (logo) {
    page.drawImage(logo.image, {
      x: ctx.margins.left + ctx.contentWidth - logoWidth,
      y: top - logoHeight,
      width: logoWidth,
      height: logoHeight,
    });
  }
};

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
  const clean = fonts.clean(text);
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
    page.drawText(fonts.clean(line), { x: ctx.margins.left, y: leftY, size: COURIER_SIZE, font: fonts.regular });
    leftY -= smallGap;
  }
  if (cover.copyright) {
    if (cover.contact.length > 0) leftY -= smallGap;
    page.drawText(fonts.clean(cover.copyright), { x: ctx.margins.left, y: leftY, size: COURIER_SIZE, font: fonts.regular });
  }
  let rightY = bottomY;
  const drawRight = (text: string, bold = false): void => {
    const clean = fonts.clean(text);
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
    page.drawText(fonts.clean(cover.notes), {
      x: ctx.margins.left,
      y: ctx.margins.bottom + SCRIPT_LINE_HEIGHT,
      size: COURIER_SIZE,
      font: fonts.regular,
    });
  }
};

/** Render the lined screenplay and return the finished PDF bytes. */
export const createLinedScriptPdf = async (input: LinedScriptPdfInput): Promise<Uint8Array> => {
  const layout = screenplayLayoutOptions(input.layout);
  const ctx = await createPdfDocument({
    title: `Screenplay - ${input.productionTitle}`,
    subject: 'Screenplay',
    pageSize: input.pageSize ?? (layout.paper === 'a4' ? 'A4' : 'Letter'),
    orientation: input.orientation ?? 'portrait',
    // Hollywood margins: 1.5" left / 1" right leaves exactly 6" of text,
    // which at Courier 12pt is the classic 60-column grid.
    marginsPt: { left: 108, right: 72, top: 72, bottom: 72 },
    productionTitle: input.productionTitle,
    generatedAt: input.generatedAt,
    draft: input.draft ?? input.isDraft ?? false,
    confidentialityLine: input.confidentialityLine,
  });
  const fonts = await embedScriptFonts(ctx.doc, [
    ...input.lines.map((line) => line.text), input.productionTitle, input.scriptTitle ?? '', input.subtitle ?? '',
    input.confidentialityLine ?? '', ctx.draftText ?? '', ...Object.values(input.titlePage ?? {}).filter((v): v is string => typeof v === 'string'),
  ]);
  if (fonts.regular.name !== "Courier") { ctx.regular = fonts.regular; ctx.bold = fonts.bold; ctx.sanitizeText = fonts.clean; }
  const logo = await embedProductionLogoPng(ctx.doc, input.logoPngBytes);

  const coverPrinted =
    input.titlePage?.enabled === true && hasTitlePageContent(input.titlePage, input.scriptTitle);
  if (coverPrinted) {
    drawTitlePageCover(ctx, fonts, addPdfPage(ctx), input);
  }

  if (input.lines.length === 0) {
    const page = addPdfPage(ctx);
    const headerY = coverPrinted
      ? ctx.contentTop
      : drawDocumentHeader(ctx, page, ctx.contentTop, {
          productionTitle: input.productionTitle,
          documentTitle: 'Screenplay',
          subtitle: input.subtitle ?? '0 lines',
          logo,
        });
    page.drawText(fonts.clean('No script lines yet.'), {
      x: ctx.margins.left,
      y: headerY - 12,
      size: COURIER_SIZE,
      font: fonts.regular,
    });
    return finalizePdfDocument(ctx);
  }

  // The same pages the app counts eighths and locks pages on.
  const anchors = input.pageStarts?.length
    ? new Map(input.pageStarts.map((start) => [start.lineIndex, start.label] as const))
    : undefined;
  const printLines = input.lines.map((line) => layoutFor(line.type).upper || (layout.multicam && line.type === 'action') ? uppercaseScriptText(line) : line);
  const pagination = paginateScreenplay(
    printLines.map((line, index) => ({
      id: line.id ?? `pdf-line-${index}`,
      text: line.text,
      ...(line.type ? { type: line.type } : {}),
      ...(line.omitted ? { omitted: true } : {}),
      ...(line.dual ? { dual: true } : {}),
      ...(line.sceneNumber ? { sceneNumber: line.sceneNumber } : {}),
    })),
    {
      paper: layout.paper,
      autoContd: layout.autoContd,
      multicam: layout.multicam,
      sceneContinued: layout.sceneContinued,
      ...(input.pageLock && !anchors ? { lock: input.pageLock } : {}),
      ...(anchors ? { anchors } : {}),
    },
  );
  const numberedPlainly = !anchors && !(input.pageLock && Object.keys(input.pageLock).length > 0);

  // Scene numbers as printed: the heading's own, else its position.
  const sceneNumberAt = new Map<number, string>();
  let ordinal = 0;
  input.lines.forEach((line, index) => {
    if (line.type !== 'scene') return;
    ordinal += 1;
    sceneNumberAt.set(index, line.sceneNumber || String(ordinal));
  });
  const showNumbers = input.showSceneNumbers !== false;
  const bodyTop = ctx.pageHeight - ctx.margins.top;
  const baselineOf = (row: number) => bodyTop - SCRIPT_LINE_HEIGHT * (row + 1) + 3;

  const sourceCursors = new Map<number, number>();
  pagination.pages.forEach((laid, pageIndex) => {
    const page = addPdfPage(ctx);
    if (pageIndex === 0 && !coverPrinted) {
      // Without a cover, a slim title line in the top margin names the
      // production; the body keeps every one of its lines.
      drawSlimHeader(ctx, fonts, page, input, logo);
    }
    // Page numbers top right from page 2 on; locked pages always say theirs.
    if (!(numberedPlainly && pageIndex === 0)) {
      const text = fonts.clean(`${laid.label}.`);
      page.drawText(text, {
        x: ctx.margins.left + ctx.contentWidth - fonts.regular.widthOfTextAtSize(text, COURIER_SIZE),
        y: ctx.pageHeight - 36 - COURIER_SIZE + 3,
        size: COURIER_SIZE,
        font: fonts.regular,
      });
    }
    for (const line of laid.lines) {
      const source = printLines[line.index];
      const style = layoutFor(line.type);
      const omitted = line.kind === 'omitted';
      const bold =
        omitted ||
        (line.kind === 'body' && style.bold) ||
        (line.type === 'character' && line.kind !== 'more' && input.boldCharacters === true);
      // Multi-camera scripts set their action in capitals.
      const upper = line.kind === 'body' && (style.upper || (layout.multicam && line.type === 'action'));
      const text = fonts.clean(`${upper ? line.text.toUpperCase() : line.text}${line.suffix ?? ''}`);
      const y = baselineOf(line.row);
      if (text) {
        let x = ctx.margins.left + line.col * COURIER_CHAR_WIDTH;
        if (line.kind === 'body' && source?.styles?.length) {
          const start = source.text.indexOf(line.text, sourceCursors.get(line.index) ?? 0);
          if (start < 0) throw new Error('Cannot map screenplay formatting onto the printed page.');
          const spans = source.styles.map((s) => ({ ...s, start: s.start - start, end: s.end - start }));
          for (const run of styleRuns(line.text, spans)) {
            const value = fonts.clean(upper ? run.text.toUpperCase() : run.text);
            const font = run.italic ? (bold || run.bold ? fonts.boldItalic : fonts.italic) : bold || run.bold ? fonts.bold : fonts.regular;
            page.drawText(value, { x, y, size: COURIER_SIZE, font });
            const width = font.widthOfTextAtSize(value, COURIER_SIZE);
            if (run.underline) page.drawLine({ start: { x, y: y - 1.5 }, end: { x: x + width, y: y - 1.5 }, thickness: 0.6 });
            x += width;
          }
          if (line.suffix) page.drawText(fonts.clean(line.suffix), { x, y, size: COURIER_SIZE, font: bold ? fonts.bold : fonts.regular });
          sourceCursors.set(line.index, start + line.text.length);
        } else {
          page.drawText(text, { x, y, size: COURIER_SIZE, font: bold ? fonts.bold : fonts.regular });
        }
      }
      if (showNumbers && line.first && line.type === 'scene') {
        const number = sceneNumberAt.get(line.index);
        if (number) {
          drawSceneNumber(ctx, fonts, page, y, number, 'left');
          drawSceneNumber(ctx, fonts, page, y, number, 'right');
        }
      }
      if (line.kind === 'body' && source?.revised) drawRevisionMark(ctx, page, y);
    }
  });

  return finalizePdfDocument(ctx);
};
